import { numericValue } from '../model/index.js';
import type { GeneratorParadigm } from './types.js';

/**
 * 자체 시간 결정성이 없는 paradigm(counter/uniform/normal)이 공유하는 발화 주기.
 * 1초당 6회 — 167ms 간격. pulse·step·schedule처럼 paradigm 자신이 발화 시점을
 * 결정하지 않으므로, 시각화·누적 부담을 안정적으로 만들기 위해 외부에서 throttle.
 *
 * 사용자 결정(임시): 향후 "스트림 vs 이벤트" 분화 리팩토링에서 발화 빈도가 paradigm
 * 메타데이터로 승격될 예정. 그때까지는 hardcoded 상수.
 */
const FIRE_INTERVAL_MS = 1000 / 6;

/**
 * 1,2,3... 증가 카운터 패러다임.
 *
 * - initCursor: nextValue = params.start, nextFireMs = simulationTimeMs (즉시 첫 발화).
 * - emit: simulationTimeMs < nextFireMs면 freeze. 그 외엔 nextValue 출력 후
 *   nextValue += step, nextFireMs += FIRE_INTERVAL_MS (drift-free 누적).
 * - peek: 같은 시각 가드, cursor 진행 없음.
 */
export const counterParadigm: GeneratorParadigm<
  { kind: 'counter'; start: number; step: number },
  { kind: 'counter'; nextValue: number; nextFireMs: number }
> = {
  kind: 'counter',
  outputInterpolation: 'discrete',
  initCursor: (params, simulationTimeMs) => ({
    kind: 'counter',
    nextValue: params.start,
    nextFireMs: simulationTimeMs,
  }),
  emit: (params, cursor, simulationTimeMs) => {
    if (simulationTimeMs < cursor.nextFireMs) {
      return { value: undefined, nextCursor: cursor };
    }
    return {
      value: numericValue(cursor.nextValue, 'free'),
      nextCursor: {
        kind: 'counter',
        nextValue: cursor.nextValue + params.step,
        nextFireMs: cursor.nextFireMs + FIRE_INTERVAL_MS,
      },
    };
  },
  peek: (_params, cursor, simulationTimeMs) =>
    simulationTimeMs < cursor.nextFireMs
      ? undefined
      : numericValue(cursor.nextValue, 'free'),
  resyncCursor: (cursor, simulationTimeMs) => ({
    ...cursor,
    nextFireMs: Math.max(cursor.nextFireMs, simulationTimeMs),
  }),
};
