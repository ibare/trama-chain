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
  | { kind: 'sine'; step: number };

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
}

/**
 * 패러다임 정의 — params를 받아 cursor를 만들고, cursor에서 한 번 emit해 다음 cursor를 반환.
 *
 * - `initCursor`: params로 cursor 초기 상태 생성. seed/start 등이 여기서 cursor로 들어간다.
 * - `emit`: 현재 cursor로 한 번 출력값을 만들고, 다음 cursor를 함께 반환.
 *   결정성: 동일 params + 동일 cursor면 동일 결과.
 * - `peek`: cursor를 진행시키지 않고 "지금 emit하면 나올 값"만 미리 본다. ▶ 누르기
 *   전 idle 상태 디스플레이와 다운스트림 자연 전파용. peek의 결과는 다음 emit의
 *   value와 일치해야 한다.
 *
 * GeneratorParams는 sum type이라 paradigm은 `kind`로만 매핑되며, registry가 타입을
 * 좁혀 해당 paradigm으로 라우팅한다.
 */
export interface GeneratorParadigm<
  P extends GeneratorParams = GeneratorParams,
  C extends GeneratorCursor = GeneratorCursor,
> {
  kind: P['kind'];
  initCursor(params: P): C;
  emit(params: P, cursor: C): { value: Value; nextCursor: C };
  peek(params: P, cursor: C): Value;
}
