import type { Model, NodeId } from '../model/index.js';

/**
 * 실행 시점의 노드 값들. *모델과 분리* — 모델은 초기값/구조의 source of truth고,
 * 이 state는 propagation/iteration이 만들어내는 derived view.
 */
export interface ExecutionState {
  values: Record<NodeId, number>;
}

export function initializeFromInitialValues(model: Model): ExecutionState {
  const values: Record<NodeId, number> = {};
  for (const nid of model.nodeOrder) {
    const node = model.nodes[nid];
    if (node) values[nid] = node.initialValue;
  }
  return { values };
}

export function getNodeValue(state: ExecutionState, id: NodeId): number {
  return state.values[id] ?? 0;
}
