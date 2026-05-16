/**
 * 상수 카탈로그 항목.
 *
 * ValueKind별로 두 형태로 분리된다:
 *  - numeric: π·e·g 등 수치 상수. fizzex 식의 자유변수에 바인딩될 수 있다.
 *  - boolean: 참/거짓 같은 논리 상수. boolean 회로의 시드값.
 *
 * combiner 카탈로그와 동일한 discriminator 패턴 — 검사·UI·노드 생성이
 * ValueKind별로 깔끔하게 분기되도록.
 */

interface ConstantDefinitionBase {
  /** 카탈로그 키. 노드의 constantKey에 저장된다. */
  key: string;
  /** UI 라벨. ko/en 두 가지. */
  labels: { ko: string; en: string };
  /** 노드 카드 중앙에 표시되는 심볼/짧은 표기. 예: "π", "g", "c". */
  symbol: string;
  /** 짧은 도메인 설명. 사용자에게 의미를 환기시키는 한 줄. */
  description?: { ko: string; en: string };
  /** 카테고리 — UI에서 묶음 표시용. 예: "math", "physics". */
  category: 'math' | 'physics' | 'logic' | 'custom';
}

export interface NumericConstantDefinition extends ConstantDefinitionBase {
  valueKind: 'numeric';
  /** 실제 수치. 무리수는 일반적인 정밀도(double)로 근사. */
  value: number;
  /**
   * fizzex 평가기의 정규화 변수명. 식 노드가 분석한 `constants` 슬롯과
   * 매칭되어 자동 연결 후보로 사용된다. 예: PI → 'π', E → 'e'.
   * 매칭 대상이 없는 사용자 상수(예: 단일 값, 도메인 상수)는 생략.
   */
  fizzexName?: string;
}

export interface BooleanConstantDefinition extends ConstantDefinitionBase {
  valueKind: 'boolean';
  /** 참/거짓 상수. */
  value: boolean;
}

export type ConstantDefinition =
  | NumericConstantDefinition
  | BooleanConstantDefinition;
