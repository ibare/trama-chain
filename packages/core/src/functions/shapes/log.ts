import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  base: z.number(),
});

export type LogParams = z.infer<typeof params>;

function compute(x: number, p: LogParams): number {
  const b = Math.max(1.1, p.base);
  // x ∈ [0,1] → [0,1] 정규화 log: log_b(1 + (b-1)*x) / log_b(b)
  return clamp01(Math.log(1 + (b - 1) * clamp01(x)) / Math.log(b));
}

export const logShape: ShapeDefinition<LogParams> = {
  key: 'log',
  labels: { ko: '로그(빨리 차오름)', en: 'logarithmic' },
  paramsSchema: params,
  defaultParams: { base: 10 },
  paramFields: [
    {
      key: 'base',
      labels: { ko: '밑(base)', en: 'base' },
      min: 1.5,
      max: 100,
      step: 0.5,
      hint: { ko: '클수록 초반에 더 빨리 차오름' },
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
