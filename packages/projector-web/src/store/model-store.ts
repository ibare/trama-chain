import { create } from 'zustand';
import {
  OperationLog,
  addConditionalNode as addConditionalNodeOp,
  addConstantNode as addConstantNodeOp,
  addEdge as addEdgeOp,
  addExpressionNode as addExpressionNodeOp,
  addFunctionNode as addFunctionNodeOp,
  addValueNode as addValueNodeOp,
  buildTopology,
  createEmptyModel,
  executeModel,
  getFunctionSlotOccupancy,
  hasFeedbackEdges,
  initializeFromInitialValues,
  isConditionalNode,
  isFunctionNode,
  modelToDocument,
  outputKey,
  propagateOneStep,
  recomputeNode,
  removeEdge as removeEdgeOp,
  removeNode as removeNodeOp,
  serializeTrama,
  setExecution as setExecutionOp,
  setQuestion as setQuestionOp,
  updateEdge as updateEdgeOp,
  updateNode as updateNodeOp,
} from '@trama/core';
import type {
  AddConditionalNodeInput,
  AddConstantNodeInput,
  AddEdgeInput,
  AddExpressionNodeInput,
  AddFunctionNodeInput,
  AddValueNodeInput,
  Edge,
  EdgeId,
  ExecutionState,
  Model,
  Node,
  NodeId,
  NodePatch,
  Operation,
  OperationKind,
} from '@trama/core';
import { tokens } from '@trama/tokens';
import { combinerRegistry, functionRegistry, shapeRegistry } from './registries.js';
import { fizzexExpressionEvaluator } from '../expression/fizzex-evaluator.js';
import {
  setArrivalHandler,
  spawnPulse,
  type Pulse,
} from '../pulse/pulse-registry.js';
import { triggerNodeFlash } from '../pulse/node-flash-registry.js';

const STEP_TICK_MS = parseFloat(tokens.motion.durationStepTick);

export interface ModelStore {
  model: Model;
  /** propagation/iteration 결과의 최종 상태(가장 마지막 timestep). UI는 이걸 본다. */
  executionState: ExecutionState;
  /** N-step trajectory (steps>1일 때만 의미). */
  trajectory: ExecutionState[];
  /** 재생 중이면 현재 step index(0..N-1), 아니면 null. */
  playbackStep: number | null;
  log: OperationLog;
  canUndo: boolean;
  canRedo: boolean;

  // commands ---------------------------------------------------------------
  setModel: (next: Model) => void;
  recompute: () => void;
  loadFromJson: (json: string) => boolean;
  exportToJson: () => string;

  addNode: (input: AddValueNodeInput, opKind?: OperationKind, label?: string) => Node;
  addFunctionNode: (
    input: AddFunctionNodeInput,
    opKind?: OperationKind,
    label?: string,
  ) => Node | null;
  addConstantNode: (
    input: AddConstantNodeInput,
    opKind?: OperationKind,
    label?: string,
  ) => Node;
  addConditionalNode: (
    input: AddConditionalNodeInput,
    opKind?: OperationKind,
    label?: string,
  ) => Node;
  addExpressionNode: (
    input: AddExpressionNodeInput,
    opKind?: OperationKind,
    label?: string,
  ) => Node;
  updateNode: (id: NodeId, patch: NodePatch, kind?: OperationKind, label?: string) => void;
  removeNode: (id: NodeId) => void;

  addEdge: (input: AddEdgeInput) => Edge | null;
  updateEdge: (id: EdgeId, patch: Partial<Omit<Edge, 'id'>>, kind?: OperationKind, label?: string) => void;
  removeEdge: (id: EdgeId) => void;

  setQuestion: (q: string | null) => void;
  setExecution: (e: Partial<Model['execution']>) => void;

  /** 노드 값 스크럽: 같은 노드 연속 스크럽을 한 undo 단위로 묶는다. */
  scrubInitialValue: (id: NodeId, nextValue: number) => void;

  /** trajectory를 step-by-step 애니메이션 재생 (§ 11.7). feedback 모델에서만 의미. */
  play: () => void;

  undo: () => void;
  redo: () => void;
}

