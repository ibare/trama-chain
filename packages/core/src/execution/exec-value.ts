import type { Value } from '../model/index.js';

/**
 * 런타임 전용 "포장된 값" — 데이터 본체에 부가 메타 정보를 한 단계 감싼다.
 *
 * 현재 단일 사용처: Condition(If) 노드 통과 시 입력값에 평가 결과(참/거짓)를
 * meta 로 부착해 다운스트림에 전달. 일반 노드는 `value`만 읽기에 동작에 영향이
 * 없고, 메타 인식 노드(예: Generator의 boolean gate)만 `meta`를 활용한다.
 *
 * 모델/스키마 레이어에는 의도적으로 등장하지 않는다. WrappedValue 는 propagation
 * 사이에서만 살아 있는 runtime envelope 이라 직렬화·round-trip 의 1급 시민이 아니다.
 *
 * **Lifecycle**: WrappedValue 는 입력값을 그대로 통과시키는 노드(passthrough)에서만
 * 유지된다. 계산 노드는 입력 → 새 값 변환 과정에서 자연스럽게 unwrap 한 뒤
 * 새 값을 출력하므로 meta 가 사라진다 — "값이 바뀌면 짝이 풀린다"는 자연스러운 결과.
 */
export interface WrappedValue {
  kind: 'wrapped';
  value: Value;
  meta: Value;
}

/** 실행 시 전파되는 값의 단위. 원시 Value 또는 메타가 부착된 WrappedValue. */
export type ExecValue = Value | WrappedValue;

export function isWrapped(ev: ExecValue): ev is WrappedValue {
  return ev.kind === 'wrapped';
}

/** envelope 생성. 동일 value 라도 meta 다르면 다른 인스턴스. */
export function wrap(value: Value, meta: Value): WrappedValue {
  return { kind: 'wrapped', value, meta };
}

/**
 * envelope 의 알맹이 값을 꺼낸다. raw Value 이면 그대로 반환.
 * 일반 노드(메타 무관)는 ExecValue 를 받으면 이 헬퍼로 정규화한다.
 */
export function unwrap(ev: ExecValue): Value {
  return ev.kind === 'wrapped' ? ev.value : ev;
}

/**
 * envelope 의 메타를 꺼낸다. raw Value 면 null — 메타가 없다는 1급 신호.
 * 메타 인식 노드(Generator boolean gate 등)는 이 값을 분기 입력으로 사용한다.
 */
export function metaOf(ev: ExecValue): Value | null {
  return ev.kind === 'wrapped' ? ev.meta : null;
}
