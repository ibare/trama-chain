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

/**
 * 시계열 sample 한 개. value 와 그 sample 이 누적된 simulation time(ms) 페어.
 *
 * "시간" 은 모델 내부 시뮬레이션 시계 — wall clock 이 아니라 trama 가 정의한
 * 시간축. 누적 노드(예: ObserveNode 의 누적 추출 슬롯) 가 펄스 도착 시점의
 * simulation time 을 박제해 sample 에 함께 매단다. 다운스트림 통계/시각화
 * 노드는 t 를 무시하거나(평균) 적극 활용(시계열 trail·미분).
 */
export interface SequenceSample {
  value: Value;
  /** 누적 시점의 simulation time (ms). 단조 비감소. */
  t: number;
}

/**
 * 누적된 sample 시퀀스. 누적 노드의 1급 출력 형태.
 *
 * 다운스트림에 운반될 때마다 *그 시점 누적의 완전 스냅샷* 을 담는다 — delta 가
 * 아니라 전체. 다운스트림 노드는 stateless 함수로 작성되어 매번 fresh 계산만
 * 한다. 결정론·시간 여행(scrub) 친화.
 */
export interface SequenceValue {
  kind: 'sequence';
  samples: readonly SequenceSample[];
}

/**
 * 스칼라 실행값 — 단일 값(또는 메타 부착 값). combiner·shape·port-compat 등
 * 대부분의 라우팅은 스칼라만 다룬다. sequence 는 별도 케이스로 분리되어
 * 컴파일 시점에 잘못된 호출(예: unwrap(SequenceValue)) 을 차단.
 */
export type ScalarExec = Value | WrappedValue;

/**
 * 실행 시 전파되는 값의 단위. 스칼라(Value | WrappedValue) 또는 시퀀스.
 * 엣지·펄스·executionState.values 가 운반하는 모든 값은 이 한 타입이다.
 */
export type ExecValue = ScalarExec | SequenceValue;

export function isWrapped(ev: ExecValue): ev is WrappedValue {
  return ev.kind === 'wrapped';
}

export function isSequence(ev: ExecValue): ev is SequenceValue {
  return ev.kind === 'sequence';
}

/** envelope 생성. 동일 value 라도 meta 다르면 다른 인스턴스. */
export function wrap(value: Value, meta: Value): WrappedValue {
  return { kind: 'wrapped', value, meta };
}

/**
 * envelope 의 알맹이 값을 꺼낸다. raw Value 이면 그대로 반환.
 * 일반 노드(메타 무관)는 ScalarExec 를 받으면 이 헬퍼로 정규화한다.
 *
 * **sequence 는 인자로 받지 않는다** — Sequence 는 스칼라가 아니므로 호출자가
 * 미리 [[isSequence]] 로 분기해야 한다. 타입 시스템이 컴파일 시점에 강제.
 */
export function unwrap(ev: ScalarExec): Value {
  return ev.kind === 'wrapped' ? ev.value : ev;
}

/**
 * envelope 의 메타를 꺼낸다. raw Value 면 null — 메타가 없다는 1급 신호.
 * 메타 인식 노드(Generator boolean gate 등)는 이 값을 분기 입력으로 사용한다.
 *
 * sequence 는 받지 않는다 (스칼라 전용). 호출자가 미리 [[isSequence]] 로 분기.
 */
export function metaOf(ev: ScalarExec): Value | null {
  return ev.kind === 'wrapped' ? ev.meta : null;
}

/**
 * 메타 인식 boolean 게이트 추출.
 *
 * 우선순위: 알맹이 boolean → meta boolean → 없음(undefined).
 * - plain boolean Value: 알맹이 그대로 사용
 * - WrappedValue + value:boolean : 알맹이 사용 (메타가 다른 의미를 가져도 알맹이 우선)
 * - WrappedValue + value:numeric + meta:boolean : meta 사용 (Condition 슬롯 출력)
 * - SequenceValue: 시퀀스는 boolean 게이트가 아님 — undefined
 * - 그 외: 게이트로 쓸 수 없음 → undefined (caller 가 freeze 처리)
 *
 * Generator gate 와 model-store pulse 핸들러가 동일 시맨틱을 공유하도록 단일 헬퍼로 일원화.
 */
export function asBooleanGate(ev: ExecValue): boolean | undefined {
  if (ev.kind === 'boolean') return ev.b;
  if (ev.kind === 'wrapped') {
    if (ev.value.kind === 'boolean') return ev.value.b;
    if (ev.meta.kind === 'boolean') return ev.meta.b;
  }
  return undefined;
}
