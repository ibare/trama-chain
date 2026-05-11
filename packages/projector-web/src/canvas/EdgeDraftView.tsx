import { useModelStore, useUIStore } from '../store/index.js';
import { edgePath } from '../edge/geometry.js';

/**
 * 드래그 중인 엣지(아직 target 미정). lag는 Alt 키로 토글.
 */
export function EdgeDraftView(): JSX.Element | null {
  const draft = useUIStore((s) => s.edgeDraft);
  const nodes = useModelStore((s) => s.model.nodes);
  if (!draft) return null;
  const from = nodes[draft.fromNodeId]?.position ?? { x: 0, y: 0 };
  const to = draft.pointer;
  const { d } = edgePath(from, to, { lag: draft.lag });
  const cls = `trama-edge ${draft.lag === 1 ? 'is-feedback' : ''}`;
  return (
    <g pointerEvents="none">
      <path className={cls} d={d} style={{ opacity: 0.6 }} />
    </g>
  );
}
