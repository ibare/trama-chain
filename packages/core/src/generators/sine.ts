import { numericValue } from '../model/index.js';
import type { GeneratorParadigm } from './types.js';

/**
 * 사인파 생성기 패러다임 — y = offset + amplitude * sin(omega * t + phase).
 *
 * 교과서 표현 `y = A·sin(ω·t + φ) + D`를 그대로 노출한다. t는 emit step
 * (정수 카운터). ω는 emit당 라디안. T(주기) = 2π / ω, f(주파수) = ω / 2π.
 *
 * 활용:
 * - 수학: A·ω·φ 슬라이더로 사인파 변형 시연.
 * - 물리: 단진동(용수철·진자), 파동, 음파.
 * - 생물: 호르몬 일주기, 수면 사이클 — offset이 평균값.
 * - 지구과학: 계절 기온·일조량·조수 — offset이 연평균.
 * - 음악: 음파의 본형, 주파수 = ω/(2π).
 *
 * 결정성: sine 자체가 결정적이라 seed 불필요. cursor는 step 카운터만 유지.
 *
 * - initCursor: step=0. 첫 emit은 amplitude·sin(phase) + offset.
 * - emit: 현재 step으로 값 계산, step += 1.
 * - peek: 동일 계산, step 진행하지 않음.
 */
export const sineParadigm: GeneratorParadigm<
  { kind: 'sine'; amplitude: number; omega: number; phase: number; offset: number },
  { kind: 'sine'; step: number }
> = {
  kind: 'sine',
  initCursor: () => ({ kind: 'sine', step: 0 }),
  emit: (params, cursor) => ({
    value: numericValue(sampleAt(params, cursor.step), 'free'),
    nextCursor: { kind: 'sine', step: cursor.step + 1 },
  }),
  peek: (params, cursor) => numericValue(sampleAt(params, cursor.step), 'free'),
};

function sampleAt(
  params: { amplitude: number; omega: number; phase: number; offset: number },
  step: number,
): number {
  return params.offset + params.amplitude * Math.sin(params.omega * step + params.phase);
}
