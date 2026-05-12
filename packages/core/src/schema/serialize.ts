import type {
  TramaConstantNode,
  TramaDocument,
  TramaEdge,
  TramaFunctionNode,
  TramaNode,
  TramaValueNode,
} from './document.js';

const DOC_KEY_ORDER: (keyof TramaDocument)[] = [
  'trama',
  'id',
  'question',
  'createdAt',
  'updatedAt',
  'execution',
  'nodes',
  'edges',
];

const VALUE_NODE_KEY_ORDER: (keyof TramaValueNode)[] = [
  'kind',
  'id',
  'label',
  'unitId',
  'unitOverride',
  'initialValue',
  'position',
  'combiner',
  'isFocal',
  'description',
];

const FUNCTION_NODE_KEY_ORDER: (keyof TramaFunctionNode)[] = [
  'kind',
  'id',
  'label',
  'functionKey',
  'outputUnitId',
  'outputUnitOverride',
  'position',
  'isFocal',
  'description',
];

const CONSTANT_NODE_KEY_ORDER: (keyof TramaConstantNode)[] = [
  'kind',
  'id',
  'label',
  'value',
  'constantKey',
  'position',
  'isFocal',
  'description',
];

const EDGE_KEY_ORDER: (keyof TramaEdge)[] = [
  'id',
  'from',
  'to',
  'shape',
  'inverted',
  'lag',
  'slotIndex',
  'description',
];

function orderObject<T extends object>(obj: T, order: readonly (keyof T)[]): T {
  const out = {} as T;
  for (const k of order) {
    if (k in obj) {
      (out as Record<string, unknown>)[k as string] = (obj as Record<string, unknown>)[
        k as string
      ];
    }
  }
  const extras = Object.keys(obj).filter(
    (k) => !(order as readonly string[]).includes(k),
  );
  extras.sort();
  for (const k of extras) {
    (out as Record<string, unknown>)[k] = (obj as Record<string, unknown>)[k];
  }
  return out;
}

function orderNode(n: TramaNode): TramaNode {
  if (n.kind === 'value') return orderObject(n, VALUE_NODE_KEY_ORDER);
  if (n.kind === 'function') return orderObject(n, FUNCTION_NODE_KEY_ORDER);
  return orderObject(n, CONSTANT_NODE_KEY_ORDER);
}

/** TramaDocument → 결정적인 JSON 문자열 (들여쓰기 2칸). */
export function serializeTrama(doc: TramaDocument): string {
  const ordered: TramaDocument = orderObject(doc, DOC_KEY_ORDER);
  const orderedNodes = doc.nodes.map(orderNode);
  const orderedEdges = doc.edges.map((e) => orderObject(e, EDGE_KEY_ORDER));
  const payload: TramaDocument = { ...ordered, nodes: orderedNodes, edges: orderedEdges };
  return JSON.stringify(payload, null, 2);
}

/** 마크다운 펜스 안의 결정적 JSON 문자열로 직렬화. */
export function serializeTramaMarkdown(doc: TramaDocument): string {
  return '```trama\n' + serializeTrama(doc) + '\n```\n';
}
