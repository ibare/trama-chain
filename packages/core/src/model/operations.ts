import type {
  ComparisonNode,
  ConditionNode,
  ConditionOperator,
  ConstantNode,
  Edge,
  EdgeId,
  ExpressionNode,
  Model,
  Node,
  NodeId,
  ValueNode,
} from './types.js';
import { makeEdgeId, makeModelId, makeNodeId } from './ids.js';
import { numericValue, type Value } from './value.js';

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

export interface AddValueNodeInput {
  label: string;
  /** numeric ValueNode 편의 입력 — unitId+initialNumber로 NumericValue 자동 생성. */
  unitId: string;
  unitOverride?: ValueNode['unitOverride'];
  /** 시작값(수치). Value 자체를 직접 넘기려면 initialValue 사용. */
  initialNumber?: number;
  /** 명시적 Value를 넘길 때. initialNumber보다 우선. */
  initialValue?: Value;
  position?: { x: number; y: number } | null;
  combiner?: string;
  isFocal?: boolean;
  description?: string | null;
  id?: NodeId;
}

export function addValueNode(model: Model, input: AddValueNodeInput, now?: number): Model {
  const id = input.id ?? makeNodeId();
  const initial: Value =
    input.initialValue ?? numericValue(input.initialNumber ?? 0, input.unitId);
  const node: ValueNode = {
    kind: 'value',
    id,
    label: input.label,
    unitOverride: input.unitOverride,
    initialValue: initial,
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

export interface AddConstantNodeInput {
  label: string;
  /** 명시적 Value. 또는 number를 넘기면 'free' 단위 NumericValue로 wrap. */
  value: Value | number;
  constantKey?: string;
  position?: { x: number; y: number } | null;
  isFocal?: boolean;
  description?: string | null;
  id?: NodeId;
}

export function addConstantNode(
  model: Model,
  input: AddConstantNodeInput,
  now?: number,
): Model {
  const id = input.id ?? makeNodeId();
  const value: Value =
    typeof input.value === 'number' ? numericValue(input.value, 'free') : input.value;
  const node: ConstantNode = {
    kind: 'constant',
    id,
    label: input.label,
    value,
    constantKey: input.constantKey,
    position: input.position ?? null,
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

export interface AddExpressionNodeInput {
  label: string;
  latex: string;
  variables?: string[];
  preset?: { key: string };
  position?: { x: number; y: number } | null;
  isFocal?: boolean;
  description?: string | null;
  id?: NodeId;
}

export function addExpressionNode(
  model: Model,
  input: AddExpressionNodeInput,
  now?: number,
): Model {
  const id = input.id ?? makeNodeId();
  const node: ExpressionNode = {
    kind: 'expression',
    id,
    label: input.label,
    latex: input.latex,
    variables: input.variables ?? [],
    preset: input.preset,
    position: input.position ?? null,
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

export interface AddConditionNodeInput {
  label: string;
  operator?: ConditionOperator;
  /** 비교 임계값. 입력 단위의 raw 수치로 해석된다. */
  threshold?: number;
  position?: { x: number; y: number } | null;
  isFocal?: boolean;
  description?: string | null;
  id?: NodeId;
}

export function addConditionNode(
  model: Model,
  input: AddConditionNodeInput,
  now?: number,
): Model {
  const id = input.id ?? makeNodeId();
  const node: ConditionNode = {
    kind: 'condition',
    id,
    label: input.label,
    operator: input.operator ?? '>',
    threshold: input.threshold ?? 0,
    position: input.position ?? null,
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

export interface AddComparisonNodeInput {
  label: string;
  operator?: ConditionOperator;
  /** 비교 임계값. 입력 단위의 raw 수치로 해석된다. */
  threshold?: number;
  position?: { x: number; y: number } | null;
  isFocal?: boolean;
  description?: string | null;
  id?: NodeId;
}

export function addComparisonNode(
  model: Model,
  input: AddComparisonNodeInput,
  now?: number,
): Model {
  const id = input.id ?? makeNodeId();
  const node: ComparisonNode = {
    kind: 'comparison',
    id,
    label: input.label,
    operator: input.operator ?? '>',
    threshold: input.threshold ?? 0,
    position: input.position ?? null,
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

/** distributive union patch — 노드 종류별 필드를 동시에 받을 수 있게. */
export type NodePatch = Node extends infer N
  ? N extends Node
    ? Partial<Omit<N, 'id' | 'kind'>>
    : never
  : never;

export function updateNode(
  model: Model,
  id: NodeId,
  patch: NodePatch,
  now?: number,
): Model {
  const existing = model.nodes[id];
  if (!existing) return model;
  const next = { ...existing, ...patch, id, kind: existing.kind } as Node;
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
  slotIndex?: number;
  sourceSlotIndex?: number;
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
    slotIndex: input.slotIndex,
    sourceSlotIndex: input.sourceSlotIndex,
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

