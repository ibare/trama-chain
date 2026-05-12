/**
 * 글로벌 RAF ticker 레지스트리.
 *
 * 케이블 물리 같은 매 프레임 imperative 갱신을 위해 단일 RAF만 유지한다.
 * 등록자가 0이 되면 루프도 자동 정지 — idle 캔버스에서 RAF가 깨어나지 않는다.
 *
 * 사용 패턴은 drag-registry와 동일: 호출자가 콜백을 register하고 반환된 unregister
 * 함수를 unmount/effect cleanup에서 호출.
 */

type Ticker = () => void;

const tickers = new Set<Ticker>();
let rafId: number | null = null;

function loop(): void {
  // 한 프레임 안에서 ticker가 새로 register/unregister되어도 안전하도록 스냅샷.
  const snapshot = Array.from(tickers);
  for (const t of snapshot) t();
  if (tickers.size > 0) {
    rafId = requestAnimationFrame(loop);
  } else {
    rafId = null;
  }
}

export function registerTicker(t: Ticker): () => void {
  tickers.add(t);
  if (rafId === null) {
    rafId = requestAnimationFrame(loop);
  }
  return () => {
    tickers.delete(t);
  };
}
