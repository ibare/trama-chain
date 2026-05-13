import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

const params = z.object({
  mid: z.number(),
  width: z.number(),
  depth: z.number(),
});

export type ValleyParams = z.infer<typeof params>;

function compute(x: number, p: ValleyParams): number {
  const sigma = Math.max(0.001, p.width);
  const z = (clamp01(x) - p.mid) / sigma;
  return clamp01(1 - p.depth * Math.exp(-(z * z)));
}

export const valleyShape: ShapeDefinition<ValleyParams> = {
  key: 'valley',
  labels: { ko: '골짜기', en: 'valley' },
  paramsSchema: params,
  defaultParams: { mid: 0.5, width: 0.25, depth: 1 },
  paramFields: [
    {
      key: 'mid',
      labels: { ko: '바닥점 x', en: 'valley x' },
      min: 0,
      max: 1,
      step: 0.05,
      hint: { ko: '0~1 정규화 좌표상의 골 위치' },
    },
    {
      key: 'width',
      labels: { ko: '폭', en: 'width' },
      min: 0.05,
      max: 1,
      step: 0.05,
      hint: { ko: '작을수록 뾰족, 크면 완만' },
    },
    {
      key: 'depth',
      labels: { ko: '깊이', en: 'depth' },
      min: 0,
      max: 1,
      step: 0.05,
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
