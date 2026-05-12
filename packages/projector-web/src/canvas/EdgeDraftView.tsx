import { useEffect, useRef } from 'react';
import { useUIStore } from '../store/index.js';
import { registerTicker } from './animation-loop.js';
import {
  cableToPoints,
  createCable,
  setCableEndpoints,
  stepCable,
  type Cable,
} from '../edge/cable-physics.js';

/**
 * 드래그 중인 엣지(아직 target 미정 또는 detach 중)도 같은 케이블 물리로 그려
 * 본 엣지와 시각적 일관성을 유지한다. 매 draft 시작 시 새 cable 인스턴스를 만들고,
 * 매 프레임 startPoint·pointer/snap.point를 endpoint로 강제한다.
 */
export function EdgeDraftView(): JSX.Element | null {
  const draft = useUIStore((s) => s.edgeDraft);

  const cableRef = useRef<Cable | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const liveStartRef = useRef({ x: 0, y: 0 });
  const liveEndRef = useRef({ x: 0, y: 0 });
  const pathRef = useRef<SVGPolylineElement | null>(null);

  // draft가 새로 시작되면(fromNodeId·startPoint 식별) 새 케이블을 만든다.
  // 끝나면 cable을 비우고 ticker가 자동 unregister.
  const sessionId = draft
    ? `${draft.fromNodeId}:${draft.startPoint.x.toFixed(0)},${draft.startPoint.y.toFixed(0)}:${
        draft.detachingEdgeId ?? ''
      }`
    : null;
  if (sessionId !== sessionIdRef.current) {
    if (draft) {
      const initEnd = draft.snap ? draft.snap.point : draft.pointer;
      cableRef.current = createCable(draft.startPoint, initEnd);
    } else {
      cableRef.current = null;
    }
    sessionIdRef.current = sessionId;
  }

  if (draft) {
    liveStartRef.current = draft.startPoint;
    liveEndRef.current = draft.snap ? draft.snap.point : draft.pointer;
  }

  useEffect(() => {
    if (sessionId === null) return;
    const tick = (): void => {
      const cable = cableRef.current;
      if (!cable) return;
      setCableEndpoints(cable, liveStartRef.current, liveEndRef.current);
      stepCable(cable);
      pathRef.current?.setAttribute('points', cableToPoints(cable));
    };
    return registerTicker(tick);
  }, [sessionId]);

  if (!draft || !cableRef.current) return null;

  const snapped = draft.snap !== null;
  const cls = `trama-edge${draft.lag === 1 ? ' is-feedback' : ''}${snapped ? ' is-snapped' : ''}`;
  const initialPoints = cableToPoints(cableRef.current);
  return (
    <g pointerEvents="none">
      <polyline
        ref={pathRef}
        className={cls}
        points={initialPoints}
        fill="none"
        style={{ opacity: snapped ? 0.95 : 0.6 }}
      />
      {/* snap이 잡혔을 때 대상 소켓에 강조 링 — 어디에 붙을지 즉시 보이는 affordance. */}
      {draft.snap && (
        <circle
          className="trama-snap-target-ring"
          cx={draft.snap.point.x}
          cy={draft.snap.point.y}
          r={11}
        />
      )}
    </g>
  );
}
