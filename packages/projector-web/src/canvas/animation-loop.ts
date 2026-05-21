/**
 * RAF ticker 레지스트리.
 *
 * 케이블 물리 같은 매 프레임 imperative 갱신을 위해 단일 RAF만 유지한다.
 * 등록자가 0이 되면 루프도 자동 정지 — idle 캔버스에서 RAF가 깨어나지 않는다.
 *
 * 인스턴스별 격리: 한 TramaEditor의 RAF가 다른 에디터의 ticker를 호출하지 않음.
 *
 * FPS 측정: `subscribeFps` 로 매 프레임 EWMA fps 를 publish 한다 (α=0.1).
 * 등록자가 0 → RAF 정지 → publish 도 중단되므로 구독자는 stale 감지로 idle
 * 상태를 판정한다 (예: 마지막 update 후 500ms 경과 → '—' 표시).
 */
type Ticker = () => void;
type FpsListener = (fps: number) => void;

export interface AnimationLoop {
  register(t: Ticker): () => void;
  subscribeFps(fn: FpsListener): () => void;
  /** dispose: 진행 중인 RAF를 cancel하고 ticker set을 비운다. */
  dispose(): void;
}

export function createAnimationLoop(): AnimationLoop {
  const tickers = new Set<Ticker>();
  const fpsListeners = new Set<FpsListener>();
  let rafId: number | null = null;
  let lastTimestamp: number | null = null;
  let ewmaFps = 0;

  function loop(now: number): void {
    if (lastTimestamp !== null) {
      const dt = now - lastTimestamp;
      if (dt > 0) {
        const instant = 1000 / dt;
        ewmaFps = ewmaFps === 0 ? instant : ewmaFps * 0.9 + instant * 0.1;
        for (const fn of fpsListeners) fn(ewmaFps);
      }
    }
    lastTimestamp = now;
    const snapshot = Array.from(tickers);
    for (const t of snapshot) t();
    if (tickers.size > 0) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
      // 다음 register 시 첫 프레임은 dt 계산 스킵 — idle 구간을 dt 에 포함하지 않음.
      lastTimestamp = null;
      ewmaFps = 0;
    }
  }

  return {
    register(t: Ticker): () => void {
      tickers.add(t);
      if (rafId === null) {
        rafId = requestAnimationFrame(loop);
      }
      return () => {
        tickers.delete(t);
      };
    },
    subscribeFps(fn: FpsListener): () => void {
      fpsListeners.add(fn);
      return () => {
        fpsListeners.delete(fn);
      };
    },
    dispose(): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      tickers.clear();
      fpsListeners.clear();
      lastTimestamp = null;
      ewmaFps = 0;
    },
  };
}
