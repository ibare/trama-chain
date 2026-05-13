import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  low: z.number(),
  high: z.number(),
});

export type UniformParams = z.infer<typeof params>;

export const uniformShape: ShapeDefinition<UniformParams> = {
  key: 'uniform',
  labels: { ko: '균등 분포', en: 'uniform' },
  paramsSchema: params,
  defaultParams: { low: 0, high: 1 },
  isStochastic: true,
  paramFields: [
    {
      key: 'low',
      labels: { ko: '하한', en: 'low' },
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: 'high',
      labels: { ko: '상한', en: 'high' },
      min: 0,
      max: 1,
      step: 0.05,
    },
  ],
  compute: (_x, p, ctx) => {
    const lo = Math.min(p.low, p.high);
    const hi = Math.max(p.low, p.high);
    return clamp01(lo + ctx.rng() * (hi - lo));
  },
  previewPath: (w, h, p) => {
    const lo = clamp01(Math.min(p.low, p.high));
    const hi = clamp01(Math.max(p.low, p.high));
    // 기댓값(중앙선) + 상·하한 보조선을 한 path로.
    const ymid = h - ((lo + hi) / 2) * h;
    const ylo = h - lo * h;
    const yhi = h - hi * h;
    return `M 0 ${ymid} L ${w} ${ymid} M 0 ${ylo} L ${w} ${ylo} M 0 ${yhi} L ${w} ${yhi}`;
  },
};
