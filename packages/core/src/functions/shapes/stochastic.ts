import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';
import { clamp01 } from '../../units/index.js';

// v1 stochastic은 베르누이 류만 지원. 향후 분포 추가 가능.
// winProbability ∈ [0,1], winMultiplier·loseMultiplier는 *target unit 스케일* 기준 비례 수정자.
// compute는 [0,1] 출력을 내야 하므로, 입력 x를 베이스로 multiplier를 가산해서 [0,1]로 다시 매핑.
// 의미: x = 베팅 강도 (입력 노드의 정규화 값).
//   당첨 시 출력 = clamp01(x * winMultiplier + bias)
//   탈락 시 출력 = clamp01(x * loseMultiplier + bias)
// (실제 금액 변환은 target unit이 담당)
const params = z.object({
  distribution: z.enum(['bernoulli']),
  winProbability: z.number().min(0).max(1),
  winMultiplier: z.number(),
  loseMultiplier: z.number(),
  bias: z.number(),
});

export type StochasticParams = z.infer<typeof params>;

export const stochasticShape: ShapeDefinition<StochasticParams> = {
  key: 'stochastic',
  labels: { ko: '확률로', en: 'stochastic' },
  paramsSchema: params,
  defaultParams: {
    distribution: 'bernoulli',
    winProbability: 0.05,
    winMultiplier: 5,
    loseMultiplier: -1,
    bias: 0.5,
  },
  isStochastic: true,
  compute: (x, p, ctx) => {
    const r = ctx.rng();
    const won = r < p.winProbability;
    const mult = won ? p.winMultiplier : p.loseMultiplier;
    // [0,1] 공간 출력. bias를 중심으로 잡고 multiplier로 흔든다.
    return clamp01(p.bias + x * mult);
  },
  previewPath: (w, h, p) => {
    // 미리보기는 기댓값 곡선.
    const expected = p.winProbability * p.winMultiplier + (1 - p.winProbability) * p.loseMultiplier;
    const y0 = clamp01(p.bias);
    const y1 = clamp01(p.bias + expected);
    return `M 0 ${h - y0 * h} L ${w} ${h - y1 * h}`;
  },
};
