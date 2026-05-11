import type { Edge, Model, NodeId } from '../model/index.js';
import { InstantaneousCycleError } from './errors.js';

export interface InstantaneousTopology {
  /** lag=0 엣지만으로 본 그래프의 위상 순서 */
  order: NodeId[];
  /** target → incoming lag=0 edges */
  incomingByTarget: Map<NodeId, Edge[]>;
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
  const outgoingByTarget = new Map<NodeId, NodeId[]>(); // for kahn
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
    outgoingByTarget.get(e.from)!.push(e.to);
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
    for (const next of outgoingByTarget.get(cur) ?? []) {
      const d = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (order.length < nodes.length) {
    // 순환에 포함된 노드 하나를 찾아서 경로 추적
    const remaining = nodes.filter((n) => !order.includes(n));
    const path = traceCycle(remaining, model);
    throw new InstantaneousCycleError(path);
  }

  return { order, incomingByTarget, feedbackEdges };
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
