import type {
  AverageNode,
  ConditionNode,
  ConstantNode,
  Edge,
  ExpressionNode,
  GeneratorNode,
  LogicGateNode,
  Model,
  Node,
  ObserveNode,
  ValueNode,
} from '../model/index.js';
import {
  isAverageNode,
  isConditionNode,
  isConstantNode,
  isExpressionNode,
  isGeneratorNode,
  isLogicGateNode,
  isObserveNode,
  isValueNode,
} from '../model/index.js';
import type {
  TramaAverageNode,
  TramaConditionNode,
  TramaConstantNode,
  TramaDocument,
  TramaEdge,
  TramaExpressionNode,
  TramaGeneratorNode,
  TramaLogicGateNode,
  TramaNode,
  TramaObserveNode,
  TramaValueNode,
} from './document.js';

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
  if (isValueNode(n)) {
    const doc: TramaValueNode = {
      kind: 'value',
      id: n.id,
      label: n.label,
      unitOverride: n.unitOverride,
      initialValue: n.initialValue,
      position: n.position,
      combiner: n.combiner,
      isFocal: n.isFocal,
      description: n.description ?? null,
      skin: n.skin,
    };
    return doc;
  }
  if (isConstantNode(n)) {
    const doc: TramaConstantNode = {
      kind: 'constant',
      id: n.id,
      label: n.label,
      value: n.value,
      constantKey: n.constantKey,
      position: n.position,
      isFocal: n.isFocal,
      description: n.description ?? null,
    };
    return doc;
  }
  if (isConditionNode(n)) {
    const doc: TramaConditionNode = {
      kind: 'condition',
      id: n.id,
      label: n.label,
      operator: n.operator,
      threshold: n.threshold,
      position: n.position,
      isFocal: n.isFocal,
      description: n.description ?? null,
      displayMode: n.displayMode,
    };
    return doc;
  }
  if (isLogicGateNode(n)) {
    const doc: TramaLogicGateNode = {
      kind: 'logic-gate',
      id: n.id,
      label: n.label,
      operator: n.operator,
      position: n.position,
      isFocal: n.isFocal,
      description: n.description ?? null,
    };
    return doc;
  }
  if (isObserveNode(n)) {
    const doc: TramaObserveNode = {
      kind: 'observe',
      id: n.id,
      label: n.label,
      capacity: n.capacity,
      extraction: n.extraction,
      visualization: n.visualization,
      position: n.position,
      isFocal: n.isFocal,
      description: n.description ?? null,
      displayMode: n.displayMode,
    };
    return doc;
  }
  if (isGeneratorNode(n)) {
    const doc: TramaGeneratorNode = {
      kind: 'generator',
      id: n.id,
      label: n.label,
      params: n.params,
      position: n.position,
      isFocal: n.isFocal,
      description: n.description ?? null,
    };
    return doc;
  }
  if (isAverageNode(n)) {
    const doc: TramaAverageNode = {
      kind: 'average',
      id: n.id,
      label: n.label,
      position: n.position,
      isFocal: n.isFocal,
      description: n.description ?? null,
      displayMode: n.displayMode,
    };
    return doc;
  }
  if (!isExpressionNode(n)) throw new Error(`Unknown node kind`);
  const doc: TramaExpressionNode = {
    kind: 'expression',
    id: n.id,
    label: n.label,
    latex: n.latex,
    variables: n.variables,
    preset: n.preset,
    position: n.position,
    isFocal: n.isFocal,
    description: n.description ?? null,
  };
  return doc;
}

function edgeToDoc(e: Edge): TramaEdge {
  return {
    id: e.id,
    from: e.from,
    to: e.to,
    shape: e.shape,
    inverted: e.inverted,
    lag: e.lag,
    slotIndex: e.slotIndex,
    sourceSlotIndex: e.sourceSlotIndex,
    description: e.description ?? null,
  };
}

export function documentToModel(doc: TramaDocument): Model {
  const nodes: Record<string, Node> = {};
  const nodeOrder: string[] = [];
  for (const n of doc.nodes) {
    if (n.kind === 'value') {
      const node: ValueNode = {
        kind: 'value',
        id: n.id,
        label: n.label,
        unitOverride: n.unitOverride,
        initialValue: n.initialValue,
        position: n.position,
        combiner: n.combiner,
        isFocal: n.isFocal,
        description: n.description ?? null,
        skin: n.skin,
      };
      nodes[n.id] = node;
    } else if (n.kind === 'constant') {
      const node: ConstantNode = {
        kind: 'constant',
        id: n.id,
        label: n.label,
        value: n.value,
        constantKey: n.constantKey,
        position: n.position,
        isFocal: n.isFocal,
        description: n.description ?? null,
      };
      nodes[n.id] = node;
    } else if (n.kind === 'condition') {
      const node: ConditionNode = {
        kind: 'condition',
        id: n.id,
        label: n.label,
        operator: n.operator,
        threshold: n.threshold,
        position: n.position,
        isFocal: n.isFocal,
        description: n.description ?? null,
        displayMode: n.displayMode,
      };
      nodes[n.id] = node;
    } else if (n.kind === 'logic-gate') {
      const node: LogicGateNode = {
        kind: 'logic-gate',
        id: n.id,
        label: n.label,
        operator: n.operator,
        position: n.position,
        isFocal: n.isFocal,
        description: n.description ?? null,
      };
      nodes[n.id] = node;
    } else if (n.kind === 'observe') {
      const node: ObserveNode = {
        kind: 'observe',
        id: n.id,
        label: n.label,
        capacity: n.capacity,
        extraction: n.extraction,
        visualization: n.visualization,
        position: n.position,
        isFocal: n.isFocal,
        description: n.description ?? null,
        displayMode: n.displayMode,
      };
      nodes[n.id] = node;
    } else if (n.kind === 'generator') {
      const node: GeneratorNode = {
        kind: 'generator',
        id: n.id,
        label: n.label,
        params: n.params,
        position: n.position,
        isFocal: n.isFocal,
        description: n.description ?? null,
      };
      nodes[n.id] = node;
    } else if (n.kind === 'average') {
      const node: AverageNode = {
        kind: 'average',
        id: n.id,
        label: n.label,
        position: n.position,
        isFocal: n.isFocal,
        description: n.description ?? null,
        displayMode: n.displayMode,
      };
      nodes[n.id] = node;
    } else {
      const node: ExpressionNode = {
        kind: 'expression',
        id: n.id,
        label: n.label,
        latex: n.latex,
        variables: n.variables,
        preset: n.preset,
        position: n.position,
        isFocal: n.isFocal,
        description: n.description ?? null,
      };
      nodes[n.id] = node;
    }
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
      slotIndex: e.slotIndex,
      sourceSlotIndex: e.sourceSlotIndex,
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
