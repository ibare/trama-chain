import type { Edge, EdgeId, Model, Node, NodeId } from './types.js';
import { makeEdgeId, makeModelId, makeNodeId } from './ids.js';

export function createEmptyModel(now: number = Date.now()): Model {
  return {
    schemaVersion: '1',
    id: makeModelId(),
    question: null,
    execution: { steps: 1, stepUnit: null },
    nodes: {},
    edges: {},
    nodeOrder: [],
    edgeOrder: [],
    createdAt: now,
    updatedAt: now,
  };
}

function touch(model: Model, now: number = Date.now()): Model {
  return { ...model, updatedAt: now };
}

export interface AddNodeInput {
  label: string;
  unitId: string;
  unitOverride?: Node['unitOverride'];
  initialValue: number;
  position?: { x: number; y: number } | null;
  combiner?: string;
  isFocal?: boolean;
  description?: string | null;
  id?: NodeId;
}

export function addNode(model: Model, input: AddNodeInput, now?: number): Model {
  const id = input.id ?? makeNodeId();
  const node: Node = {
    id,
    label: input.label,
    unitId: input.unitId,
    unitOverride: input.unitOverride,
    initialValue: input.initialValue,
    position: input.position ?? null,
    combiner: input.combiner ?? 'sum',
    isFocal: input.isFocal ?? false,
    description: input.description ?? null,
  };
  return touch(
    {
      ...model,
      nodes: { ...model.nodes, [id]: node },
      nodeOrder: [...model.nodeOrder, id],
    },
    now,
  );
}

export function updateNode(
  model: Model,
  id: NodeId,
  patch: Partial<Omit<Node, 'id'>>,
  now?: number,
): Model {
  const existing = model.nodes[id];
  if (!existing) return model;
  const next: Node = { ...existing, ...patch, id };
  return touch(
    {
      ...model,
      nodes: { ...model.nodes, [id]: next },
    },
    now,
  );
}

export function removeNode(model: Model, id: NodeId, now?: number): Model {
  if (!model.nodes[id]) return model;
  const { [id]: _, ...restNodes } = model.nodes;
  const affectedEdges = Object.values(model.edges)
    .filter((e) => e.from === id || e.to === id)
    .map((e) => e.id);
  const nextEdges = { ...model.edges };
  for (const eid of affectedEdges) delete nextEdges[eid];
  return touch(
    {
      ...model,
      nodes: restNodes,
      nodeOrder: model.nodeOrder.filter((nid) => nid !== id),
      edges: nextEdges,
      edgeOrder: model.edgeOrder.filter((eid) => !affectedEdges.includes(eid)),
    },
    now,
  );
}

export interface AddEdgeInput {
  from: NodeId;
  to: NodeId;
  shape: Edge['shape'];
  inverted?: boolean;
  lag?: Edge['lag'];
  description?: string | null;
  id?: EdgeId;
}

export function addEdge(model: Model, input: AddEdgeInput, now?: number): Model {
  const id = input.id ?? makeEdgeId();
  const edge: Edge = {
    id,
    from: input.from,
    to: input.to,
    shape: input.shape,
    inverted: input.inverted ?? false,
    lag: input.lag ?? 0,
    description: input.description ?? null,
  };
  return touch(
    {
      ...model,
      edges: { ...model.edges, [id]: edge },
      edgeOrder: [...model.edgeOrder, id],
    },
    now,
  );
}

export function updateEdge(
  model: Model,
  id: EdgeId,
  patch: Partial<Omit<Edge, 'id'>>,
  now?: number,
): Model {
  const existing = model.edges[id];
  if (!existing) return model;
  const next: Edge = { ...existing, ...patch, id };
  return touch({ ...model, edges: { ...model.edges, [id]: next } }, now);
}

export function removeEdge(model: Model, id: EdgeId, now?: number): Model {
  if (!model.edges[id]) return model;
  const { [id]: _, ...rest } = model.edges;
  return touch(
    {
      ...model,
      edges: rest,
      edgeOrder: model.edgeOrder.filter((eid) => eid !== id),
    },
    now,
  );
}

export function setExecution(
  model: Model,
  execution: Partial<Model['execution']>,
  now?: number,
): Model {
  return touch(
    { ...model, execution: { ...model.execution, ...execution } },
    now,
  );
}

export function setQuestion(model: Model, question: string | null, now?: number): Model {
  return touch({ ...model, question }, now);
}

export function hasFeedbackEdges(model: Model): boolean {
  for (const id of model.edgeOrder) {
    const e = model.edges[id];
    if (e && e.lag === 1) return true;
  }
  return false;
}
