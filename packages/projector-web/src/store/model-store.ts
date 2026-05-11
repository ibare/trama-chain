import { create } from 'zustand';
import {
  OperationLog,
  addEdge as addEdgeOp,
  addNode as addNodeOp,
  buildTopology,
  createEmptyModel,
  executeModel,
  hasFeedbackEdges,
  initializeFromInitialValues,
  modelToDocument,
  propagateOneStep,
  removeEdge as removeEdgeOp,
  removeNode as removeNodeOp,
  serializeTrama,
  setExecution as setExecutionOp,
  setQuestion as setQuestionOp,
  updateEdge as updateEdgeOp,
  updateNode as updateNodeOp,
} from '@trama/core';
import type {
  AddEdgeInput,
  AddNodeInput,
  Edge,
  EdgeId,
  ExecutionState,
  Model,
  Node,
  NodeId,
  Operation,
  OperationKind,
} from '@trama/core';
import { tokens } from '@trama/tokens';
import { combinerRegistry, shapeRegistry } from './registries.js';

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

  addNode: (input: AddNodeInput, opKind?: OperationKind, label?: string) => Node;
  updateNode: (id: NodeId, patch: Partial<Omit<Node, 'id'>>, kind?: OperationKind, label?: string) => void;
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

function computeExecutionState(model: Model): {
  executionState: ExecutionState;
  trajectory: ExecutionState[];
} {
  try {
    const traj = executeModel(model, { shapeRegistry, combinerRegistry });
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
    const after = addNodeOp(before, input);
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
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, kind, label, { nodeId: id });
      return {
        model: after,
        ...exec,
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
    // *드래그 중* 갱신: 직전 op과 같은 노드 scrub이면 coalesce
    const exec = computeExecutionState(after);
    set((s) => {
      record(s, before, after, 'scrub-value', '값 변경', { nodeId: id }, true);
      return {
        model: after,
        ...exec,
        canUndo: s.log.canUndo(),
        canRedo: s.log.canRedo(),
      };
    });
  },

  play: () => {
    const { trajectory } = get();
    if (trajectory.length <= 1) return;
    const token = ++activePlaybackToken;
    trajectory.forEach((s, i) => {
      window.setTimeout(() => {
        if (activePlaybackToken !== token) return;
        const isLast = i === trajectory.length - 1;
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
  return propagateOneStep(init, model, { shapeRegistry, combinerRegistry });
}
