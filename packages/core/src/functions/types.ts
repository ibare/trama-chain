import type { z } from 'zod';

export type Rng = () => number;

export interface ShapeComputeContext {
  /** 매 evaluation마다 호출 가능한 RNG (stochastic shape용). seedable. */
  rng: Rng;
}

export interface ShapeDefinition<P = unknown> {
  key: string;
  labels: { ko: string; en: string };
  paramsSchema: z.ZodType<P>;
  defaultParams: P;
  /**
   * 입력 x ∈ [0, 1], 출력 y ∈ [0, 1]. compute는 params와 context를 받는다.
   * deterministic shape는 ctx를 무시.
   */
  compute: (x: number, params: P, ctx: ShapeComputeContext) => number;
  /** 매 호출마다 결과가 달라질 수 있으면 true. */
  isStochastic?: boolean;
  /** 작은 미리보기 곡선을 그릴 SVG path d 문자열. (0,0)이 좌상단. */
  previewPath: (w: number, h: number, params: P) => string;
}
