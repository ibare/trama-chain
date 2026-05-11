import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

// 구간 정의: x 경계점들에서 y 값. 마지막 점은 x=1.
// 항상 x=0 시작점도 명시. 구간 사이는 선형 보간.
const breakpoint = z.object({ x: z.number(), y: z.number() });
const params = z.object({
  points: z.array(breakpoint),
});

export type PiecewiseParams = z.infer<typeof params>;

function sortedPoints(p: PiecewiseParams): { x: number; y: number }[] {
  const pts = p.points.length === 0 ? [{ x: 0, y: 0 }, { x: 1, y: 1 }] : [...p.points];
  pts.sort((a, b) => a.x - b.x);
  return pts;
}

export const piecewiseShape: ShapeDefinition<PiecewiseParams> = {
  key: 'piecewise',
  labels: { ko: '구간별로', en: 'piecewise' },
  paramsSchema: params,
  defaultParams: {
    points: [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.8 },
      { x: 1, y: 0.3 },
    ],
  },
  compute: (x, p) => {
    const pts = sortedPoints(p);
    const xc = clamp01(x);
    if (xc <= pts[0]!.x) return clamp01(pts[0]!.y);
    const last = pts[pts.length - 1]!;
    if (xc >= last.x) return clamp01(last.y);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (xc >= a.x && xc <= b.x) {
        const t = b.x === a.x ? 0 : (xc - a.x) / (b.x - a.x);
        return clamp01(a.y + (b.y - a.y) * t);
      }
    }
    return clamp01(last.y);
  },
  previewPath: (w, h, p) => {
    const pts = sortedPoints(p);
    return pts
      .map(
        (pt, i) =>
          `${i === 0 ? 'M' : 'L'} ${clamp01(pt.x) * w} ${h - clamp01(pt.y) * h}`,
      )
      .join(' ');
  },
};
