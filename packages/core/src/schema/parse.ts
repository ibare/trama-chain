import type { CombinerRegistry } from '../combiners/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import { TramaDocumentSchema, type TramaDocument } from './document.js';

export class TramaParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'TramaParseError';
  }
}

export interface ParseOptions {
  /** 등록된 shape/combiner 키로 추가 검증. 생략 가능 (스키마 검증만 수행). */
  shapeRegistry?: ShapeRegistry;
  combinerRegistry?: CombinerRegistry;
}

/** JSON 문자열을 TramaDocument로 파싱. 실패 시 throw TramaParseError. */
export function parseTrama(input: string, options: ParseOptions = {}): TramaDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch (e) {
    throw new TramaParseError(`JSON parse failed: ${(e as Error).message}`, e);
  }

  const parsed = TramaDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new TramaParseError(`schema validation failed: ${issues}`);
  }

  const doc = parsed.data;
  validateAgainstRegistry(doc, options);
  validateNoInstantaneousCycle(doc);
  return doc;
}

/** 마크다운 본문에서 첫 ```trama 펜스를 찾아 그 JSON을 파싱. */
export function extractAndParseTramaFromMarkdown(
  md: string,
  options: ParseOptions = {},
): TramaDocument {
  const re = /```trama\s*\n([\s\S]*?)\n```/m;
  const match = re.exec(md);
  if (!match) {
    throw new TramaParseError('no ```trama fence found');
  }
  return parseTrama(match[1]!, options);
}

function validateAgainstRegistry(doc: TramaDocument, options: ParseOptions): void {
  const { shapeRegistry, combinerRegistry } = options;
  if (combinerRegistry) {
    for (const n of doc.nodes) {
      if (n.kind !== 'value') continue;
      if (!combinerRegistry.has(n.combiner)) {
        throw new TramaParseError(
          `node ${n.id}: combiner "${n.combiner}" not registered`,
        );
      }
    }
  }
  if (shapeRegistry) {
    for (const e of doc.edges) {
      const def = shapeRegistry.get(e.shape.kind);
      if (!def) {
        throw new TramaParseError(`edge ${e.id}: shape "${e.shape.kind}" not registered`);
      }
      const parsedParams = def.paramsSchema.safeParse(e.shape.params);
      if (!parsedParams.success) {
        const issues = parsedParams.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
          .join('; ');
        throw new TramaParseError(
          `edge ${e.id}: invalid params for shape "${e.shape.kind}": ${issues}`,
        );
      }
    }
  }
}

function validateNoInstantaneousCycle(doc: TramaDocument): void {
  // lag=0 엣지만으로 DFS-based 사이클 검사
  const adj = new Map<string, string[]>();
  for (const n of doc.nodes) adj.set(n.id, []);
  for (const e of doc.edges) {
    if (e.lag !== 0) continue;
    const list = adj.get(e.from);
    if (!list) continue;
    list.push(e.to);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of doc.nodes) color.set(n.id, WHITE);
  const stack: { node: string; iter: number; path: string[] }[] = [];
  for (const start of doc.nodes.map((n) => n.id)) {
    if (color.get(start) !== WHITE) continue;
    stack.push({ node: start, iter: 0, path: [start] });
    color.set(start, GRAY);
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const neighbors = adj.get(top.node) ?? [];
      if (top.iter < neighbors.length) {
        const next = neighbors[top.iter]!;
        top.iter++;
        const c = color.get(next);
        if (c === GRAY) {
          const cycleStart = top.path.indexOf(next);
          const cyclePath = cycleStart >= 0 ? top.path.slice(cycleStart).concat(next) : [next];
          throw new TramaParseError(
            `instantaneous (lag=0) cycle detected: ${cyclePath.join(' → ')}`,
          );
        } else if (c === WHITE) {
          color.set(next, GRAY);
          stack.push({ node: next, iter: 0, path: [...top.path, next] });
        }
      } else {
        color.set(top.node, BLACK);
        stack.pop();
      }
    }
  }
}
