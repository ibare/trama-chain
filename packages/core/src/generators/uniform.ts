import { numericValue } from '../model/index.js';
import { nextMulberry } from './prng.js';
import type { GeneratorParadigm } from './types.js';

/**
 * 균등분포 랜덤 numeric 생성기 패러다임.
 *
 * [min, max] 안의 모든 값이 동일한 확률로 나온다. PDF가 평평한 직사각형 — 주사위·
 * 카탈로그 무작위 선택처럼 "어디서 뽑힐지 동등하게 모름"인 시나리오용.
 *
 * - initCursor: prngState = params.seed. 같은 seed로 재초기화하면 같은 시퀀스 재현.
 * - emit: cursor.prngState에서 [0,1) r을 뽑고, params.min/max 범위로 매핑.
 *   integer=true면 floor(min + r*(max-min+1)) — max 포함.
 *   integer=false면 min + r*(max-min) — max 미포함 표준 균등분포.
 * - peek: 동일 r을 보되 prngState는 진행하지 않는다.
 */
export const uniformParadigm: GeneratorParadigm<
  { kind: 'uniform'; min: number; max: number; integer: boolean; seed: number },
  { kind: 'uniform'; prngState: number }
> = {
  kind: 'uniform',
  outputInterpolation: 'continuous',
  initCursor: (params) => ({ kind: 'uniform', prngState: params.seed | 0 }),
  emit: (params, cursor) => {
    const { r, nextState } = nextMulberry(cursor.prngState);
    const n = mapR(r, params);
    return {
      value: numericValue(n, 'free'),
      nextCursor: { kind: 'uniform', prngState: nextState },
    };
  },
  peek: (params, cursor) => {
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
