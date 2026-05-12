import { useMemo } from 'react';
import { isValueNode, type NodeId } from '@trama/core';
import { useModelStore } from '../store/index.js';
import { getNodeLayout } from './box.js';
import {
  UNIT_INSPECTOR_PANEL_HEIGHT,
  UNIT_INSPECTOR_PANEL_WIDTH,
  UnitInspector,
} from './UnitInspector.js';
import { placePanel } from '../util/panel-placement.js';

interface Props {
  nodeId: NodeId;
  /** Canvas의 가시 영역 — placePanel의 bounds로 쓰임. SVG의 clientWidth/Height. */
  bounds: { width: number; height: number };
}

/**
 * UnitInspector를 노드 그룹 밖, Canvas 최상단 레이어에 띄우는 어댑터.
 * z-order(다른 노드 위로 항상)와 화면 경계 클램프(우→좌 flip)를 처리.
 */
export function UnitInspectorLayer({ nodeId, bounds }: Props): JSX.Element | null {
  const node = useModelStore((s) => s.model.nodes[nodeId]);
  const incomingCount = useModelStore((s) => {
    let n = 0;
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (e && e.to === nodeId) n++;
    }
    return n;
  });

  const placement = useMemo(() => {
    if (!node || !node.position) return null;
    const layout = getNodeLayout(node, { incomingCount });
    return placePanel({
      anchor: { x: node.position.x + layout.halfW, y: node.position.y - layout.halfH },
      panel: { w: UNIT_INSPECTOR_PANEL_WIDTH, h: UNIT_INSPECTOR_PANEL_HEIGHT },
      bounds: { minX: 8, minY: 8, maxX: bounds.width - 8, maxY: bounds.height - 8 },
      gap: { x: 14, y: 0 },
    });
  }, [node, incomingCount, bounds.width, bounds.height]);

  if (!node || !placement) return null;
  if (!isValueNode(node)) return null;
  return <UnitInspector node={node} x={placement.x} y={placement.y} />;
}
