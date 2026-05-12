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

/**
 * 소켓을 카드 변 위 어느 지점에 매다는지 — UI 위치 메타.
 * 비가환 함수(나눗셈·뺄셈)는 슬롯 위치 자체로 의미를 전달하기 위해 사용.
 *
 * - `side`: 어느 변에 붙는지. left/right는 보통 입출력, top/bottom은 분기·합류용.
 * - `t`: 변을 따른 정규화 좌표. 0=상단/좌측, 1=하단/우측, 0.5=중앙.
 *   카드 모서리에 가까이 두고 싶으면 0.15·0.85 같은 값을 쓴다.
 */
export interface SocketAnchor {
  side: 'left' | 'right' | 'top' | 'bottom';
  t: number;
}

export interface FunctionSlot {
  /** 슬롯의 의미적 이름. UI에 작게 표시됨. */
  label: { ko: string; en: string };
  constraint: FunctionInputConstraint;
  /**
   * 소켓을 카드 어디에 둘지. 비가환 함수에서 슬롯 의미를 위치로 전달하기 위해 사용.
   * 미지정 시 좌측 변에 슬롯들이 균등 분포(폴백). 가환 함수(곱셈·덧셈 등)는 폴백으로 충분.
   */
  anchor?: SocketAnchor;
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
   * 출력 소켓 위치. 미지정 시 우측 변 중앙(폴백).
   * 출력 의미가 특수한 함수(예: 분기·다축 결과)는 명시할 수 있다.
   */
  outputAnchor?: SocketAnchor;
  /**
   * 슬롯 순서대로 raw 입력값을 받아 raw 출력. 정규화 거치지 않음.
   * - 도메인 외 결과는 NaN/Infinity 가능 — propagate가 validOutputs에서 제외.
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
