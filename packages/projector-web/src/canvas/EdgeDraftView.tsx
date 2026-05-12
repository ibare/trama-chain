import { useUIStore } from '../store/index.js';
import { edgePath } from '../edge/geometry.js';

/**
 * 드래그 중인 엣지(아직 target 미정 또는 detach 중).
 * snap이 잡혀 있으면 그쪽 소켓 중심에 끝점을 붙인다.
 */
export function EdgeDraftView(): JSX.Element | null {
  const draft = useUIStore((s) => s.edgeDraft);
  if (!draft) return null;
  const end = draft.snap ? draft.snap.point : draft.pointer;
  const { d } = edgePath(draft.startPoint, end, { lag: draft.lag });
  const snapped = draft.snap !== null;
  const cls = `trama-edge${draft.lag === 1 ? ' is-feedback' : ''}${snapped ? ' is-snapped' : ''}`;
  return (
    <g pointerEvents="none">
      <path className={cls} d={d} style={{ opacity: snapped ? 0.95 : 0.6 }} />
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
