import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';

const params = z.object({
  at: z.number(),
});

export type StepParams = z.infer<typeof params>;

export const stepShape: ShapeDefinition<StepParams> = {
  key: 'step',
  labels: { ko: '계단', en: 'step' },
  paramsSchema: params,
  defaultParams: { at: 0.5 },
  paramFields: [
    {
      key: 'at',
      labels: { ko: '문턱 x', en: 'step at' },
      min: 0,
      max: 1,
      step: 0.05,
      hint: { ko: '이 x 이상이면 즉시 1' },
    },
  ],
  compute: (x, p) => (x >= p.at ? 1 : 0),
  previewPath: (w, h, p) => {
    const xAt = Math.max(0, Math.min(1, p.at)) * w;
    // 0 → step at: y=0, 직후 y=1까지 수직.
    return `M 0 ${h} L ${xAt} ${h} L ${xAt} 0 L ${w} 0`;
  },
};
