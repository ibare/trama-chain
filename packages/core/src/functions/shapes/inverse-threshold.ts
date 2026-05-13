import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  knee: z.number(),
  floor: z.number(),
});

export type InverseThresholdParams = z.infer<typeof params>;

function compute(x: number, p: InverseThresholdParams): number {
  const xc = clamp01(x);
  const knee = clamp01(p.knee);
  const floor = clamp01(p.floor);
  if (xc <= knee) return 1;
  // knee 이후 1 → floor까지 선형 감소.
  const t = (xc - knee) / Math.max(1e-9, 1 - knee);
  return clamp01(1 - t * (1 - floor));
}

export const inverseThresholdShape: ShapeDefinition<InverseThresholdParams> = {
  key: 'inverseThreshold',
  labels: { ko: '어느 지점 이후 감소', en: 'falls off after a point' },
  paramsSchema: params,
  defaultParams: { knee: 0.5, floor: 0 },
  paramFields: [
    {
      key: 'knee',
      labels: { ko: '꺾이는 지점 x', en: 'knee x' },
      min: 0,
      max: 1,
      step: 0.05,
      hint: { ko: '이 x 이하에서는 출력 유지' },
    },
    {
      key: 'floor',
      labels: { ko: '바닥값 y', en: 'floor y' },
      min: 0,
      max: 1,
      step: 0.05,
      hint: { ko: 'x=1에서 도달하는 최저 y' },
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
