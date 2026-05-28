import type { ExecutionState } from '@trama-chain/core';

/**
 * ExecutionState 부분 갱신을 단일 머지로 캡슐화 — model-store 안에서 store.setState
 * 가 `executionState: { ...s.executionState, ...partial }` 패턴을 11 곳에서 직접
 * 쓰던 것을 한 자리로 모은다.
 *
 * 효과:
 *  1. ExecutionState 에 새 필드가 추가되어도 모든 호출자가 자동 보존 — 호출자가
 *     명시하지 않은 필드는 prev 의 값을 그대로 이어받는다. 호출자별로 한 필드를
 *     빠뜨려 누적 상태가 리셋되는 사고가 컴파일 시점이 아닌 런타임에 드러나던
 *     패턴 (감사 §6.2 (e)) 의 표면 제거.
 *  2. invariant 가 한 자리에 모인다 — 추후 partial 결합 시점에 cross-field 검증
 *     (예: valid ↔ pending 상호 배타) 을 한 곳에서 강제할 수 있다.
 *
 * zustand `setState` 의 callback 형태와 object 형태 양쪽에서 사용 가능 — 호출자가
 * setState 호출의 spread shape 을 짤 때 `executionState: commitExecutionState(s.executionState, { ... })`
 * 한 줄로 통일.
 */
export function commitExecutionState(
  prev: ExecutionState,
  partial: Partial<ExecutionState>,
): ExecutionState {
  return { ...prev, ...partial };
}
