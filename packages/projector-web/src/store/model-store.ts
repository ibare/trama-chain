import { create, type StoreApi, type UseBoundStore } from 'zustand';
import {
  OperationLog,
  addConditionalNode as addConditionalNodeOp,
  addConstantNode as addConstantNodeOp,
  addEdge as addEdgeOp,
  addExpressionNode as addExpressionNodeOp,
  addValueNode as addValueNodeOp,
  buildTopology,
  createEmptyModel,
  executeModel,
  hasFeedbackEdges,
  initializeFromInitialValues,
  isConditionalNode,
  isExpressionNode,
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
import { combinerRegistry, shapeRegistry } from './registries.js';
import { fizzexExpressionEvaluator } from '../expression/fizzex-evaluator.js';
import type { PulseRegistry, Pulse } from '../pulse/pulse-registry.js';
import type { NodeFlashRegistry } from '../pulse/node-flash-registry.js';

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

export type ModelStoreInstance = UseBoundStore<StoreApi<ModelStore>>;

export interface ModelStoreDeps {
  pulseRegistry: PulseRegistry;
  nodeFlashRegistry: NodeFlashRegistry;
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
    'latex' in p ||
    'variables' in p ||
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
      expressionEvaluator: fizzexExpressionEvaluator,
    });
    return { executionState: traj[traj.length - 1]!, trajectory: traj };
  } catch {
    const init = initializeFromInitialValues(model);
    return { executionState: init, trajectory: [init] };
  }
}

export function createModelStore({
  pulseRegistry,
  nodeFlashRegistry,
}: ModelStoreDeps): ModelStoreInstance {
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
    if (store.getState().playbackStep !== null) return;
    for (const eid of model.edgeOrder) {
      const e = model.edges[eid];
      if (!e || e.from !== sourceNodeId) continue;
      if ((e.lag ?? 0) !== 0) continue;
      const slot = e.sourceSlotIndex ?? 0;
      if (!executionState.validOutputs.has(outputKey(sourceNodeId, slot))) continue;
      const sourceValue = executionState.values[sourceNodeId];
      if (typeof sourceValue !== 'number') continue;
      pulseRegistry.spawn({
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
    const { model, executionState, playbackStep } = store.getState();
    if (playbackStep !== null) return;

    if (!model.nodes[pulse.targetNodeId] || !model.nodes[pulse.sourceNodeId]) return;

    const result = recomputeNode(pulse.targetNodeId, executionState, model, {
      shapeRegistry,
      combinerRegistry,
      expressionEvaluator: fizzexExpressionEvaluator,
      sourceValueOverrides: { [pulse.sourceNodeId]: pulse.sourceValue },
    });

    const prevValue = executionState.values[pulse.targetNodeId];
    const wasValid = executionState.validOutputs.has(outputKey(pulse.targetNodeId, 0));
    const isValid = result.isValid;
    const valueChanged =
      result.newValue !== undefined && result.newValue !== prevValue;
    const validityChanged = wasValid !== isValid;

    store.setState((s) => {
      const newValues: Record<NodeId, number> = { ...s.executionState.values };
      if (result.newValue !== undefined) newValues[pulse.targetNodeId] = result.newValue;
      return {
        executionState: {
          values: newValues,
          validOutputs: result.validOutputs,
          invalidReasons: s.executionState.invalidReasons,
        },
      };
    });

    nodeFlashRegistry.trigger(pulse.targetNodeId);

    if ((valueChanged || validityChanged) && result.newValue !== undefined) {
      const latest = store.getState();
      spawnOutgoingPulses(latest.model, latest.executionState, pulse.targetNodeId);
    }
  }

  const store = create<ModelStore>((set, get) => ({
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
        const obj = JSON.parse(json);
        if (typeof obj !== 'object' || obj == null) return false;
        return false;
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

    updateNode: (id, rawPatch, kind = 'update-node', label = '노드 수정') => {
      const before = get().model;
      const node = before.nodes[id];
      const patch: NodePatch =
        node &&
        isExpressionNode(node) &&
        typeof (rawPatch as { latex?: unknown }).latex === 'string'
          ? (() => {
              const nextLatex = (rawPatch as { latex: string }).latex;
              const analysis = fizzexExpressionEvaluator.analyze(nextLatex);
              return {
                ...rawPatch,
                variables: [...analysis.required, ...analysis.constants],
              };
            })()
          : rawPatch;
      const after = updateNodeOp(before, id, patch);
      if (after === before) return;

      const affectsValues = patchAffectsValues(patch);
      const simpleValue = patchIsSimpleValueChange(patch);
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
            executionState: {
              values: newValues,
              validOutputs: newValid,
              invalidReasons: s.executionState.invalidReasons,
            },
            trajectory: recomputed.trajectory,
            canUndo: s.log.canUndo(),
            canRedo: s.log.canRedo(),
          };
        });
        nodeFlashRegistry.trigger(id);
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
      const targetNode = before.nodes[input.to];
      if (targetNode && isExpressionNode(targetNode)) {
        const arity = targetNode.variables.length;
        const slot = input.slotIndex;
        if (typeof slot !== 'number' || slot < 0 || slot >= arity) return null;
        const occupied = before.edgeOrder
          .map((eid) => before.edges[eid])
          .filter((e) => e && e.to === input.to);
        if (occupied.some((e) => e!.slotIndex === slot)) return null;
      }
      if (targetNode && isConditionalNode(targetNode)) {
        const slot = input.slotIndex;
        if (typeof slot !== 'number' || slot < 0 || slot > 1) return null;
        const occupied = before.edgeOrder
          .map((eid) => before.edges[eid])
          .filter((e) => e && e.to === input.to);
        if (occupied.some((e) => e!.slotIndex === slot)) return null;
      }
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
            : {
                values: nextValues,
                validOutputs: nextValid,
                invalidReasons: s.executionState.invalidReasons,
              },
          trajectory: recomputed.trajectory,
          canUndo: s.log.canUndo(),
          canRedo: s.log.canRedo(),
        };
      });
      if (!playbackActive) {
        nodeFlashRegistry.trigger(id);
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
          const prev = get().executionState;
          for (const nid of Object.keys(s.values)) {
            if (s.values[nid] !== prev.values[nid]) nodeFlashRegistry.trigger(nid);
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

  pulseRegistry.setArrivalHandler(handlePulseArrival);

  return store;
}

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
  });
}
