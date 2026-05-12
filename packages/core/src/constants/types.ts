/**
 * 상수 카탈로그 항목. 이미 잘 알려진 수치(π·e·중력가속도 등)를
 * 라벨·심볼·설명과 함께 모아 사용자가 빠르게 끌어다 쓸 수 있게 한다.
 */
export interface ConstantDefinition {
  /** 카탈로그 키. 노드의 constantKey에 저장된다. */
  key: string;
  /** UI 라벨. ko/en 두 가지. */
  labels: { ko: string; en: string };
  /** 노드 카드 중앙에 표시되는 심볼/짧은 표기. 예: "π", "½", "g". */
  symbol: string;
  /** 실제 수치. 무리수는 일반적인 정밀도(double)로 근사. */
  value: number;
  /** 짧은 도메인 설명. 사용자에게 의미를 환기시키는 한 줄. */
  description?: { ko: string; en: string };
  /** 카테고리 — UI에서 묶음 표시용. 예: "math", "physics". */
  category: 'math' | 'physics' | 'custom';
}
