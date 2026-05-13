import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ShapeRegistry,
  createDefaultShapeRegistry,
  linearShape,
} from '../src/functions/index.js';
import type { ShapeDefinition } from '../src/functions/types.js';

const NOOP_RNG = () => 0.5;

describe('ShapeRegistry', () => {
  it('registers and retrieves shapes', () => {
    const r = new ShapeRegistry();
    r.register(linearShape);
    expect(r.get('linear')?.key).toBe('linear');
    expect(r.has('linear')).toBe(true);
    expect(r.list()).toHaveLength(1);
  });

  it('throws on duplicate key', () => {
    const r = new ShapeRegistry();
    r.register(linearShape);
    expect(() => r.register(linearShape)).toThrow(/duplicate/);
  });

  it('default registry contains all v1 starting shapes', () => {
    const r = createDefaultShapeRegistry();
    expect(r.has('none')).toBe(true);
    expect(r.has('linear')).toBe(true);
    expect(r.has('inverseU')).toBe(true);
    expect(r.has('threshold')).toBe(true);
    expect(r.has('diminishing')).toBe(true);
    expect(r.has('accelerating')).toBe(true);
    expect(r.has('piecewise')).toBe(true);
    expect(r.has('stochastic')).toBe(true);
    expect(r.has('sigmoid')).toBe(true);
    expect(r.has('log')).toBe(true);
    expect(r.has('step')).toBe(true);
    expect(r.has('decay')).toBe(true);
    expect(r.has('inverse')).toBe(true);
    expect(r.has('inverseThreshold')).toBe(true);
    expect(r.has('valley')).toBe(true);
    expect(r.has('sin')).toBe(true);
    expect(r.has('uniform')).toBe(true);
    expect(r.has('gaussian')).toBe(true);
    expect(r.list()).toHaveLength(18);
  });

  it('supports runtime extension', () => {
    const r = createDefaultShapeRegistry();
    const custom: ShapeDefinition<{ power: number }> = {
      key: 'inversePower',
      labels: { ko: '거듭제곱 반비례', en: 'inverse power' },
      paramsSchema: z.object({ power: z.number() }),
      defaultParams: { power: 2 },
      compute: (x, { power }) => (x === 0 ? 1 : Math.min(1, 1 / Math.pow(x * 10, power))),
      previewPath: () => '',
    };
    r.register(custom);
    expect(r.get('inversePower')?.compute(0.5, { power: 2 }, { rng: NOOP_RNG })).toBeCloseTo(
      0.04,
      2,
    );
  });
});

describe('shape compute', () => {
  it('linear', () => {
    expect(linearShape.compute(0.5, { slope: 1, offset: 0 }, { rng: NOOP_RNG })).toBeCloseTo(0.5);
    expect(linearShape.compute(0.5, { slope: 2, offset: 0 }, { rng: NOOP_RNG })).toBeCloseTo(1);
    expect(linearShape.compute(0.5, { slope: 0, offset: 0.3 }, { rng: NOOP_RNG })).toBeCloseTo(0.3);
  });

  it('inverseU peaks at peak param', () => {
    const r = createDefaultShapeRegistry().get('inverseU')!;
    const p = { peak: 0.5, width: 0.3, height: 1 };
    const atPeak = r.compute(0.5, p, { rng: NOOP_RNG });
    const offPeak = r.compute(0.1, p, { rng: NOOP_RNG });
    expect(atPeak).toBeGreaterThan(offPeak);
    expect(atPeak).toBeCloseTo(1);
  });

  it('threshold is zero below threshold', () => {
    const r = createDefaultShapeRegistry().get('threshold')!;
    const p = { threshold: 0.3, slope: 2 };
    expect(r.compute(0.2, p, { rng: NOOP_RNG })).toBe(0);
    expect(r.compute(0.5, p, { rng: NOOP_RNG })).toBeGreaterThan(0);
  });

  it('diminishing returns are concave', () => {
    const r = createDefaultShapeRegistry().get('diminishing')!;
    const p = { curvature: 0.7 };
    const y1 = r.compute(0.2, p, { rng: NOOP_RNG });
    const y2 = r.compute(0.5, p, { rng: NOOP_RNG });
    const y3 = r.compute(0.8, p, { rng: NOOP_RNG });
    expect(y2 - y1).toBeGreaterThan(y3 - y2);
  });

  it('accelerating returns are convex', () => {
    const r = createDefaultShapeRegistry().get('accelerating')!;
    const p = { curvature: 0.7 };
    const y1 = r.compute(0.2, p, { rng: NOOP_RNG });
    const y2 = r.compute(0.5, p, { rng: NOOP_RNG });
    const y3 = r.compute(0.8, p, { rng: NOOP_RNG });
    expect(y3 - y2).toBeGreaterThan(y2 - y1);
  });

  it('piecewise interpolates linearly between points', () => {
    const r = createDefaultShapeRegistry().get('piecewise')!;
    const p = { points: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }] };
    expect(r.compute(0.25, p, { rng: NOOP_RNG })).toBeCloseTo(0.5);
    expect(r.compute(0.5, p, { rng: NOOP_RNG })).toBeCloseTo(1);
    expect(r.compute(0.75, p, { rng: NOOP_RNG })).toBeCloseTo(0.5);
  });

  it('stochastic produces different outcomes based on rng', () => {
    const r = createDefaultShapeRegistry().get('stochastic')!;
    const p = {
      distribution: 'bernoulli' as const,
      winProbability: 0.5,
      winMultiplier: 1,
      loseMultiplier: -1,
      bias: 0.5,
    };
    const winning = r.compute(0.5, p, { rng: () => 0.1 });
    const losing = r.compute(0.5, p, { rng: () => 0.9 });
    expect(winning).not.toBe(losing);
    expect(r.isStochastic).toBe(true);
  });
});
