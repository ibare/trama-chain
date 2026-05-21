import { useEffect, useRef, useState } from 'react';
import { useTrama } from '../store/trama-instance.js';

/**
 * RAF 펌프의 EWMA fps 를 작은 칩으로 노출. AnimationLoop 는 등록자가 0 이면
 * 루프 자체를 정지하므로 publish 도 끊긴다. 마지막 update 후 500ms 가 지나면
 * idle 로 간주해 '—' 를 표시 — 빈 캔버스에서 거짓 60 fps 를 표시하지 않는다.
 *
 * setState 빈도를 RAF (~60Hz) 그대로 두면 React 가 매 프레임 reconcile 한다.
 * Math.round 로 정수화한 값만 의미있게 바뀌면 setState 호출 — 60→60 같은 경우
 * 스킵해 reconcile 부담을 낮춘다.
 */
export function FpsChip(): JSX.Element {
  const { animationLoop } = useTrama();
  const [displayed, setDisplayed] = useState<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const displayedRef = useRef<number | null>(null);

  useEffect(() => {
    displayedRef.current = displayed;
  }, [displayed]);

  useEffect(() => {
    const unsub = animationLoop.subscribeFps((fps) => {
      lastUpdateRef.current = performance.now();
      const rounded = Math.round(fps);
      if (rounded !== displayedRef.current) {
        displayedRef.current = rounded;
        setDisplayed(rounded);
      }
    });
    const staleId = window.setInterval(() => {
      const stale = performance.now() - lastUpdateRef.current > 500;
      if (stale && displayedRef.current !== null) {
        displayedRef.current = null;
        setDisplayed(null);
      }
    }, 250);
    return () => {
      unsub();
      window.clearInterval(staleId);
    };
  }, [animationLoop]);

  return (
    <span
      className="trama-mini-player-fps-chip"
      aria-label={displayed === null ? '프레임 측정 대기' : `현재 ${displayed} fps`}
      title="RAF 프레임 속도 (등록자 0 이면 — 표시)"
    >
      {displayed === null ? '—' : `${displayed} fps`}
    </span>
  );
}
