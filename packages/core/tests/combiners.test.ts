import { describe, expect, it } from 'vitest';
import {
  CombinerRegistry,
  createDefaultCombinerRegistry,
  productCombiner,
  sumCombiner,
} from '../src/combiners/index.js';

describe('CombinerRegistry', () => {
  it('registers and retrieves', () => {
    const r = new CombinerRegistry();
    r.register(sumCombiner);
    expect(r.get('sum')).toBe(sumCombiner);
  });

  it('throws on duplicate key', () => {
    const r = new CombinerRegistry();
    r.register(sumCombiner);
    expect(() => r.register(sumCombiner)).toThrow(/duplicate/);
  });

  it('default registry contains sum/average/max/product', () => {
    const r = createDefaultCombinerRegistry();
    expect(r.has('sum')).toBe(true);
    expect(r.has('average')).toBe(true);
    expect(r.has('max')).toBe(true);
    expect(r.has('product')).toBe(true);
  });

  it('combiners produce expected results', () => {
    expect(sumCombiner.combine([1, 2, 3])).toBe(6);
    expect(productCombiner.combine([2, 3, 4])).toBe(24);
    expect(createDefaultCombinerRegistry().getOfKind('average', 'numeric')!.combine([2, 4, 6])).toBe(4);
    expect(createDefaultCombinerRegistry().getOfKind('max', 'numeric')!.combine([2, 4, 1])).toBe(4);
  });

  it('empty contributions are safe', () => {
    expect(sumCombiner.combine([])).toBe(0);
    expect(createDefaultCombinerRegistry().getOfKind('average', 'numeric')!.combine([])).toBe(0);
    expect(productCombiner.combine([])).toBe(0);
  });

  it('getOfKind narrows by valueKind and rejects mismatched kind', () => {
    const r = createDefaultCombinerRegistry();
    expect(r.getOfKind('sum', 'numeric')?.valueKind).toBe('numeric');
    // 1단계엔 boolean combiner가 없으므로 같은 키도 boolean으로 조회되면 미스.
    expect(r.getOfKind('sum', 'boolean')).toBeUndefined();
    expect(r.listForKind('numeric').length).toBe(4);
    expect(r.listForKind('boolean').length).toBe(0);
  });
});
