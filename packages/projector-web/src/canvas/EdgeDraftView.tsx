import { useUIStore } from '../store/index.js';
import { edgePath } from '../edge/geometry.js';

/**
 * 드래그 중인 엣지(아직 target 미정). 출발은 source 우측 핀 소켓.
 * lag는 Alt 키로 토글.
 */
export function EdgeDraftView(): JSX.Element | null {
  const draft = useUIStore((s) => s.edgeDraft);
  if (!draft) return null;
  const { d } = edgePath(draft.startPoint, draft.pointer, { lag: draft.lag });
  const cls = `trama-edge ${draft.lag === 1 ? 'is-feedback' : ''}`;
  return (
    <g pointerEvents="none">
      <path className={cls} d={d} style={{ opacity: 0.6 }} />
    </g>
  );
}
