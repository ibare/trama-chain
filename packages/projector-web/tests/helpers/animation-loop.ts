import type { AnimationLoop } from '../../src/canvas/animation-loop.js';

/**
 * 테스트용 AnimationLoop — RAF 가 안 도는 vitest 환경에서 수동으로 프레임을
 * 진행한다. register 한 ticker 들을 `flushFrame()` 호출 시 한 번씩 실행한다.
 *
 * - register: 콜백을 set 에 추가하고 unregister 클로저 반환.
 * - flushFrame(n=1): 프레임 n 회 진행 — 각 회마다 등록된 ticker 들을 모두 호출.
 * - tickerCount: 현재 등록된 ticker 수. 누수/중복 등록 회귀 검증용.
 * - dispose: 모든 ticker 제거. 테스트 후 정리.
 */
export interface MockAnimationLoop extends AnimationLoop {
  flushFrame(n?: number): void;
  tickerCount(): number;
}

export function createMockAnimationLoop(): MockAnimationLoop {
  const tickers = new Set<() => void>();

  return {
    register(t) {
      tickers.add(t);
      return () => {
        tickers.delete(t);
      };
    },
    dispose() {
      tickers.clear();
    },
    flushFrame(n = 1) {
      for (let i = 0; i < n; i++) {
        const snapshot = Array.from(tickers);
        for (const t of snapshot) t();
      }
    },
    tickerCount() {
      return tickers.size;
    },
  };
}
