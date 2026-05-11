import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  threshold: z.number(),
  slope: z.number(),
});

export type ThresholdParams = z.infer<typeof params>;

export const thresholdShape: ShapeDefinition<ThresholdParams> = {
  key: 'threshold',
  labels: { ko: '어느 지점부터', en: 'only after a point' },
  paramsSchema: params,
  defaultParams: { threshold: 0.3, slope: 1.5 },
  compute: (x, p) => {
    if (x < p.threshold) return 0;
    return clamp01((x - p.threshold) * p.slope);
  },
  previewPath: (w, h, p) => {
    const steps = 24;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const y = x < p.threshold ? 0 : clamp01((x - p.threshold) * p.slope);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x * w} ${h - y * h}`);
    }
    return pts.join(' ');
  },
};
