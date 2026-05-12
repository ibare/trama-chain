import type { ResolvedUnit, UnitCategory } from '../units/index.js';

/**
 * 함수 슬롯이 받을 수 있는 입력의 단위 제약.
 *
 * - `any`: 어떤 단위든. 함수가 자체적으로 의미를 잡는다(곱셈 등).
 * - `number`: 연속값(kind === 'number') 단위만. 척도(scale)도 number-like이므로 허용.
 * - `sameAsSlot`: 지정된 슬롯과 같은 단위여야. 덧셈·뺄셈·min/max에 쓰임.
 * - `category`: 특정 단위 카테고리(physical, temperature 등)만.
 */
export type FunctionInputConstraint =
  | { kind: 'any' }
  | { kind: 'number' }
  | { kind: 'sameAsSlot'; ref: number }
  | { kind: 'category'; category: UnitCategory };

export interface FunctionSlot {
  /** 슬롯의 의미적 이름. UI에 작게 표시됨. */
  label: { ko: string; en: string };
  constraint: FunctionInputConstraint;
}

export interface FunctionDefinition {
  key: string;
  labels: { ko: string; en: string };
  /** 노드 중앙에 큰 글자로 표시되는 심볼. 예: "×", "+", "min". */
  symbol: string;
  /**
   * 슬롯 정의. arity = slots.length. 슬롯 순서가 의미 있는 함수(나눗셈 등)는
   * 슬롯 라벨로 사용자에게 노출.
   */
  slots: readonly FunctionSlot[];
  /**
   * 슬롯 순서대로 raw 입력값을 받아 raw 출력. 정규화 거치지 않음.
   * - 도메인 외 결과는 NaN/Infinity 가능 — propagate가 validNodes에서 제외.
   */
  compute: (inputs: number[]) => number;
  /**
   * 출력 단위를 자동 도출. 못 정하면 null 반환 — 사용자가 outputUnitId를 직접
   * 지정해야 의미 있는 단위가 됨(미지정 시 free 폴백).
   *
   * `sameAsSlot` 제약이 있는 함수는 자연스럽게 슬롯 0의 단위를 그대로 쓴다.
   */
  deriveOutputUnit?: (inputUnits: readonly ResolvedUnit[]) => string | null;
}
