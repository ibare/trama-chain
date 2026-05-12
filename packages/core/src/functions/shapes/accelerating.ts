import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  curvature: z.number(),
});

export type AcceleratingParams = z.infer<typeof params>;

export const acceleratingShape: ShapeDefinition<AcceleratingParams> = {
  key: 'accelerating',
  labels: { ko: '갈수록 가팔라지게', en: 'accelerating' },
  paramsSchema: params,
  defaultParams: { curvature: 0.6 },
  compute: (x, p) => {
    const k = Math.max(0.01, Math.min(0.99, p.curvature));
    const power = 1 + k * 4; // 1~5
    return clamp01(Math.pow(clamp01(x), power));
  },
  paramFields: [
    {
      key: 'curvature',
      labels: { ko: '곡률', en: 'curvature' },
      min: 0.01,
      max: 0.99,
      step: 0.05,
      hint: { ko: '클수록 후반에 더 가파르게 솟음' },
    },
  ],
  previewPath: (w, h, p) => {
    const steps = 24;
    const pts: string[] = [];
    const k = Math.max(0.01, Math.min(0.99, p.curvature));
    const power = 1 + k * 4;
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const y = clamp01(Math.pow(x, power));
      pts.push(`${i === 0 ? 'M' : 'L'} ${x * w} ${h - y * h}`);
    }
    return pts.join(' ');
  },
};
