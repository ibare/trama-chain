import type { GeneratorParams, Value } from '../model/index.js';
import type { FunctionHandle } from '../execution/exec-value.js';

/**
 * 생성기 cursor — paradigm 안의 내부 상태. ExecutionState에 노드별로 보관되며
 * emit 시점마다 다음 cursor로 진행한다.
 *
 * `kind`는 GeneratorParams의 `kind`와 일대일 — paradigm registry가 어떤 cursor
 * 모양을 만들고 갱신해야 하는지 결정한다.
 */
export type GeneratorCursor =
  /**
   * counter: 다음 emit 시 출력할 값 + 다음 발화 예정 시각.
   * - nextValue: start로 초기화, 발화 시 += step.
   * - nextFireMs: 자체 시간 결정성이 없는 paradigm이라 외부 throttle로 발화 주기를
   *   고정한다 (현재 ≈167ms = 1초 6회). pulse와 동일한 drift-free 누적.
   */
  | { kind: 'counter'; nextValue: number; nextFireMs: number }
  /** uniform: PRNG의 현재 state + 다음 발화 예정 시각. seed로 초기화. */
  | { kind: 'uniform'; prngState: number; nextFireMs: number }
  /** normal: PRNG의 현재 state + 다음 발화 예정 시각. Box-Muller가 발화마다 2칸 진행. */
  | { kind: 'normal'; prngState: number; nextFireMs: number }
  /**
   * sine: 상태 없음. 출력은 simulationTimeMs와 params로만 결정.
   * y(t) = amplitude * sin(omega * t/1000), t는 ms. 위상·영점 0 고정.
   * omega 단위는 rad/s — 주기 T(s) = 2π/omega, 주파수 f(Hz) = omega/(2π).
   */
  | { kind: 'sine' }
  /** step: 상태 없음. 출력은 simulationTimeMs와 params.startMs로만 결정. */
  | { kind: 'step' }
  /** pulse: 다음 발화 예정 시각(ms). drift-free 누적 — 발화 시 += periodMs. */
  | { kind: 'pulse'; nextFireMs: number }
  /** schedule: 상태 없음. 출력은 simulationTimeMs와 params.points로만 결정. */
  | { kind: 'schedule' };

/**
 * 노드별 런타임 상태. 시뮬레이션 시간이 진행하는 동안 매 step emit한다 — 노드별
 * 토글은 없고, 글로벌 paused만이 시간(그리고 emit)의 단일 출처. 입력 boolean
 * gate 가 연결되어 있을 때만 gateOpen 캐시가 emit 여부를 좌우한다.
 */
export interface GeneratorRuntime {
  cursor: GeneratorCursor;
  /**
   * 입력 boolean gate 캐시. 미연결이면 undefined.
   *
   * **인과 모델**: ticker는 이 캐시만 보고 emit 여부를 결정한다. source의
   * 현재 state.values를 직접 읽으면 펄스가 엣지를 통과하기도 전에 효과가
   * 발현되어 시각·논리가 어긋난다. 이 캐시는 펄스 도착 시점(또는 모델
   * 변경에 따른 propagate 시점)에만 갱신된다.
   *
   * - 비연결 generator는 이 필드를 사용하지 않는다 (항상 emit).
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
 * - 'continuous': 출력이 시간에 따라 매끄럽게 변하는 paradigm. 현재 sine 하나뿐 —
 *   매 emit마다 phase가 미세하게 진행되어 자연스러운 곡선을 그린다. 시각화 측에서
 *   두 emit 사이를 wallTime 비율로 lerp하거나 stroke 색온도·opacity를 매 frame
 *   변조해도 의미가 보존된다.
 * - 'discrete': 이산 이벤트로만 값이 바뀌는 paradigm. counter·uniform·normal은
 *   throttle된 발화 사이에 값이 유지되고, step·pulse·schedule은 본질적으로 계단/
 *   펄스다. 시각화는 즉시 전환(펄스 cascade)으로 렌더해야 한다.
 *
 * random(uniform·normal)이 향후 별도 paradigm으로 분화될 때 분류가 다시 흔들릴
 * 수 있다 — 그때까지는 sine만 continuous, 나머지 모두 discrete.
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
  ): { value: Value | FunctionHandle | undefined; nextCursor: C };
  peek(
    params: P,
    cursor: C,
    simulationTimeMs: number,
  ): Value | FunctionHandle | undefined;
}
