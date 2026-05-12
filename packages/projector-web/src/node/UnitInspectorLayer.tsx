import { useMemo, useSyncExternalStore } from 'react';
import { isValueNode } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { getNodeLayout } from './box.js';
import {
  UNIT_INSPECTOR_PANEL_HEIGHT,
  UNIT_INSPECTOR_PANEL_WIDTH,
  UnitInspector,
} from './UnitInspector.js';
import { FloatingPanel } from '../util/FloatingPanel.js';
import { getViewport, subscribeViewport } from '../canvas/viewport.js';

/**
 * UnitInspector를 노드 우상단 옆에 띄우는 어댑터.
 * 노드 위치(캔버스 좌표) → viewport 변환 → 화면 좌표 anchor.
 */
export function UnitInspectorLayer(): JSX.Element | null {
  const nodeId = useUIStore((s) => s.unitInspector?.nodeId ?? null);
  const closeInspector = useUIStore((s) => s.closeUnitInspector);
  const node = useModelStore((s) => (nodeId ? s.model.nodes[nodeId] : null));
  const incomingCount = useModelStore((s) => {
    if (!nodeId) return 0;
    let n = 0;
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (e && e.to === nodeId) n++;
    }
    return n;
  });

  const viewport = useSyncExternalStore(subscribeViewport, getViewport, getViewport);

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
    <FloatingPanel
      anchor={anchor}
      onClose={closeInspector}
      placement={{ kind: 'side', gap: { x: 14, y: 0 } }}
      size={{ width: UNIT_INSPECTOR_PANEL_WIDTH, height: UNIT_INSPECTOR_PANEL_HEIGHT }}
      className="trama-unit-inspector"
    >
      <UnitInspector node={node} />
    </FloatingPanel>
  );
}
