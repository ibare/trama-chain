import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  peak: z.number(),
  width: z.number(),
  height: z.number(),
});

export type InverseUParams = z.infer<typeof params>;

export const inverseUShape: ShapeDefinition<InverseUParams> = {
  key: 'inverseU',
  labels: { ko: '적정점에서 최고', en: 'peak in the middle' },
  paramsSchema: params,
  defaultParams: { peak: 0.5, width: 0.35, height: 1 },
  compute: (x, p) => {
    const sigma = Math.max(0.001, p.width);
    const z = (x - p.peak) / sigma;
    return clamp01(p.height * Math.exp(-(z * z)));
  },
  previewPath: (w, h, p) => {
    const steps = 24;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const sigma = Math.max(0.001, p.width);
      const z = (x - p.peak) / sigma;
      const y = clamp01(p.height * Math.exp(-(z * z)));
      pts.push(`${i === 0 ? 'M' : 'L'} ${x * w} ${h - y * h}`);
    }
    return pts.join(' ');
  },
};
