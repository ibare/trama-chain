import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  mean: z.number(),
  sigma: z.number(),
});

export type GaussianParams = z.infer<typeof params>;

function boxMuller(rng: () => number): number {
  // 0이 들어가면 log(0) → -∞라 ε로 클램프.
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const gaussianShape: ShapeDefinition<GaussianParams> = {
  key: 'gaussian',
  labels: { ko: '가우시안', en: 'gaussian' },
  paramsSchema: params,
  defaultParams: { mean: 0.5, sigma: 0.2 },
  isStochastic: true,
  paramFields: [
    {
      key: 'mean',
      labels: { ko: '평균', en: 'mean' },
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: 'sigma',
      labels: { ko: '표준편차', en: 'sigma' },
      min: 0.01,
      max: 0.5,
      step: 0.01,
    },
  ],
  compute: (_x, p, ctx) => {
    const sigma = Math.max(0.001, p.sigma);
    return clamp01(p.mean + sigma * boxMuller(ctx.rng));
  },
  previewPath: (w, h, p) => {
    // 기대 종 모양(확률 밀도)을 정규화해 곡선으로.
    const sigma = Math.max(0.001, p.sigma);
    const steps = 32;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const z = (x - p.mean) / sigma;
      const y = Math.exp(-(z * z) / 2);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x * w} ${h - y * h}`);
    }
    return pts.join(' ');
  },
};
