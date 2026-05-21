import { useMemo, useSyncExternalStore } from 'react';
import { isValueNode } from '@trama/core';
import { useTrama } from '../store/index.js';
import { getNodeLayout } from '@trama/layout';
import { resolveDisplayMode } from './display-mode.js';
import { BooleanInspector } from './BooleanInspector.js';
import { TramaPopover } from '../util/TramaPopover.js';

/**
 * boolean ValueNode 의 스킨 선택 패널을 노드 우상단에 띄우는 어댑터.
 *
 * UnitInspectorLayer 와 동일한 viewport 변환 + Popover 패턴. ValueNode 중
 * initialValue.kind === 'boolean' 일 때만 BooleanInspector 를 렌더해, dispatcher
 * 책임을 layer 에 격리한다.
 */
export function BooleanInspectorLayer(): JSX.Element | null {
  const {
    modelStore,
    uiStore,
    viewport: viewportContainer,
    timeSettingsStore,
  } = useTrama();
  const paused = timeSettingsStore((s) => s.paused);
  const nodeId = uiStore((s) => s.booleanInspector?.nodeId ?? null);
  const closeInspector = uiStore((s) => s.closeBooleanInspector);
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
    const layout = getNodeLayout(node, {
      incomingCount,
      displayMode: resolveDisplayMode(node),
    });
    const canvasAnchorX = node.position.x + layout.halfW;
    const canvasAnchorY = node.position.y - layout.halfH;
    return {
      x: viewport.panX + canvasAnchorX * viewport.zoom,
      y: viewport.panY + canvasAnchorY * viewport.zoom,
    };
  }, [node, incomingCount, viewport.panX, viewport.panY, viewport.zoom]);

  if (!paused) return null;
  if (!node || !anchor) return null;
  if (!isValueNode(node)) return null;
  if (node.initialValue.kind !== 'boolean') return null;

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
      <BooleanInspector node={node} />
    </TramaPopover>
  );
}
