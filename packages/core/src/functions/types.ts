import type { z } from 'zod';

export type Rng = () => number;

export interface ShapeComputeContext {
  /** 매 evaluation마다 호출 가능한 RNG (stochastic shape용). seedable. */
  rng: Rng;
}

/**
 * 인라인 파라미터 편집기에 보일 number 입력 메타데이터.
 * shape마다 자기 params 중 사용자가 직접 만질 수 있는 것을 선언한다.
 * piecewise·stochastic처럼 구조가 복잡한 params는 dedicated editor가 따로
 * 처리하므로 paramFields는 비워둔다.
 */
export interface ShapeParamField {
  /** params 객체에서의 key. */
  key: string;
  labels: { ko: string; en: string };
  /** 슬라이더·input의 범위 hint. 미지정 시 free. */
  min?: number;
  max?: number;
  step?: number;
  hint?: { ko: string; en?: string };
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
  /**
   * 인라인 편집 가능한 number param 메타데이터. 없으면 picker는 shape 선택만
   * 하고 닫힌다. 있으면 picker가 그대로 열린 채 편집 UI를 함께 보여준다.
   */
  paramFields?: ShapeParamField[];
}
