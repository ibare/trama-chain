import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  slope: z.number(),
  offset: z.number(),
});

export type LinearParams = z.infer<typeof params>;

export const linearShape: ShapeDefinition<LinearParams> = {
  key: 'linear',
  labels: { ko: '비례해서', en: 'proportional' },
  paramsSchema: params,
  defaultParams: { slope: 1, offset: 0 },
  compute: (x, p) => clamp01(p.slope * x + p.offset),
  previewPath: (w, h, p) => {
    const y0 = clamp01(p.offset);
    const y1 = clamp01(p.slope + p.offset);
    return `M 0 ${h - y0 * h} L ${w} ${h - y1 * h}`;
  },
};