function record(
  state: ModelStore,
  before: Model,
  after: Model,
  kind: OperationKind,
  label: string,
  meta?: Operation['meta'],
  coalesce = false,
): void {
  const op: Operation = { kind, label, before, after, meta };
  if (coalesce) {
    const ok = state.log.coalesceWithLast(op);
    if (!ok) state.log.record(op);
  } else {
    state.log.record(op);
  }
}

/** Node patch가 propagation 결과에 영향을 줄 수 있는 필드를 포함하는지. */
function patchAffectsValues(patch: NodePatch): boolean {
  const p = patch as Record<string, unknown>;
  return (
    'initialValue' in p ||
    'value' in p ||
    'unitId' in p ||
    'unitOverride' in p ||
    'combiner' in p ||
    'isFocal' in p ||
    'functionKey' in p ||
    'outputUnitId' in p ||
    'outputUnitOverride' in p ||
    'operator' in p
  );
}

/**
 * patch가 *오직* "노드 자체의 출력값"만 바꾸는 단순 변경인지.
 * true면 펄스 경로로 전파 가능 (구조적 변경이 아니므로 그래프 위상이 유지된다).
 * false면 unit/combiner/function 등 구조적 의미 변경 — 전체 재계산이 안전.
 */
function patchIsSimpleValueChange(patch: NodePatch): boolean {
  const keys = Object.keys(patch);
  if (keys.length === 0) return false;
  for (const k of keys) {
    if (k !== 'initialValue' && k !== 'value' && k !== 'label' && k !== 'position') {
      return false;
    }
  }
  return 'initialValue' in patch || 'value' in patch;
}

function computeExecutionState(model: Model): {
  executionState: ExecutionState;
  trajectory: ExecutionState[];
} {
  try {
    const traj = executeModel(model, {
      shapeRegistry,
      combinerRegistry,
      functionRegistry,
      expressionEvaluator: fizzexExpressionEvaluator,
    });
    return { executionState: traj[traj.length - 1]!, trajectory: traj };
  } catch {
    // 사이클 등 에러 시 초기값으로 폴백
    const init = initializeFromInitialValues(model);
    return { executionState: init, trajectory: [init] };
  }
}

const initial = createEmptyModel();
const initialExec = computeExecutionState(initial);

let activePlaybackToken = 0;

/**
 * 주어진 source 노드의 lag=0 outgoing edges에 대해 펄스를 spawn.
 * lag=1 feedback 엣지는 제외 (방식 가). 출력 슬롯이 invalid면 skip.
 * playback 중이면 spawn 자체를 막는다.
 */
function spawnOutgoingPulses(
  model: Model,
  executionState: ExecutionState,
  sourceNodeId: NodeId,
): void {
  if (useModelStore.getState().playbackStep !== null) return;
  for (const eid of model.edgeOrder) {
    const e = model.edges[eid];
    if (!e || e.from !== sourceNodeId) continue;
    if ((e.lag ?? 0) !== 0) continue;
    const slot = e.sourceSlotIndex ?? 0;
    if (!executionState.validOutputs.has(outputKey(sourceNodeId, slot))) continue;
    const sourceValue = executionState.values[sourceNodeId];
    if (typeof sourceValue !== 'number') continue;
    spawnPulse({
      edgeId: eid,
      sourceNodeId,
      sourceSlotIndex: slot,
      targetNodeId: e.to,
      sourceValue,
    });
  }
}

/**
 * 펄스 도착 처리.
 * 1. target 재계산 (펄스의 source 값을 sourceValueOverrides로 박제)
 * 2. flash 트리거
 * 3. 결과값이 *바뀐 경우에만* outgoing edges로 펄스 전파
 *
 * playback 중에는 무시 (재생 모드와 충돌 방지).
 */
