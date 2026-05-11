import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  curvature: z.number(),
});

export type DiminishingParams = z.infer<typeof params>;

export const diminishingShape: ShapeDefinition<DiminishingParams> = {
  key: 'diminishing',
  labels: { ko: '갈수록 둔하게', en: 'diminishing returns' },
  paramsSchema: params,
  defaultParams: { curvature: 0.5 },
  compute: (x, p) => {
    const k = Math.max(0.01, Math.min(0.99, p.curvature));
    // power < 1이면 sqrt 류 곡선; 작을수록 빨리 둔해짐
    const power = 1 - k;
    return clamp01(Math.pow(clamp01(x), power));
  },
  previewPath: (w, h, p) => {
    const steps = 24;
    const pts: string[] = [];
    const k = Math.max(0.01, Math.min(0.99, p.curvature));
    const power = 1 - k;
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const y = clamp01(Math.pow(x, power));
      pts.push(`${i === 0 ? 'M' : 'L'} ${x * w} ${h - y * h}`);
    }
    return pts.join(' ');
  },
};
