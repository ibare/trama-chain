import { numericValue } from '../model/index.js';
import type { GeneratorParadigm } from './types.js';

/**
 * 펄스 generator 패러다임 — 매 periodMs마다 지정 value를 한 tick 출력한다.
 *
 * cursor.nextFireMs는 "다음 발화 예정 시각". emit 시점에 simulationTimeMs ≥
 * nextFireMs면 발화하고 nextFireMs += periodMs로 진행(drift-free 누적 — 시각
 * 측정 오차 누적 없음). 발화 시각 사이의 tick에서는 undefined로 freeze.
 *
 * - initCursor: nextFireMs = simulationTimeMs. enabled가 된 시각이 곧 첫 발화
 *   시각 — paradigm을 ▶ 누른 순간 즉시 한 번 출력하는 모델.
 * - emit:
 *   - t ≥ nextFireMs면 numericValue(value), nextCursor.nextFireMs = nextFireMs +
 *     periodMs. 누락된 발화는 한 tick에 한 번씩만 보상(catch-up은 안 함) — 다음
 *     tick에서 다시 t ≥ nextFireMs 조건이 충족되면 또 발화.
 *   - 미정 시점은 undefined로 freeze. cursor는 그대로 다음 tick으로 넘긴다.
 * - peek: 발화 시각 여부만 본다. cursor 미진행. emit의 value와 동일한 시각 응답.
 *
 * 결정성: 동일 (params, cursor, t)면 동일 출력. periodMs ≤ 0이면 매 tick 발화
 * (호출자 책임으로 inspector에서 가드).
 */
export const pulseParadigm: GeneratorParadigm<
  { kind: 'pulse'; periodMs: number; value: number },
  { kind: 'pulse'; nextFireMs: number }
> = {
  kind: 'pulse',
  outputInterpolation: 'discrete',
  initCursor: (_params, simulationTimeMs) => ({
    kind: 'pulse',
    nextFireMs: simulationTimeMs,
  }),
  emit: (params, cursor, simulationTimeMs) => {
    if (simulationTimeMs < cursor.nextFireMs) {
      return { value: undefined, nextCursor: cursor };
    }
    return {
      value: numericValue(params.value, 'free'),
      nextCursor: {
        kind: 'pulse',
        nextFireMs: cursor.nextFireMs + params.periodMs,
      },
    };
  },
  peek: (params, cursor, simulationTimeMs) =>
    simulationTimeMs < cursor.nextFireMs ? undefined : numericValue(params.value, 'free'),
};
