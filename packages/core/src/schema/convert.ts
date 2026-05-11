import type { Edge, Model, Node } from '../model/index.js';
import type { TramaDocument, TramaEdge, TramaNode } from './document.js';

export function modelToDocument(model: Model): TramaDocument {
  return {
    trama: '1',
    id: model.id,
    question: model.question,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
    execution: {
      steps: model.execution.steps,
      stepUnit: model.execution.stepUnit,
    },
    nodes: model.nodeOrder
      .map((nid) => model.nodes[nid])
      .filter((n): n is Node => Boolean(n))
      .map(nodeToDoc),
    edges: model.edgeOrder
      .map((eid) => model.edges[eid])
      .filter((e): e is Edge => Boolean(e))
      .map(edgeToDoc),
  };
}

function nodeToDoc(n: Node): TramaNode {
  return {
    id: n.id,
    label: n.label,
    unitId: n.unitId,
    unitOverride: n.unitOverride,
    initialValue: n.initialValue,
    position: n.position,
    combiner: n.combiner,
    isFocal: n.isFocal,
    description: n.description ?? null,
  };
}

function edgeToDoc(e: Edge): TramaEdge {
  return {
    id: e.id,
    from: e.from,
    to: e.to,
    shape: e.shape,
    inverted: e.inverted,
    lag: e.lag,
    description: e.description ?? null,
  };
}

export function documentToModel(doc: TramaDocument): Model {
  const nodes: Record<string, Node> = {};
  const nodeOrder: string[] = [];
  for (const n of doc.nodes) {
    nodes[n.id] = {
      id: n.id,
      label: n.label,
      unitId: n.unitId,
      unitOverride: n.unitOverride,
      initialValue: n.initialValue,
      position: n.position,
      combiner: n.combiner,
      isFocal: n.isFocal,
      description: n.description ?? null,
    };
    nodeOrder.push(n.id);
  }
  const edges: Record<string, Edge> = {};
  const edgeOrder: string[] = [];
  for (const e of doc.edges) {
    edges[e.id] = {
      id: e.id,
      from: e.from,
      to: e.to,
      shape: { kind: e.shape.kind, params: e.shape.params },
      inverted: e.inverted,
      lag: e.lag,
      description: e.description ?? null,
    };
    edgeOrder.push(e.id);
  }
  return {
    schemaVersion: '1',
    id: doc.id,
    question: doc.question,
    execution: { steps: doc.execution.steps, stepUnit: doc.execution.stepUnit },
    nodes,
    edges,
    nodeOrder,
    edgeOrder,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
