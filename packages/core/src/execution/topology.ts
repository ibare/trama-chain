import { outputKey } from './state.js';
import type { Edge, Model, NodeId } from '../model/index.js';
import { InstantaneousCycleError } from './errors.js';

export interface InstantaneousTopology {
  /** lag=0 엣지만으로 본 그래프의 위상 순서 */
  order: NodeId[];
  /** target → incoming lag=0 edges */
  incomingByTarget: Map<NodeId, Edge[]>;
  /**
   * source → outgoing lag=0 edges. cascade 전파 시 source 슬롯이 바뀐 노드의
   * 다운스트림을 빠르게 찾기 위한 색인. Kahn 정렬 중에 이미 빌드되므로 그대로 노출.
   */
  outgoingByTarget: Map<NodeId, Edge[]>;
  /**
   * 슬롯 단위 다운스트림 색인. key 는 `outputKey(nodeId, slotIndex)`. 분기 노드
   * (Condition 등) 의 한 슬롯만 변경된 cascade 가 *해당 슬롯에 연결된 엣지의
   * target* 만 큐에 넣게 한다 — 다른 슬롯에 연결된 다운스트림은 영향 받지 않음.
   */
  outgoingBySourceSlot: Map<string, Edge[]>;
  /**
   * 위상순서에서의 노드 인덱스. cascade BFS 의 priority queue 가 다운스트림을
   * "topology 가 앞선 노드 먼저" 처리하도록 비교 키로 사용한다. 다이아몬드
   * 토폴로지에서 같은 자손이 두 경로로 큐에 들어와도 한 번만 recompute 되게.
   */
  orderIndex: Map<NodeId, number>;
  /** lag=1 (feedback) 엣지들 */
  feedbackEdges: Edge[];
}

/**
 * lag=0 엣지로만 구성된 instantaneous 그래프에 대해 Kahn 위상 정렬.
 * 순환 발견 시 InstantaneousCycleError throw.
 * Feedback (lag=1) 엣지는 시간 차원 사이클이므로 검사 대상 아님.
 */
export function buildTopology(model: Model): InstantaneousTopology {
  const nodes = model.nodeOrder;
  const incomingByTarget = new Map<NodeId, Edge[]>();
  const outgoingByTarget = new Map<NodeId, Edge[]>();
  const outgoingBySourceSlot = new Map<string, Edge[]>();
  const inDegree = new Map<NodeId, number>();
  const feedbackEdges: Edge[] = [];

  for (const nid of nodes) {
    incomingByTarget.set(nid, []);
    outgoingByTarget.set(nid, []);
    inDegree.set(nid, 0);
  }

  for (const eid of model.edgeOrder) {
    const e = model.edges[eid];
    if (!e) continue;
    if (e.lag === 1) {
      feedbackEdges.push(e);
      continue;
    }
    // lag=0 only
    if (!incomingByTarget.has(e.to) || !inDegree.has(e.to)) continue;
    incomingByTarget.get(e.to)!.push(e);
    outgoingByTarget.get(e.from)!.push(e);
    const slotKey = outputKey(e.from, e.sourceSlotIndex ?? 0);
    const slotList = outgoingBySourceSlot.get(slotKey) ?? [];
    slotList.push(e);
    outgoingBySourceSlot.set(slotKey, slotList);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  // Kahn
  const order: NodeId[] = [];
  const queue: NodeId[] = [];
  for (const nid of nodes) {
    if ((inDegree.get(nid) ?? 0) === 0) queue.push(nid);
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const edge of outgoingByTarget.get(cur) ?? []) {
      const d = (inDegree.get(edge.to) ?? 0) - 1;
      inDegree.set(edge.to, d);
      if (d === 0) queue.push(edge.to);
    }
  }

  if (order.length < nodes.length) {
    // 순환에 포함된 노드 하나를 찾아서 경로 추적
    const remaining = nodes.filter((n) => !order.includes(n));
    const path = traceCycle(remaining, model);
    throw new InstantaneousCycleError(path);
  }

  const orderIndex = new Map<NodeId, number>();
  for (let i = 0; i < order.length; i++) {
    orderIndex.set(order[i]!, i);
  }

  return {
    order,
    incomingByTarget,
    outgoingByTarget,
    outgoingBySourceSlot,
    orderIndex,
    feedbackEdges,
  };
}

function traceCycle(remaining: NodeId[], model: Model): NodeId[] {
  if (remaining.length === 0) return [];
  const start = remaining[0]!;
  const path: NodeId[] = [];
  const visited = new Set<NodeId>();
  let cur: NodeId = start;
  while (!visited.has(cur)) {
    visited.add(cur);
    path.push(cur);
    const next = findLag0OutgoingInSet(cur, remaining, model);
    if (!next) break;
    cur = next;
  }
  path.push(cur);
  return path;
}

function findLag0OutgoingInSet(
  from: NodeId,
  set: NodeId[],
  model: Model,
): NodeId | null {
  const setView = new Set(set);
  for (const eid of model.edgeOrder) {
    const e = model.edges[eid];
    if (!e || e.lag !== 0) continue;
    if (e.from === from && setView.has(e.to)) return e.to;
  }
  return null;
}
