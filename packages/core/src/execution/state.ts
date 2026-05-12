import { isValueNode, type Model, type NodeId } from '../model/index.js';

/**
 * 실행 시점의 노드 값들. *모델과 분리* — 모델은 초기값/구조의 source of truth고,
 * 이 state는 propagation/iteration이 만들어내는 derived view.
 *
 * validNodes는 "출력으로 내보낼 수 있는" 노드 집합. ValueNode는 항상 포함되고,
 * FunctionNode는 모든 슬롯이 채워지고 그 source가 모두 valid이며 compute 결과가
 * 유한할 때만 포함된다. UI는 이 set으로 출력 핀 가시성·엣지 점선 처리를 결정.
 */
export interface ExecutionState {
  values: Record<NodeId, number>;
  validNodes: Set<NodeId>;
}

export function initializeFromInitialValues(model: Model): ExecutionState {
  const values: Record<NodeId, number> = {};
  const validNodes = new Set<NodeId>();
  for (const nid of model.nodeOrder) {
    const node = model.nodes[nid];
    if (!node) continue;
    if (isValueNode(node)) {
      values[nid] = node.initialValue;
      validNodes.add(nid);
    }
    // FunctionNode는 초기에는 유효하지 않다. 첫 propagate가 결정.
  }
  return { values, validNodes };
}

export function getNodeValue(state: ExecutionState, id: NodeId): number {
  return state.values[id] ?? 0;
}

export function isNodeValid(state: ExecutionState, id: NodeId): boolean {
  return state.validNodes.has(id);
}
