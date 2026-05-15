/**
 * mulberry32 — 32-bit deterministic PRNG. seed에서 시작해 매 호출마다 state가 진행.
 * 결과는 [0, 1) 균등 분포. small, well-mixed for non-crypto 용도.
 *
 * 모든 random 계열 paradigm(균등·정규·향후 추가될 분포)의 공통 1차 source.
 * 분포별 paradigm은 이 [0,1) 균등에 inverse-CDF·Box-Muller 같은 변환을 얹어
 * 자기 분포로 매핑한다.
 */
export function nextMulberry(state: number): { r: number; nextState: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { r, nextState: s };
}
