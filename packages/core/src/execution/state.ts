import type { Model, NodeId } from '../model/index.js';
import { defaultNodeKindRegistry, type NodeKindRegistry } from './kinds.js';

/**
 * 실행 시점의 노드 값들. *모델과 분리* — 모델은 초기값/구조의 source of truth고,
 * 이 state는 propagation/iteration이 만들어내는 derived view.
 *
 * validNodes는 "출력으로 내보낼 수 있는" 노드 집합. 노드 종류별 디스크립터의
 * `initialValid`가 초기 포함 여부를, propagate 훅이 이후 갱신을 결정한다.
 */
export interface ExecutionState {
  values: Record<NodeId, number>;
  validNodes: Set<NodeId>;
}

export function initializeFromInitialValues(
  model: Model,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
): ExecutionState {
  const values: Record<NodeId, number> = {};
  const validNodes = new Set<NodeId>();
  for (const nid of model.nodeOrder) {
    const node = model.nodes[nid];
    if (!node) continue;
    const desc = registry.forNode(node);
    if (!desc) continue;
    const v = desc.initialValue(node);
    if (typeof v === 'number') values[nid] = v;
    if (desc.initialValid(node)) validNodes.add(nid);
  }
  return { values, validNodes };
}

export function getNodeValue(state: ExecutionState, id: NodeId): number {
  return state.values[id] ?? 0;
}

export function isNodeValid(state: ExecutionState, id: NodeId): boolean {
  return state.validNodes.has(id);
}
