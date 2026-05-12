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
  paramFields: [
    {
      key: 'peak',
      labels: { ko: '적정점 위치 x', en: 'peak x' },
      min: 0,
      max: 1,
      step: 0.05,
      hint: { ko: '0~1 정규화 좌표상의 봉우리 위치' },
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
      key: 'height',
      labels: { ko: '높이', en: 'height' },
      min: 0,
      max: 1,
      step: 0.05,
    },
  ],
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
