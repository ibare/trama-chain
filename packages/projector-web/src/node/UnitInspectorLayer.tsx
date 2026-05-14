import { useMemo, useSyncExternalStore } from 'react';
import { isValueNode } from '@trama/core';
import { useTrama } from '../store/index.js';
import { getNodeLayout } from './box.js';
import { UnitInspector } from './UnitInspector.js';
import { TramaPopover } from '../util/TramaPopover.js';

/**
 * UnitInspector를 노드 우상단 옆에 띄우는 어댑터.
 * 노드 위치(캔버스 좌표) → viewport 변환 → 화면 좌표 anchor.
 */
export function UnitInspectorLayer(): JSX.Element | null {
  const { modelStore, uiStore, viewport: viewportContainer } = useTrama();
  const nodeId = uiStore((s) => s.unitInspector?.nodeId ?? null);
  const closeInspector = uiStore((s) => s.closeUnitInspector);
  const node = modelStore((s) => (nodeId ? s.model.nodes[nodeId] : null));
  const incomingCount = modelStore((s) => {
    if (!nodeId) return 0;
    let n = 0;
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (e && e.to === nodeId) n++;
    }
    return n;
  });

  const viewport = useSyncExternalStore(
    viewportContainer.subscribe,
    viewportContainer.get,
    viewportContainer.get,
  );

  const anchor = useMemo(() => {
    if (!node || !node.position) return null;
    const layout = getNodeLayout(node, { incomingCount });
    const canvasAnchorX = node.position.x + layout.halfW;
    const canvasAnchorY = node.position.y - layout.halfH;
    return {
      x: viewport.panX + canvasAnchorX * viewport.zoom,
      y: viewport.panY + canvasAnchorY * viewport.zoom,
    };
  }, [node, incomingCount, viewport.panX, viewport.panY, viewport.zoom]);

  if (!node || !anchor) return null;
  if (!isValueNode(node)) return null;

  return (
    <TramaPopover
      open
      onOpenChange={(o) => {
        if (!o) closeInspector();
      }}
      anchor={anchor}
      placement={{ kind: 'side', gap: { x: 14, y: 0 } }}
      className="trama-unit-inspector"
    >
      <UnitInspector node={node} />
    </TramaPopover>
  );
}
