import { numericValue } from '../model/index.js';
import type { GeneratorParadigm } from './types.js';

/**
 * 스텝 generator 패러다임 — 시뮬레이션 시간 t가 startMs 미만이면 출력이 정의되지
 * 않은(freeze) 상태, t ≥ startMs부터 지정된 value를 계속 출력한다.
 *
 * - t < startMs: emit/peek 모두 undefined를 반환. 호출자가 ctx.next/validOutputs를
 *   건드리지 않아 다운스트림은 invalid(또는 직전 값) 상태를 유지.
 * - t ≥ startMs: numericValue(value, 'free') 출력.
 *
 * 시간의 순수 함수이므로 cursor에 상태가 없다 — paradigm registry가 매 step마다
 * 같은 빈 cursor를 전달하더라도 결과는 simulationTimeMs로만 결정된다.
 *
 * 활용: 회로 켜짐(t=startMs) 후 일정한 전압 인가, 약물 투여 시각 후 농도 step 등
 * heaviside 계단함수가 필요한 모든 곳.
 */
export const stepParadigm: GeneratorParadigm<
  { kind: 'step'; startMs: number; value: number },
  { kind: 'step' }
> = {
  kind: 'step',
  outputInterpolation: 'discrete',
  initCursor: () => ({ kind: 'step' }),
  emit: (params, _cursor, simulationTimeMs) => ({
    value:
      simulationTimeMs < params.startMs
        ? undefined
        : numericValue(params.value, 'free'),
    nextCursor: { kind: 'step' },
  }),
  peek: (params, _cursor, simulationTimeMs) =>
    simulationTimeMs < params.startMs ? undefined : numericValue(params.value, 'free'),
  // 시간의 순수 함수 — cursor 상태 없음. freeze 동안 sim 시간이 흘러도 emit 이
  // simulationTimeMs vs params.startMs 만으로 결정한다.
  resyncCursor: (cursor) => cursor,
};
