import { numericValue } from '../model/index.js';
import { functionHandle } from '../execution/exec-value.js';
import type { GeneratorParadigm } from './types.js';

/**
 * 사인파 생성기 패러다임 — y(t) = amplitude * sin(omega * t/1000).
 *
 * 시간 기반(time-based) — emit·peek는 simulationTimeMs를 직접 받아 그 시각의
 * 신호값을 계산한다. cursor에는 상태가 없다. counter/uniform/normal과 달리
 * 외부 throttle도 없어 propagate가 호출되는 모든 시점에서 매끄러운 곡선을
 * 그린다. 시각화는 이 paradigm의 outputInterpolation: 'continuous'를 보고
 * stroke 색온도·opacity·width를 매 frame 변조할 수 있다.
 *
 * **FunctionHandle**: emit·peek는 즉시 값이 아니라 `peek(t)` closure를 담은
 * FunctionHandle을 반환한다. 다운스트림은 두 가지 방식으로 환원한다:
 *  - 로직 노드(ValueNode·Expression·Combiner 등): `resolveScalar(ev, t)`로
 *    그 propagate 시점의 값을 한 번 추출해 ScalarExec로 환원해 사용.
 *  - 시각 노드(EdgeView 등): 같은 핸들을 ticker 안에서 sub-frame t로 다시 peek해
 *    부드러운 modulation을 그린다. peek는 결정적·부작용 없음.
 *
 * params:
 * - amplitude (A): 신호 진폭
 * - omega (ω): 각속도 rad/s — 주기 T(s) = 2π/ω, 주파수 f(Hz) = ω/(2π)
 *
 * 위상(φ)·영점(D)은 0으로 고정 — 노드 본문 노출 가치가 낮아 UI에서 빠졌고,
 * 결정성·물성 시각 영향도 amplitude·omega 두 축으로 충분히 표현된다.
 *
 * 활용:
 * - 수학: A·ω 슬라이더로 사인파 변형 시연.
 * - 물리: 단진동(용수철·진자), 파동, 음파.
 * - 생물: 호르몬 일주기, 수면 사이클.
 * - 지구과학: 계절 기온·일조량·조수.
 * - 음악: 음파의 본형.
 *
 * 결정성: 동일 params + 동일 simulationTimeMs ⇒ 동일 결과. seed 불필요.
 */
export const sineParadigm: GeneratorParadigm<
  { kind: 'sine'; amplitude: number; omega: number },
  { kind: 'sine' }
> = {
  kind: 'sine',
  outputInterpolation: 'continuous',
  initCursor: () => ({ kind: 'sine' }),
  emit: (params) => ({
    value: functionHandle((t) => numericValue(sampleAt(params, t), 'free')),
    nextCursor: { kind: 'sine' },
  }),
  peek: (params) =>
    functionHandle((t) => numericValue(sampleAt(params, t), 'free')),
  // 시간의 순수 함수 — cursor 에 시간 상태 없음. freeze 동안 sim 시간이 흘렀어도
  // emit 이 t 를 직접 받아 결정하므로 cursor 동기화 불필요.
  resyncCursor: (cursor) => cursor,
};

/** y(t) — t는 simulationTimeMs(ms). omega는 rad/s이므로 t/1000으로 환산. */
function sampleAt(
  params: { amplitude: number; omega: number },
  simulationTimeMs: number,
): number {
  return params.amplitude * Math.sin(params.omega * (simulationTimeMs / 1000));
}
