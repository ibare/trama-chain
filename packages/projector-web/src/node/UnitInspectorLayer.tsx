import { useMemo, useSyncExternalStore } from 'react';
import {
  getInputPortType,
  isGeneratorNode,
  isObserveNode,
  isValueNode,
} from '@trama-chain/core';
import { useTrama } from '../store/index.js';
import { getNodeLayout } from '@trama-chain/layout';
import { resolveDisplayMode } from './display-mode.js';
import { UnitInspector } from './UnitInspector.js';
import { ObserveInspector } from './ObserveInspector.js';
import { GeneratorInspector } from './GeneratorInspector.js';
import { TramaPopover } from '../util/TramaPopover.js';

/**
 * UnitInspector를 노드 우상단 옆에 띄우는 어댑터.
 * 노드 위치(캔버스 좌표) → viewport 변환 → 화면 좌표 anchor.
 */
export function UnitInspectorLayer(): JSX.Element | null {
  const {
    modelStore,
    uiStore,
    viewport: viewportContainer,
    timeSettingsStore,
  } = useTrama();
  // 인스펙터는 정지(t===0 초기 OR ||) 상태에서만 노출 — 재생 중에는 사용자가
  // 슬라이드/토글로 값을 변경할 수 있는 노드 본체 컨트롤만 열어둔다.
  const paused = timeSettingsStore((s) => s.paused);
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

  const model = modelStore((s) => s.model);
  const inferredKind = useMemo(() => {
    if (!node || !isObserveNode(node)) return null;
    return getInputPortType(node, undefined, model);
  }, [node, model]);

  if (!paused) return null;
  if (!node || !anchor) return null;
  if (!isValueNode(node) && !isObserveNode(node) && !isGeneratorNode(node)) return null;

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
      {isObserveNode(node) ? (
        <ObserveInspector node={node} inferredKind={inferredKind} />
      ) : isGeneratorNode(node) ? (
        <GeneratorInspector node={node} />
      ) : isValueNode(node) ? (
        <UnitInspector node={node} />
      ) : null}
    </TramaPopover>
  );
}
