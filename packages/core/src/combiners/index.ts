export interface CombinerDefinition {
  key: string;
  labels: { ko: string; en: string };
  combine: (contributions: number[]) => number;
}

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

  has(key: string): boolean {
    return this.map.has(key);
  }

  list(): CombinerDefinition[] {
    return Array.from(this.map.values());
  }
}

export const sumCombiner: CombinerDefinition = {
  key: 'sum',
  labels: { ko: '합산', en: 'sum' },
  combine: (xs) => xs.reduce((a, b) => a + b, 0),
};

export const averageCombiner: CombinerDefinition = {
  key: 'average',
  labels: { ko: '평균', en: 'average' },
  combine: (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length),
};

export const maxCombiner: CombinerDefinition = {
  key: 'max',
  labels: { ko: '가장 큰 영향', en: 'max' },
  combine: (xs) => (xs.length === 0 ? 0 : Math.max(...xs)),
};

export const productCombiner: CombinerDefinition = {
  key: 'product',
  labels: { ko: '서로 곱해서', en: 'product' },
  combine: (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a * b, 1)),
};

export function createDefaultCombinerRegistry(): CombinerRegistry {
  const r = new CombinerRegistry();
  r.register(sumCombiner);
  r.register(averageCombiner);
  r.register(maxCombiner);
  r.register(productCombiner);
  return r;
}
