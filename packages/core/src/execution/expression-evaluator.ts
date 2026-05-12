/**
 * ExpressionNode 전파에 필요한 동기 평가자 인터페이스.
 * core 패키지는 fizzex 같은 수식 파서에 직접 의존하지 않기 위해
 * 이 인터페이스만 노출하고, 실제 구현체는 호출 측(projector-web 등)에서 주입한다.
 */
export interface ExpressionEvaluator {
  /**
   * 변수 바인딩으로 LaTeX 식을 평가. 평가 불가능하거나 비유한값이면 undefined.
   * 호출 측에서 결과 캐시/메모이즈는 자유.
   */
  evaluate(latex: string, variables: Record<string, number>): number | undefined;
}

/** 미주입 시 안전 폴백 — 항상 undefined. */
export const noopExpressionEvaluator: ExpressionEvaluator = {
  evaluate: () => undefined,
};
