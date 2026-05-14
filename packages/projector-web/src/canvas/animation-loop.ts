/**
 * RAF ticker 레지스트리.
 *
 * 케이블 물리 같은 매 프레임 imperative 갱신을 위해 단일 RAF만 유지한다.
 * 등록자가 0이 되면 루프도 자동 정지 — idle 캔버스에서 RAF가 깨어나지 않는다.
 *
 * 인스턴스별 격리: 한 TramaEditor의 RAF가 다른 에디터의 ticker를 호출하지 않음.
 */
type Ticker = () => void;

export interface AnimationLoop {
  register(t: Ticker): () => void;
  /** dispose: 진행 중인 RAF를 cancel하고 ticker set을 비운다. */
  dispose(): void;
}

export function createAnimationLoop(): AnimationLoop {
  const tickers = new Set<Ticker>();
  let rafId: number | null = null;

  function loop(): void {
    const snapshot = Array.from(tickers);
    for (const t of snapshot) t();
    if (tickers.size > 0) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
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
    dispose(): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      tickers.clear();
    },
  };
}

const defaultLoop = createAnimationLoop();

/** 호환 shim — Stage B 후반에 제거. 새 코드는 useTrama().animationLoop.register 사용. */
export function registerTicker(t: Ticker): () => void {
  return defaultLoop.register(t);
}
