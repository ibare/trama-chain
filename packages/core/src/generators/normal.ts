import { numericValue } from '../model/index.js';
import { nextMulberry } from './prng.js';
import type { GeneratorParadigm } from './types.js';

/** counter/uniform/normal 공유 발화 주기. 임시 결정 — 향후 paradigm 메타로 승격. */
const FIRE_INTERVAL_MS = 1000 / 6;

/**
 * 정규분포 랜덤 numeric 생성기 패러다임.
 *
 * 평균 mean 근처에서 가장 자주, 멀어질수록 급격히 드물게 나온다. 약 68%가
 * [μ−σ, μ+σ], 95%가 [μ−2σ, μ+2σ] 구간 — 자연계 측정 오차·신장·노이즈 같은
 * "평균은 알지만 분산이 있는 양"을 모사할 때 쓴다. min/max 같은 hard cutoff는
 * 없다 (이론상 무한 범위, 꼬리는 거의 0).
 *
 * 구현은 Box-Muller 변환: 두 개의 균등 r1, r2에서 두 개의 표준정규 z0, z1을
 * 만든다. emit은 z0만 쓰고 prngState를 2칸 진행 — z1은 버린다. 결정성 유지를
 * 위해 cursor에 캐시를 두지 않고 매번 두 r을 다시 뽑는 단순 모델.
 *
 * cursor.nextFireMs는 자체 시간 결정성이 없는 paradigm을 외부 throttle로
 * 묶기 위한 필드 — pulse와 동일한 drift-free 누적.
 */
export const normalParadigm: GeneratorParadigm<
  { kind: 'normal'; mean: number; stdev: number; seed: number },
  { kind: 'normal'; prngState: number; nextFireMs: number }
> = {
  kind: 'normal',
  outputInterpolation: 'continuous',
  initCursor: (params, simulationTimeMs) => ({
    kind: 'normal',
    prngState: params.seed | 0,
    nextFireMs: simulationTimeMs,
  }),
  emit: (params, cursor, simulationTimeMs) => {
    if (simulationTimeMs < cursor.nextFireMs) {
      return { value: undefined, nextCursor: cursor };
    }
    const { z, nextState } = boxMullerZ0(cursor.prngState);
    return {
      value: numericValue(params.mean + params.stdev * z, 'free'),
      nextCursor: {
        kind: 'normal',
        prngState: nextState,
        nextFireMs: cursor.nextFireMs + FIRE_INTERVAL_MS,
      },
    };
  },
  peek: (params, cursor, simulationTimeMs) => {
    if (simulationTimeMs < cursor.nextFireMs) return undefined;
    const { z } = boxMullerZ0(cursor.prngState);
    return numericValue(params.mean + params.stdev * z, 'free');
  },
};

/**
 * Box-Muller: (u1, u2) → z0 표준정규(N(0,1)).
 * u1==0이면 log가 발산하므로 epsilon으로 클램프.
 * z1 = sqrt(-2 ln u1) * sin(2π u2)는 계산하지 않고 버린다.
 */
function boxMullerZ0(state: number): { z: number; nextState: number } {
  const a = nextMulberry(state);
  const u1 = a.r < 1e-10 ? 1e-10 : a.r;
  const b = nextMulberry(a.nextState);
  const u2 = b.r;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return { z, nextState: b.nextState };
}
