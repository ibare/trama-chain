import { numericValue } from '../model/index.js';
import type { GeneratorParadigm } from './types.js';

/**
 * mulberry32 — 32-bit deterministic PRNG. seed에서 시작해 매 호출마다 state가 진행.
 * 결과는 [0, 1) 균등 분포. small, well-mixed for non-crypto 용도.
 */
function nextMulberry(state: number): { r: number; nextState: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { r, nextState: s };
}

/**
 * 랜덤 numeric 생성기 패러다임.
 *
 * - initCursor: prngState = params.seed. 같은 seed로 재초기화하면 같은 시퀀스 재현.
 * - emit: cursor.prngState에서 [0,1)을 뽑고, params.min/max 범위로 매핑.
 *   integer=true면 floor(min + r*(max-min+1)) — max 포함.
 *   integer=false면 min + r*(max-min) — max 미포함 표준 균등분포.
 */
export const randomParadigm: GeneratorParadigm<
  { kind: 'random'; min: number; max: number; integer: boolean; seed: number },
  { kind: 'random'; prngState: number }
> = {
  kind: 'random',
  initCursor: (params) => ({ kind: 'random', prngState: params.seed | 0 }),
  emit: (params, cursor) => {
    const { r, nextState } = nextMulberry(cursor.prngState);
    const n = mapR(r, params);
    return {
      value: numericValue(n, 'free'),
      nextCursor: { kind: 'random', prngState: nextState },
    };
  },
  peek: (params, cursor) => {
    // emit과 동일한 r을 뽑되 cursor는 진행시키지 않는다 — 결과만 본다.
    const { r } = nextMulberry(cursor.prngState);
    return numericValue(mapR(r, params), 'free');
  },
};

/** [0,1) r을 params 범위로 매핑. emit·peek 공통 경로. */
function mapR(
  r: number,
  params: { min: number; max: number; integer: boolean },
): number {
  if (params.integer) {
    // max 포함 정수 균등분포. min/max swap 안전.
    const lo = Math.min(params.min, params.max);
    const hi = Math.max(params.min, params.max);
    const n = Math.floor(lo + r * (hi - lo + 1));
    return n > hi ? hi : n; // r==1-epsilon 경계 케이스 안전망
  }
  return params.min + r * (params.max - params.min);
}
