import type { ValueKind } from '../model/value.js';

/**
 * Combiner는 같은 target으로 들어오는 여러 contribution을 하나로 합치는 규칙.
 *
 * ValueKind별로 도메인이 분리된다 — numeric끼리 합산, boolean끼리 AND/OR.
 * 한 노드의 입력은 PortType 검사로 동일한 ValueKind로 정렬되므로 Combiner는
 * 단일 ValueKind 컨트리뷰션만 받는다.
 */

export interface NumericCombinerDefinition {
  key: string;
  valueKind: 'numeric';
  labels: { ko: string; en: string };
  combine: (contributions: number[]) => number;
}

export interface BooleanCombinerDefinition {
  key: string;
  valueKind: 'boolean';
  labels: { ko: string; en: string };
  combine: (contributions: boolean[]) => boolean;
}

export type CombinerDefinition =
  | NumericCombinerDefinition
  | BooleanCombinerDefinition;

export class CombinerRegistry {
  private readonly map = new Map<string, CombinerDefinition>();

  register(def: CombinerDefinition): void {
    if (this.map.has(def.key)) {
      throw new Error(`CombinerRegistry: duplicate key "${def.key}"`);
    }
    this.map.set(def.key, def);
  }

  get(key: string): CombinerDefinition | undefined {
    return this.map.get(key);
  }

  /** 주어진 키의 combiner가 기대한 ValueKind를 갖는지 검증하며 가져온다. */
  getOfKind<K extends ValueKind>(
    key: string,
    kind: K,
  ): Extract<CombinerDefinition, { valueKind: K }> | undefined {
    const def = this.map.get(key);
    if (!def || def.valueKind !== kind) return undefined;
    return def as Extract<CombinerDefinition, { valueKind: K }>;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  list(): CombinerDefinition[] {
    return Array.from(this.map.values());
  }

  listForKind<K extends ValueKind>(
    kind: K,
  ): Array<Extract<CombinerDefinition, { valueKind: K }>> {
    const out: Array<Extract<CombinerDefinition, { valueKind: K }>> = [];
    for (const def of this.map.values()) {
      if (def.valueKind === kind) {
        out.push(def as Extract<CombinerDefinition, { valueKind: K }>);
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Numeric combiners (1단계 기본 셋)
// ---------------------------------------------------------------------------

export const sumCombiner: NumericCombinerDefinition = {
  key: 'sum',
  valueKind: 'numeric',
  labels: { ko: '합산', en: 'sum' },
  combine: (xs) => xs.reduce((a, b) => a + b, 0),
};

export const averageCombiner: NumericCombinerDefinition = {
  key: 'average',
  valueKind: 'numeric',
  labels: { ko: '평균', en: 'average' },
  combine: (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length),
};

export const maxCombiner: NumericCombinerDefinition = {
  key: 'max',
  valueKind: 'numeric',
  labels: { ko: '가장 큰 영향', en: 'max' },
  combine: (xs) => (xs.length === 0 ? 0 : Math.max(...xs)),
};

export const productCombiner: NumericCombinerDefinition = {
  key: 'product',
  valueKind: 'numeric',
  labels: { ko: '서로 곱해서', en: 'product' },
  combine: (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a * b, 1)),
};

// ---------------------------------------------------------------------------
// Boolean combiners
// ---------------------------------------------------------------------------

// contributions.length === 0인 경우는 ValueNode propagate에서 already-invalid로
// 처리되어 combine이 호출되지 않는다 — 빈 입력의 의미를 정하지 않아도 안전하다.
// 그래도 vacuous truth(and=true)는 사용자 직관과 어긋나기 쉬워 모두 false로 둔다.

export const andCombiner: BooleanCombinerDefinition = {
  key: 'and',
  valueKind: 'boolean',
  labels: { ko: '모두 참', en: 'and' },
  combine: (xs) => xs.length > 0 && xs.every((b) => b),
};

export const orCombiner: BooleanCombinerDefinition = {
  key: 'or',
  valueKind: 'boolean',
  labels: { ko: '하나라도 참', en: 'or' },
  combine: (xs) => xs.some((b) => b),
};

export const xorCombiner: BooleanCombinerDefinition = {
  key: 'xor',
  valueKind: 'boolean',
  labels: { ko: '서로 달라야 참', en: 'xor' },
  combine: (xs) => xs.filter((b) => b).length % 2 === 1,
};

export function createDefaultCombinerRegistry(): CombinerRegistry {
  const r = new CombinerRegistry();
  r.register(sumCombiner);
  r.register(averageCombiner);
  r.register(maxCombiner);
  r.register(productCombiner);
  r.register(andCombiner);
  r.register(orCombiner);
  r.register(xorCombiner);
  return r;
}
