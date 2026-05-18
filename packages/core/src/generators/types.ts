import type { GeneratorParams, Value } from '../model/index.js';

/**
 * 생성기 cursor — paradigm 안의 내부 상태. ExecutionState에 노드별로 보관되며
 * emit 시점마다 다음 cursor로 진행한다.
 *
 * `kind`는 GeneratorParams의 `kind`와 일대일 — paradigm registry가 어떤 cursor
 * 모양을 만들고 갱신해야 하는지 결정한다.
 */
export type GeneratorCursor =
  /** counter: 다음 emit 시 출력할 값. start로 초기화, emit마다 += step. */
  | { kind: 'counter'; nextValue: number }
  /** uniform: PRNG의 현재 state. seed로 초기화. */
  | { kind: 'uniform'; prngState: number }
  /** normal: PRNG의 현재 state. Box-Muller가 emit마다 2칸 진행. */
  | { kind: 'normal'; prngState: number }
  /** sine: emit step 카운터. y = A·sin(ω·step + φ) + D. */
  | { kind: 'sine'; step: number }
  /** step: 상태 없음. 출력은 simulationTimeMs와 params.startMs로만 결정. */
  | { kind: 'step' }
  /** pulse: 다음 발화 예정 시각(ms). drift-free 누적 — 발화 시 += periodMs. */
  | { kind: 'pulse'; nextFireMs: number }
  /** schedule: 상태 없음. 출력은 simulationTimeMs와 params.points로만 결정. */
  | { kind: 'schedule' };

/**
 * 노드별 런타임 상태. enabled=true인 동안 propagate 단계마다 emit한다.
 * enabled=false면 마지막 출력값을 그대로 유지.
 *
 * - 시작(▶)        : enabled=false → true. cursor는 *유지* (이어짐).
 * - 정지(■)        : enabled=true  → false. cursor·마지막 값 모두 유지.
 * - 초기 상태(↺)    : enabled=false, cursor를 paradigm.initCursor(params)로 재초기화.
 */
export interface GeneratorRuntime {
  enabled: boolean;
  cursor: GeneratorCursor;
  /**
   * 입력 boolean gate 캐시. 미연결이면 undefined.
   *
   * **인과 모델**: ticker는 이 캐시만 보고 emit 여부를 결정한다. source의
   * 현재 state.values를 직접 읽으면 펄스가 엣지를 통과하기도 전에 효과가
   * 발현되어 시각·논리가 어긋난다. 이 캐시는 펄스 도착 시점(또는 모델
   * 변경에 따른 propagate 시점)에만 갱신된다.
   *
   * - 비연결 generator는 이 필드를 사용하지 않는다 (`enabled`가 게이트 역할).
   * - 연결 직후, 첫 펄스가 도달하기 전까지는 undefined → freeze로 수렴.
   */
  gateOpen?: boolean;
}

/**
 * 패러다임 정의 — params를 받아 cursor를 만들고, cursor에서 한 번 emit해 다음 cursor를 반환.
 *
 * - `initCursor`: params·현재 시뮬레이션 시간으로 cursor 초기 상태 생성. seed/start
 *   같은 params 기반 필드와, "지금부터 시작"하는 시간 기반 cursor 필드(예: 펄스의
 *   다음 발화 시각)가 함께 들어간다.
 * - `emit`: 현재 cursor와 현재 시뮬레이션 시간으로 한 번 출력값을 만들고, 다음
 *   cursor를 함께 반환. 출력이 아직 정의되지 않는 시점(예: 스텝 generator의
 *   t < startMs 구간)이면 `value: undefined`로 freeze — 호출자가 ctx.next·
 *   validOutputs를 건드리지 않아 마지막 값(또는 invalid)이 유지된다.
 *   결정성: 동일 params + 동일 cursor + 동일 t면 동일 결과.
 * - `peek`: cursor를 진행시키지 않고 "지금 emit하면 나올 값"만 미리 본다. ▶ 누르기
 *   전 idle 상태 디스플레이와 다운스트림 자연 전파용. peek의 결과는 같은 t에
 *   대한 emit의 value와 일치해야 한다. 미정 시점은 undefined.
 *
 * GeneratorParams는 sum type이라 paradigm은 `kind`로만 매핑되며, registry가 타입을
 * 좁혀 해당 paradigm으로 라우팅한다. 시간 비의존 paradigm(counter/uniform/normal/
 * sine 등 emit 카운터 기반)은 simulationTimeMs 인자를 무시한다.
 */
/**
 * 출력 시간 분포의 본질.
 *
 * - 'continuous': 출력이 시간에 따라 매끄럽게 변하는 paradigm(counter/uniform/
 *   normal/sine 등 매 emit마다 값이 갱신되는 부류). 시각화 측에서 두 emit 사이를
 *   wallTime 비율로 lerp하면 자연스럽다.
 * - 'discrete': 이산 이벤트로만 값이 바뀌는 paradigm(step·pulse·schedule 등).
 *   계단/펄스 형태라 lerp하면 의도된 sharp 전환이 부드러워져 잘못된 시각.
 *   시각화는 이산 paradigm을 즉시 전환으로 렌더해야 한다.
 *
 * 보간 정책은 시각 계층의 책임 — 모델·실행은 이 플래그를 노출만 한다.
 */
export type OutputInterpolation = 'continuous' | 'discrete';

export interface GeneratorParadigm<
  P extends GeneratorParams = GeneratorParams,
  C extends GeneratorCursor = GeneratorCursor,
> {
  kind: P['kind'];
  /**
   * 이 paradigm 출력의 시간 분포 본질. 시각화 측에서 lerp 가/부를 판단하는 단일
   * 근거. NodeKindDescriptor.outputInterpolation()이 generator의 경우 이 값을
   * 위임한다.
   */
  outputInterpolation: OutputInterpolation;
  initCursor(params: P, simulationTimeMs: number): C;
  emit(
    params: P,
    cursor: C,
    simulationTimeMs: number,
  ): { value: Value | undefined; nextCursor: C };
  peek(params: P, cursor: C, simulationTimeMs: number): Value | undefined;
}
