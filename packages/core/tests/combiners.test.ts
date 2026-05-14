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
    expect(r.getOfKind('sum', 'boolean')).toBeUndefined();
    expect(r.getOfKind('and', 'boolean')?.valueKind).toBe('boolean');
    expect(r.getOfKind('and', 'numeric')).toBeUndefined();
    expect(r.listForKind('numeric').length).toBe(4);
    expect(r.listForKind('boolean').length).toBe(3);
  });

  it('boolean combiners produce expected truth tables', () => {
    const r = createDefaultCombinerRegistry();
    const and = r.getOfKind('and', 'boolean')!;
    const or = r.getOfKind('or', 'boolean')!;
    const xor = r.getOfKind('xor', 'boolean')!;
    expect(and.combine([true, true, true])).toBe(true);
    expect(and.combine([true, false, true])).toBe(false);
    expect(or.combine([false, false, true])).toBe(true);
    expect(or.combine([false, false, false])).toBe(false);
    expect(xor.combine([true, false])).toBe(true);
    expect(xor.combine([true, true])).toBe(false);
    expect(xor.combine([true, false, true])).toBe(false);
    expect(xor.combine([true, true, true])).toBe(true);
    // 빈 입력은 모두 false (vacuous-truth 회피)
    expect(and.combine([])).toBe(false);
    expect(or.combine([])).toBe(false);
    expect(xor.combine([])).toBe(false);
  });
});
