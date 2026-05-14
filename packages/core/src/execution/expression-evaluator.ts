/**
 * ExpressionNode 전파에 필요한 동기 평가자 인터페이스.
 * core 패키지는 fizzex 같은 수식 파서에 직접 의존하지 않기 위해
 * 이 인터페이스만 노출하고, 실제 구현체는 호출 측(projector-web 등)에서 주입한다.
 *
 * **타입 도메인**: numeric 전용. 변수 바인딩은 raw number로만 들어온다.
 * boolean Value 입력은 식 노드 디스크립터(kinds.ts)에서 evaluator 호출 *이전에*
 * unsupported 진단으로 거부된다 — 이 인터페이스는 boolean을 모른다.
 */

/** 식이 요구하는 자유변수와 등장하는 수학 상수. */
export interface BindingAnalysis {
  /** 호스트가 공급해야 하는 자유변수 이름 (정규화·정렬·중복 제거). */
  required: readonly string[];
  /** 식에 등장하는 수학 상수 이름 (정규화·정렬·중복 제거). */
  constants: readonly string[];
}

/** 식이 현재 평가 가능한지(미지원 노드 유무) 정적 분석 결과. */
export interface EvaluabilityAnalysis {
  /** 모든 노드 타입이 평가 가능한 경우 true. */
  evaluable: boolean;
  /** 평가기가 인식하지 못한 노드 타입 (정렬·중복 제거). */
  unsupported: readonly string[];
}

/** 평가 실패 분류 — UI 가 사유 배지/툴팁을 노출할 때 사용. */
export type EvalStatus = 'unbound' | 'domain' | 'divergent' | 'unsupported';

/** 평가 결과(콜드패스) — 실패 시 사유와 부가 정보 포함. */
export type EvalDiagnosis =
  | { ok: true; value: number }
  | { ok: false; status: EvalStatus; variable?: string; nodeType?: string; reason?: string };

export interface ExpressionEvaluator {
  /**
   * 핫패스. 변수 바인딩으로 LaTeX 식을 평가.
   * 평가 불가능하거나 비유한값이면 undefined.
   */
  evaluate(latex: string, variables: Record<string, number>): number | undefined;

  /**
   * 콜드패스. 평가 결과와 실패 사유를 함께 반환.
   * UI 가 invalid 사유 배지/툴팁을 노출할 때 사용한다.
   */
  diagnose(latex: string, variables: Record<string, number>): EvalDiagnosis;

  /**
   * 정적 분석. 식이 요구하는 자유변수·상수와 평가 가능 여부를 동시에 반환.
   * 식 노드 생성/편집 시 1회 호출하여 슬롯/배지 UX 결정에 사용한다.
   */
  analyze(latex: string): BindingAnalysis & EvaluabilityAnalysis;
}

/** 미주입 시 안전 폴백 — 항상 미평가/빈 분석. */
export const noopExpressionEvaluator: ExpressionEvaluator = {
  evaluate: () => undefined,
  diagnose: () => ({ ok: false, status: 'unsupported', reason: 'no-evaluator' }),
  analyze: () => ({ required: [], constants: [], evaluable: false, unsupported: [] }),
};
