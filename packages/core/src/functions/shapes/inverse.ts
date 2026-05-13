import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  k: z.number(),
});

export type InverseParams = z.infer<typeof params>;

function compute(x: number, p: InverseParams): number {
  const k = Math.max(0.001, p.k);
  // y = k/(k+x). x=0 → 1, x=1 → k/(k+1). 정규화로 x=1 → 0 매핑.
  const y = k / (k + clamp01(x));
  const yMin = k / (k + 1);
  return clamp01((y - yMin) / Math.max(1e-9, 1 - yMin));
}

export const inverseShape: ShapeDefinition<InverseParams> = {
  key: 'inverse',
  labels: { ko: '반비례', en: 'inverse' },
  paramsSchema: params,
  defaultParams: { k: 1 },
  paramFields: [
    {
      key: 'k',
      labels: { ko: '곡률 k', en: 'k' },
      min: 0.05,
      max: 5,
      step: 0.05,
      hint: { ko: '작을수록 가파르게 떨어짐' },
    },
  ],
  compute,
  previewPath: (w, h, p) => {
    const steps = 24;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const y = compute(x, p);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x * w} ${h - y * h}`);
    }
    return pts.join(' ');
  },
};
