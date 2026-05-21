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
 *
 * **alue 일반화**: `value` 는 Value 와 [[FunctionHandle]] 모두 담을 수 있다.
 * passthrough 가 source 의 시간 의존 closure 를 wrap envelope 으로 감싸 echo 할 때
 * 핸들이 alue 자리에 그대로 들어간다. 환원은 [[resolveScalar]] 가 단일 자리에서 일괄
 * 수행 — 다운스트림 노드·시각화는 항상 `unwrap(resolveScalar(ev, t))` 패턴으로 읽어
 * Value 를 얻는다.
 */
export interface WrappedValue {
  kind: 'wrapped';
  value: Value | FunctionHandle;
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
 * 시간 의존 출력 핸들 — `peek(simulationTimeMs)`를 호출해야 비로소 그 시각의
 * Value가 결정된다. continuous paradigm(현재 sine 하나)의 출력 모양.
 *
 * **왜**: propagate가 매 rAF tick마다 호출되지만, 시각화는 그보다 더 촘촘한
 * sub-frame 시점에 stroke modulation을 그리고 싶을 때가 있다. FunctionHandle은
 * "현재 propagate tick의 값"이 아니라 "임의 시각의 값을 계산할 수 있는 closure"
 * 를 다운스트림에 흘려보낸다. EdgeView 같은 시각 계층은 ticker 안에서 peek를
 * 다시 호출해 부드러운 곡선을 만들고, 로직 노드는 자기 시점(보통
 * ctx.simulationTimeMs)에서 peek해 일반 Value로 환원해 처리한다.
 *
 * **수명**: propagate tick 안에서만 유효한 runtime envelope. 직렬화하지 않는다.
 * peek는 결정적(동일 t → 동일 결과)이며 부작용이 없다는 계약을 따른다.
 */
export interface FunctionHandle {
  kind: 'function-handle';
  /** 주어진 시각의 신호값. paradigm이 결정성을 책임진다. */
  peek: (simulationTimeMs: number) => Value;
}

/**
 * 스칼라 실행값 (raw) — 단일 값 또는 메타 부착 값. 메타 부착 값 안에는 시간 의존
 * 핸들이 들어 있을 수 있다 (passthrough echo). 직접 unwrap 하면 핸들이 노출돼
 * 다운스트림이 Value 로 가정하는 곳이 깨진다 — 그래서 [[resolveScalar]] 로 먼저
 * [[ResolvedScalar]] 형태로 좁히고 [[unwrap]] 한다.
 */
export type ScalarExec = Value | WrappedValue;

/**
 * 실행 시 전파되는 값의 단위. 엣지·펄스·executionState.values 가 운반하는 모든
 * 값은 이 한 타입이다.
 *
 * - ScalarExec: 즉시 Value로 환원되는 일반 출력 (단, wrapped 내부 핸들은 resolveScalar 선행 필요).
 * - SequenceValue: 누적 sample 시퀀스(평균·trail 등의 입력).
 * - FunctionHandle: 시간 의존 closure — peek로 환원해야 Value가 된다.
 *
 * 다운스트림 노드는 보통 `isSequence` 분기 후 [[resolveScalar]] 로 FunctionHandle을
 * 풀어 [[ResolvedScalar]] 로 환원한 뒤 [[unwrap]]을 부른다.
 */
export type ExecValue = ScalarExec | SequenceValue | FunctionHandle;

/**
 * resolveScalar 통과 후의 ScalarExec — wrapped 내부 핸들이 모두 환원되어
 * `value: Value` 가 보장된다. [[unwrap]] / [[metaOf]] 의 안전한 입력 타입.
 */
export interface WrappedScalar {
  kind: 'wrapped';
  value: Value;
  meta: Value;
}

export type ResolvedScalar = Value | WrappedScalar;

export function isWrapped(ev: ExecValue): ev is WrappedValue {
  return ev.kind === 'wrapped';
}

export function isSequence(ev: ExecValue): ev is SequenceValue {
  return ev.kind === 'sequence';
}

export function isFunctionHandle(ev: ExecValue): ev is FunctionHandle {
  return ev.kind === 'function-handle';
}

/** FunctionHandle 팩토리 — paradigm이 closure를 만들 때 호출. */
export function functionHandle(
  peek: (simulationTimeMs: number) => Value,
): FunctionHandle {
  return { kind: 'function-handle', peek };
}

/**
 * 시간 의존 핸들을 주어진 시각의 [[ResolvedScalar]]로 환원한다. sequence는 입력 불가
 * (호출자가 미리 [[isSequence]] 분기).
 *
 * 두 환원 자리:
 *   1. 인자 자체가 FunctionHandle → `peek(t)` 의 Value.
 *   2. 인자가 WrappedValue 인데 `value` 가 FunctionHandle → 그 alue 만 peek 로 환원,
 *      meta 는 그대로 두어 새 WrappedScalar 생성. (passthrough echo 가 핸들을 wrap
 *      안에 담아 흘려보낸 케이스를 다운스트림이 안전하게 풀 수 있게 단일 자리에서 처리.)
 *
 * 다운스트림 노드의 입력 읽기 표준 패턴:
 * ```
 * const ev = ctx.next[edge.from];
 * if (!ev || isSequence(ev)) freeze;
 * const scalar = resolveScalar(ev, ctx.simulationTimeMs); // ResolvedScalar
 * const v = unwrap(scalar);                                // Value
 * ```
 */
export function resolveScalar(
  ev: ScalarExec | FunctionHandle,
  simulationTimeMs: number,
): ResolvedScalar {
  if (ev.kind === 'function-handle') return ev.peek(simulationTimeMs);
  if (ev.kind === 'wrapped') {
    if (ev.value.kind === 'function-handle') {
      return {
        kind: 'wrapped',
        value: ev.value.peek(simulationTimeMs),
        meta: ev.meta,
      };
    }
    // wrapped.value 가 이미 Value — narrow 후 WrappedScalar 로 통과.
    return ev as WrappedScalar;
  }
  return ev;
}

/** envelope 생성. 동일 value 라도 meta 다르면 다른 인스턴스. value 자리에 시간 의존
 * 핸들을 그대로 담을 수 있다 — passthrough 가 source 의 핸들을 보존해 echo 할 때 사용. */
export function wrap(value: Value | FunctionHandle, meta: Value): WrappedValue {
  return { kind: 'wrapped', value, meta };
}

/**
 * envelope 의 알맹이 값을 꺼낸다. raw Value 이면 그대로 반환.
 * 일반 노드(메타 무관)는 [[ResolvedScalar]] 를 받으면 이 헬퍼로 정규화한다.
 *
 * **반드시 [[resolveScalar]] 를 거친 ResolvedScalar 만 입력 가능** — wrapped.value 가
 * 핸들인 raw WrappedValue 를 직접 unwrap 하면 Value 가 아닌 핸들이 노출돼 다운스트림이
 * 깨진다. 타입 시스템이 컴파일 시점에 강제.
 *
 * **sequence 는 인자로 받지 않는다** — Sequence 는 스칼라가 아니므로 호출자가
 * 미리 [[isSequence]] 로 분기해야 한다.
 */
export function unwrap(ev: ResolvedScalar): Value {
  return ev.kind === 'wrapped' ? ev.value : ev;
}

/**
 * envelope 의 메타를 꺼낸다. raw Value 면 null — 메타가 없다는 1급 신호.
 * 메타 인식 노드(Generator boolean gate 등)는 이 값을 분기 입력으로 사용한다.
 *
 * sequence 는 받지 않는다 (스칼라 전용). 호출자가 미리 [[isSequence]] 로 분기.
 * 입력은 [[ResolvedScalar]] — meta 자체는 Value 만 담는다는 계약이라 resolveScalar
 * 통과 후엔 meta 가 항상 Value.
 */
export function metaOf(ev: ResolvedScalar): Value | null {
  return ev.kind === 'wrapped' ? ev.meta : null;
}

/**
 * 메타 인식 boolean 게이트 추출.
 *
 * 우선순위: 알맹이 boolean → meta boolean → 없음(undefined).
 * - plain boolean Value: 알맹이 그대로 사용
 * - WrappedValue + value:boolean : 알맹이 사용 (메타가 다른 의미를 가져도 알맹이 우선)
 * - WrappedValue + value:numeric + meta:boolean : meta 사용 (Condition 슬롯 출력)
 * - WrappedValue + value:function-handle : 게이트 아님 (시간 의존 신호는 boolean 게이트로 평가 X) — meta 가 boolean 이면 그 쪽을 본다
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
