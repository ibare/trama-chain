/**
 * 값 도메인 모델 — 노드 출력의 시멘틱 타입.
 *
 * 신호가 흐르는 모든 자리(노드 출력·엣지·ExecutionState.values·식 변수 바인딩)는
 * 이 sum type을 통과한다. 단위(unit)는 numeric Value 안에 종속된다 —
 * "단위"는 연속/이산 수치의 의미론이지 boolean·enum과 무관하다.
 *
 * 자동 변환 없음: numeric↔boolean coercion은 명시적 노드(예: Comparison)로만.
 */

export type ValueKind = Value['kind'];

export type Value = NumericValue | BooleanValue;

export interface NumericValue {
  kind: 'numeric';
  n: number;
  /** 카탈로그 단위 키. raw 흐름이면 'free' 또는 'raw'. */
  unitId: string;
}

export interface BooleanValue {
  kind: 'boolean';
  b: boolean;
}

export function numericValue(n: number, unitId: string): NumericValue {
  return { kind: 'numeric', n, unitId };
}

export function booleanValue(b: boolean): BooleanValue {
  return { kind: 'boolean', b };
}

export function isNumericValue(v: Value): v is NumericValue {
  return v.kind === 'numeric';
}

export function isBooleanValue(v: Value): v is BooleanValue {
  return v.kind === 'boolean';
}

/** 디버깅·로깅용. UI 표시에는 단위 시스템을 거쳐 포맷해야 한다. */
export function describeValue(v: Value): string {
  if (v.kind === 'numeric') return `${v.n}(${v.unitId})`;
  return v.b ? 'true' : 'false';
}
