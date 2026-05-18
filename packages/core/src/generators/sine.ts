import { numericValue } from '../model/index.js';
import type { GeneratorParadigm } from './types.js';

/**
 * 사인파 생성기 패러다임 — y(t) = offset + amplitude * sin(omega * t/1000 + phase).
 *
 * 시간 기반(time-based) — emit·peek는 simulationTimeMs를 직접 받아 그 시각의
 * 신호값을 계산한다. cursor에는 상태가 없다. counter/uniform/normal과 달리
 * 외부 throttle도 없어 propagate가 호출되는 모든 시점에서 매끄러운 곡선을
 * 그린다. 시각화는 이 paradigm의 outputInterpolation: 'continuous'를 보고
 * stroke 색온도·opacity·width를 매 frame 변조할 수 있다.
 *
 * params:
 * - amplitude (A): 신호 진폭
 * - omega (ω): 각속도 rad/s — 주기 T(s) = 2π/ω, 주파수 f(Hz) = ω/(2π)
 * - phase (φ): 위상 오프셋 rad
 * - offset (D): 평균값(y축 shift)
 *
 * 활용:
 * - 수학: A·ω·φ 슬라이더로 사인파 변형 시연.
 * - 물리: 단진동(용수철·진자), 파동, 음파.
 * - 생물: 호르몬 일주기, 수면 사이클.
 * - 지구과학: 계절 기온·일조량·조수.
 * - 음악: 음파의 본형.
 *
 * 결정성: 동일 params + 동일 simulationTimeMs ⇒ 동일 결과. seed 불필요.
 */
export const sineParadigm: GeneratorParadigm<
  { kind: 'sine'; amplitude: number; omega: number; phase: number; offset: number },
  { kind: 'sine' }
> = {
  kind: 'sine',
  outputInterpolation: 'continuous',
  initCursor: () => ({ kind: 'sine' }),
  emit: (params, _cursor, simulationTimeMs) => ({
    value: numericValue(sampleAt(params, simulationTimeMs), 'free'),
    nextCursor: { kind: 'sine' },
  }),
  peek: (params, _cursor, simulationTimeMs) =>
    numericValue(sampleAt(params, simulationTimeMs), 'free'),
};

/** y(t) — t는 simulationTimeMs(ms). omega는 rad/s이므로 t/1000으로 환산. */
function sampleAt(
  params: { amplitude: number; omega: number; phase: number; offset: number },
  simulationTimeMs: number,
): number {
  return (
    params.offset +
    params.amplitude *
      Math.sin(params.omega * (simulationTimeMs / 1000) + params.phase)
  );
}