function handlePulseArrival(pulse: Pulse): void {
  const { model, executionState, playbackStep } = useModelStore.getState();
  if (playbackStep !== null) return;

  // target 또는 source 노드가 사라졌다면 무시 (편집 중 race).
  if (!model.nodes[pulse.targetNodeId] || !model.nodes[pulse.sourceNodeId]) return;

  const result = recomputeNode(pulse.targetNodeId, executionState, model, {
    shapeRegistry,
    combinerRegistry,
    functionRegistry,
    expressionEvaluator: fizzexExpressionEvaluator,
    sourceValueOverrides: { [pulse.sourceNodeId]: pulse.sourceValue },
  });

  const prevValue = executionState.values[pulse.targetNodeId];
  const wasValid = executionState.validOutputs.has(outputKey(pulse.targetNodeId, 0));
  const isValid = result.isValid;
  const valueChanged =
    result.newValue !== undefined && result.newValue !== prevValue;
  const validityChanged = wasValid !== isValid;

  useModelStore.setState((s) => {
    const newValues: Record<NodeId, number> = { ...s.executionState.values };
    if (result.newValue !== undefined) newValues[pulse.targetNodeId] = result.newValue;
    return {
      executionState: {
        values: newValues,
        validOutputs: result.validOutputs,
      },
    };
  });

  triggerNodeFlash(pulse.targetNodeId);

  // 값이 실제 바뀐 경우만 하류 전파. validity만 바뀌었어도 전파 (출력이 켜졌다/꺼졌다는 변화).
  if ((valueChanged || validityChanged) && result.newValue !== undefined) {
    const latest = useModelStore.getState();
    spawnOutgoingPulses(latest.model, latest.executionState, pulse.targetNodeId);
  }
}

setArrivalHandler(handlePulseArrival);

