import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  rate: z.number(),
});

export type DecayParams = z.infer<typeof params>;

function compute(x: number, p: DecayParams): number {
  const r = Math.max(0.01, p.rate);
  // 정규화: x=0 → 1, x=1 → 0.
  const num = Math.exp(-r * clamp01(x)) - Math.exp(-r);
  const den = 1 - Math.exp(-r);
  return clamp01(num / Math.max(1e-9, den));
}

export const decayShape: ShapeDefinition<DecayParams> = {
  key: 'decay',
  labels: { ko: '지수 감쇠', en: 'exponential decay' },
  paramsSchema: params,
  defaultParams: { rate: 2 },
  paramFields: [
    {
      key: 'rate',
      labels: { ko: '감쇠율', en: 'rate' },
      min: 0.1,
      max: 10,
      step: 0.1,
      hint: { ko: '클수록 초반에 더 빨리 떨어짐' },
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
