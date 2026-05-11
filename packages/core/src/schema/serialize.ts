import type { TramaDocument, TramaEdge, TramaNode } from './document.js';

// 키 순서 (문서 결정성):
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

const NODE_KEY_ORDER: (keyof TramaNode)[] = [
  'id',
  'label',
  'unit',
  'initialValue',
  'position',
  'combiner',
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
  // 잔여 키는 정렬해서 뒤에 붙임 (description optional 등)
  const extras = Object.keys(obj).filter(
    (k) => !(order as readonly string[]).includes(k),
  );
  extras.sort();
  for (const k of extras) {
    (out as Record<string, unknown>)[k] = (obj as Record<string, unknown>)[k];
  }
  return out;
}

/** TramaDocument → 결정적인 JSON 문자열 (들여쓰기 2칸). */
export function serializeTrama(doc: TramaDocument): string {
  const ordered: TramaDocument = orderObject(doc, DOC_KEY_ORDER);
  const orderedNodes = doc.nodes.map((n) => orderObject(n, NODE_KEY_ORDER));
  const orderedEdges = doc.edges.map((e) => orderObject(e, EDGE_KEY_ORDER));
  const payload: TramaDocument = { ...ordered, nodes: orderedNodes, edges: orderedEdges };
  return JSON.stringify(payload, null, 2);
}

/** 마크다운 펜스 안의 결정적 JSON 문자열로 직렬화. */
export function serializeTramaMarkdown(doc: TramaDocument): string {
  return '```trama\n' + serializeTrama(doc) + '\n```\n';
}