export const useModelStore = create<ModelStore>((set, get) => ({
  model: initial,
  executionState: initialExec.executionState,
  trajectory: initialExec.trajectory,
  playbackStep: null,
  log: new OperationLog(),
  canUndo: false,
  canRedo: false,

  setModel: (next) => {
    const exec = computeExecutionState(next);
    set({ model: next, ...exec });
  },

  recompute: () => {
    const exec = computeExecutionState(get().model);
    set(exec);
  },

  loadFromJson: (json) => {
    try {
      // dynamic require to avoid circular; we use serializeTrama for export only.
      // Parsing is done by host (apps/web) via @trama/core; here we accept already-validated JSON string.
      // Simplification: try to JSON.parse and then documentToModel via dynamic import is overkill;
      // expose this method later when apps/web uses it.
      const obj = JSON.parse(json);
      // Minimal validation; full validation happens in apps/web layer.
      if (typeof obj !== 'object' || obj == null) return false;
      // Best-effort: trust caller to pass a serialized TramaDocument-shaped object.
      // We avoid importing parser here to keep store narrow.
      return false; // Implemented in apps/web via core parser.
    } catch {
      return false;
    }
  },

  exportToJson: () => {
    return serializeTrama(modelToDocument(get().model));
  },

  addNode: (input, opKind = 'add-node', label = '노드 추가') => {
    const before = get().model;
    const after = addValueNodeOp(before, input);
    const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
    const node = after.nodes[newId]!;
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, opKind, label, { nodeId: newId, node });
      return {
        model: after,
        ...exec,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
    return node;
  },

  addConstantNode: (input, opKind = 'add-node', label = '상수 노드 추가') => {
    const before = get().model;
    const after = addConstantNodeOp(before, input);
    const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
    const node = after.nodes[newId]!;
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, opKind, label, { nodeId: newId, node });
      return {
        model: after,
        ...exec,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
    return node;
  },

  addConditionalNode: (input, opKind = 'add-node', label = '조건 노드 추가') => {
    const before = get().model;
    const after = addConditionalNodeOp(before, input);
    const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
    const node = after.nodes[newId]!;
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, opKind, label, { nodeId: newId, node });
      return {
        model: after,
        ...exec,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
    return node;
  },

  addExpressionNode: (input, opKind = 'add-node', label = '식 노드 추가') => {
    const before = get().model;
    const after = addExpressionNodeOp(before, input);
    const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
    const node = after.nodes[newId]!;
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, opKind, label, { nodeId: newId, node });
      return {
        model: after,
        ...exec,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
    return node;
  },

  addFunctionNode: (input, opKind = 'add-node', label = '함수 노드 추가') => {
    // functionKey가 레지스트리에 없으면 추가 거부.
    if (!functionRegistry.has(input.functionKey)) return null;
    const before = get().model;
    const after = addFunctionNodeOp(before, input);
    const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
    const node = after.nodes[newId]!;
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, opKind, label, { nodeId: newId, node });
      return {
        model: after,
        ...exec,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
    return node;
  },

  updateNode: (id, patch, kind = 'update-node', label = '노드 수정') => {
    const before = get().model;
    const after = updateNodeOp(before, id, patch);
    if (after === before) return;

    const affectsValues = patchAffectsValues(patch);
    const simpleValue = patchIsSimpleValueChange(patch);
    // 단순 값 변경(initialValue/value 단독)은 펄스 경로로 — executionState는 펄스 도달 시 점진 갱신.
    // 구조적 변경(unit/combiner/function 등)은 전체 재계산.
    const shouldCoalesce = kind === 'move-node' || kind === 'rename-node';
    const playbackActive = get().playbackStep !== null;

    if (simpleValue && !playbackActive) {
      const recomputed = computeExecutionState(after);
      const nextNodeValue =
        'value' in patch && typeof patch.value === 'number'
          ? patch.value
          : 'initialValue' in patch && typeof patch.initialValue === 'number'
            ? patch.initialValue
            : undefined;
      set((s) => {
        record(s, before, after, kind, label, { nodeId: id }, shouldCoalesce);
        const newValues: Record<NodeId, number> = { ...s.executionState.values };
        if (typeof nextNodeValue === 'number') newValues[id] = nextNodeValue;
        const newValid = new Set(s.executionState.validOutputs);
        newValid.add(outputKey(id, 0));
        return {
          model: after,
          executionState: { values: newValues, validOutputs: newValid },
          trajectory: recomputed.trajectory,
          canUndo: s.log.canUndo(),
          canRedo: s.log.canRedo(),
        };
      });
      triggerNodeFlash(id);
      const latest = get();
      spawnOutgoingPulses(latest.model, latest.executionState, id);
      return;
    }

    const exec = affectsValues ? computeExecutionState(after) : null;
    set((s) => {
      record(s, before, after, kind, label, { nodeId: id }, shouldCoalesce);
      return {
        model: after,
        ...(exec ?? {}),
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
  },

  removeNode: (id) => {
    const before = get().model;
    const after = removeNodeOp(before, id);
    if (after === before) return;
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, 'remove-node', '노드 삭제', { nodeId: id });
      return {
        model: after,
        ...exec,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
  },

  addEdge: (input) => {
    const before = get().model;
    // 슬롯 검증: target이 FunctionNode면 slotIndex가 유효하고 비어 있어야.
    const targetNode = before.nodes[input.to];
    if (targetNode && isFunctionNode(targetNode)) {
      const def = functionRegistry.get(targetNode.functionKey);
      if (!def) return null;
      const arity = def.slots.length;
      const slot = input.slotIndex;
      if (typeof slot !== 'number' || slot < 0 || slot >= arity) return null;
      const occupied = getFunctionSlotOccupancy(before, input.to);
      if (occupied.some((o) => o.slotIndex === slot)) return null;
    }
    // ConditionalNode 입력은 슬롯 0(A), 1(B) 두 칸. 각 슬롯에 하나씩.
    if (targetNode && isConditionalNode(targetNode)) {
      const slot = input.slotIndex;
      if (typeof slot !== 'number' || slot < 0 || slot > 1) return null;
      const occupied = before.edgeOrder
        .map((eid) => before.edges[eid])
        .filter((e) => e && e.to === input.to);
      if (occupied.some((e) => e!.slotIndex === slot)) return null;
    }
    // 사이클 사전 검사: lag=0이면 instantaneous DAG가 유지되는지 확인
    const candidate = addEdgeOp(before, input);
    if ((input.lag ?? 0) === 0) {
      try {
        buildTopology(candidate);
      } catch {
        return null;
      }
    }
    const after = candidate;
    const newId = after.edgeOrder[after.edgeOrder.length - 1]!;
    const edge = after.edges[newId]!;
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, 'add-edge', '엣지 추가', { edgeId: newId, edge });
      return {
        model: after,
        ...exec,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
    return edge;
  },

  updateEdge: (id, patch, kind = 'update-edge', label = '엣지 수정') => {
    const before = get().model;
    const candidate = updateEdgeOp(before, id, patch);
    if (candidate === before) return;
    // lag/to/from/shape 변경이 lag=0 사이클을 만들면 거부
    if ('lag' in patch || 'from' in patch || 'to' in patch) {
      try {
        buildTopology(candidate);
      } catch {
        return;
      }
    }
    const after = candidate;
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, kind, label, { edgeId: id });
      return {
        model: after,
        ...exec,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
  },

  removeEdge: (id) => {
    const before = get().model;
    const after = removeEdgeOp(before, id);
    if (after === before) return;
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, 'remove-edge', '엣지 삭제', { edgeId: id });
      return {
        model: after,
        ...exec,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
  },

  setQuestion: (q) => {
    const before = get().model;
    const after = setQuestionOp(before, q);
    set((s) => {
      record(s, before, after, 'set-question', '질문 변경');
      return { model: after, canUndo: s.log.canUndo(), canRedo: s.log.canRedo() };
    });
  },

  setExecution: (e) => {
    const before = get().model;
    const after = setExecutionOp(before, e);
    if (after === before) return;
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, 'set-execution', '실행 설정 변경');
      return {
        model: after,
        ...exec,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
  },

  scrubInitialValue: (id, nextValue) => {
    const before = get().model;
    const after = updateNodeOp(before, id, { initialValue: nextValue });
    if (after === before) return;
    // 트래잭토리는 playback용으로 갱신해두되, executionState는 펄스 도착 시점에만 변화.
    // 소스 노드 본인의 값은 즉시 갱신 (펄스의 출발 표시) — 하류는 펄스 도달 시 갱신.
    const recomputed = computeExecutionState(after);
    const playbackActive = get().playbackStep !== null;
    set((s) => {
      record(s, before, after, 'scrub-value', '값 변경', { nodeId: id }, true);
      const nextValues: Record<NodeId, number> = playbackActive
        ? s.executionState.values
        : { ...s.executionState.values, [id]: nextValue };
      const nextValid = playbackActive
        ? s.executionState.validOutputs
        : new Set(s.executionState.validOutputs);
      if (!playbackActive) nextValid.add(outputKey(id, 0));
      return {
        model: after,
        executionState: playbackActive
          ? s.executionState
          : { values: nextValues, validOutputs: nextValid },
        trajectory: recomputed.trajectory,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
    if (!playbackActive) {
      triggerNodeFlash(id);
      const latest = get();
      spawnOutgoingPulses(latest.model, latest.executionState, id);
    }
  },

  play: () => {
    const { trajectory } = get();
    if (trajectory.length <= 1) return;
    const token = ++activePlaybackToken;
    trajectory.forEach((s, i) => {
      window.setTimeout(() => {
        if (activePlaybackToken !== token) return;
        const isLast = i === trajectory.length - 1;
        // step 경계에서 값이 바뀐 노드만 flash (방식 2 — 케이블 펄스 없이 노드만 깜빡임)
        const prev = get().executionState;
        for (const nid of Object.keys(s.values)) {
          if (s.values[nid] !== prev.values[nid]) triggerNodeFlash(nid);
        }
        set({ executionState: s, playbackStep: isLast ? null : i });
      }, i * STEP_TICK_MS);
    });
  },

  undo: () => {
    const log = get().log;
    const prev = log.undo();
    if (!prev) return;
    const exec = computeExecutionState(prev);
    set({ model: prev, ...exec, canUndo: log.canUndo(), canRedo: log.canRedo() });
  },

  redo: () => {
    const log = get().log;
    const next = log.redo();
    if (!next) return;
    const exec = computeExecutionState(next);
    set({ model: next, ...exec, canUndo: log.canUndo(), canRedo: log.canRedo() });
  },
}));

/** feedback 엣지 유무는 N-step 컨트롤 표시 결정에 사용. */
export function selectHasFeedback(s: Pick<ModelStore, 'model'>): boolean {
  return hasFeedbackEdges(s.model);
}

/**
 * 외부에서 propagation 결과만 빠르게 가져오는 helper.
 * 실시간 스크럽 중에는 store가 이미 갱신하지만, ad-hoc 미리보기에는 유용.
 */
export function previewPropagation(model: Model): ExecutionState {
  const init = initializeFromInitialValues(model);
  return propagateOneStep(init, model, {
    shapeRegistry,
    combinerRegistry,
    functionRegistry,
  });
}
