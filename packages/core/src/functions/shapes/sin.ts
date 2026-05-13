import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  period: z.number(),
  phase: z.number(),
});

export type SinParams = z.infer<typeof params>;

function compute(x: number, p: SinParams): number {
  const period = Math.max(0.05, p.period);
  // x ∈ [0,1] 안에서 period 주기 진동. y ∈ [0,1] 정규화.
  return clamp01((Math.sin(2 * Math.PI * (clamp01(x) / period + p.phase)) + 1) / 2);
}

export const sinShape: ShapeDefinition<SinParams> = {
  key: 'sin',
  labels: { ko: '사인파', en: 'sine' },
  paramsSchema: params,
  defaultParams: { period: 1, phase: 0 },
  paramFields: [
    {
      key: 'period',
      labels: { ko: '주기', en: 'period' },
      min: 0.1,
      max: 2,
      step: 0.05,
      hint: { ko: '입력 [0,1] 안의 한 주기 길이' },
    },
    {
      key: 'phase',
      labels: { ko: '위상', en: 'phase' },
      min: 0,
      max: 1,
      step: 0.05,
    },
  ],
  compute,
  previewPath: (w, h, p) => {
    const steps = 48;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const y = compute(x, p);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x * w} ${h - y * h}`);
    }
    return pts.join(' ');
  },
};
