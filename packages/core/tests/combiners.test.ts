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
    expect(createDefaultCombinerRegistry().get('average')!.combine([2, 4, 6])).toBe(4);
    expect(createDefaultCombinerRegistry().get('max')!.combine([2, 4, 1])).toBe(4);
  });

  it('empty contributions are safe', () => {
    expect(sumCombiner.combine([])).toBe(0);
    expect(createDefaultCombinerRegistry().get('average')!.combine([])).toBe(0);
    expect(productCombiner.combine([])).toBe(0);
  });
});
