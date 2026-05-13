import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  mid: z.number(),
  k: z.number(),
});

export type SigmoidParams = z.infer<typeof params>;

function raw(x: number, p: SigmoidParams): number {
  return 1 / (1 + Math.exp(-p.k * (x - p.mid)));
}

export const sigmoidShape: ShapeDefinition<SigmoidParams> = {
  key: 'sigmoid',
  labels: { ko: 'S자(시그모이드)', en: 'sigmoid' },
  paramsSchema: params,
  defaultParams: { mid: 0.5, k: 8 },
  paramFields: [
    {
      key: 'mid',
      labels: { ko: '중심 x', en: 'midpoint' },
      min: 0,
      max: 1,
      step: 0.05,
      hint: { ko: '곡선이 0.5를 지나는 위치' },
    },
    {
      key: 'k',
      labels: { ko: '경사', en: 'steepness' },
      min: 1,
      max: 20,
      step: 0.5,
      hint: { ko: '크면 가파른 step에 근접' },
    },
  ],
  compute: (x, p) => {
    const y0 = raw(0, p);
    const y1 = raw(1, p);
    return clamp01((raw(clamp01(x), p) - y0) / Math.max(1e-9, y1 - y0));
  },
  previewPath: (w, h, p) => {
    const steps = 32;
    const pts: string[] = [];
    const y0 = raw(0, p);
    const y1 = raw(1, p);
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const y = clamp01((raw(x, p) - y0) / Math.max(1e-9, y1 - y0));
      pts.push(`${i === 0 ? 'M' : 'L'} ${x * w} ${h - y * h}`);
    }
    return pts.join(' ');
  },
};
