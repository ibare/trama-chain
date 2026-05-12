import { memo, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { NodeId } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import {
  getIncidentEdgeHandles,
  registerNodeEl,
  type EdgeHandle,
} from '../canvas/drag-registry.js';
import { getCurrentZoom } from '../canvas/viewport.js';

const DRAG_THRESHOLD_PX = 3;

interface Props {
  id: NodeId;
  pos: { x: number; y: number };
  /** drag hit 영역의 크기 — 보통 노드 박스 width/height. 노드 중심 기준 사각형. */
  width: number;
  height: number;
  /** 추가 root className. 노드별 hook 클래스(예: 'trama-conditional-node') 부착용. */
  className?: string;
  /**
   * drag 시작을 막을 조건. true 반환 시 drag 진행, false면 무시.
   * (예: ValueNode가 인라인 편집 중일 때 false로 잠금)
   */
  canStartDrag?: () => boolean;
  /** body 빈 영역 더블클릭. (예: 인라인 편집 진입) */
  onBodyDoubleClick?: (e: React.MouseEvent<SVGRectElement>) => void;
  children: ReactNode;
}

/**
 * 노드 공통 뼈대.
 *
 * **핵심 구조**: drag hit `<rect>`를 자식보다 *먼저* 그려 z-order 가장 아래에 깐다.
 * 자식의 인터랙티브 요소(InteractiveArea·socket-hit 등)는 자체 hit-area를 갖고 z-order
 * 위에 와서 hit-testing에서 우선. 자식의 *장식* 요소(visual rect·label text)는
 * `pointer-events:none`이라 hit가 통과해 drag rect로 떨어진다.
 *
 * 이 구조 덕에 새 인터랙티브 자식을 추가할 때 `stopPropagation` 같은 ad hoc
 * 처리를 매번 깔지 않아도 된다 — `<InteractiveArea>`로 감싸기만 하면 자동.
 */
function NodeFrameImpl({
  id,
  pos,
  width,
  height,
  className,
  canStartDrag,
  onBodyDoubleClick,
  children,
}: Props): JSX.Element {
  const selectNode = useUIStore((s) => s.selectNode);
  const updateNode = useModelStore((s) => s.updateNode);

  const outerGRef = useRef<SVGGElement | null>(null);
  useEffect(() => {
    const el = outerGRef.current;
    if (!el) return undefined;
    return registerNodeEl(id, el);
  }, [id]);

  const moveRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPosX: number;
    startPosY: number;
    lastDx: number;
    lastDy: number;
    dragged: boolean;
    zoom: number;
    incidents: EdgeHandle[];
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (canStartDrag && !canStartDrag()) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      selectNode(id);
      moveRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPosX: pos.x,
        startPosY: pos.y,
        lastDx: 0,
        lastDy: 0,
        dragged: false,
        zoom: getCurrentZoom(),
        incidents: getIncidentEdgeHandles(id),
      };
    },
    [canStartDrag, id, pos.x, pos.y, selectNode],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      if (!m) return;
      const dxClient = e.clientX - m.startClientX;
      const dyClient = e.clientY - m.startClientY;
      if (!m.dragged) {
        if (Math.hypot(dxClient, dyClient) < DRAG_THRESHOLD_PX) return;
        m.dragged = true;
      }
      const dx = dxClient / m.zoom;
      const dy = dyClient / m.zoom;
      m.lastDx = dx;
      m.lastDy = dy;
      const gEl = outerGRef.current;
      if (gEl) {
        const nx = m.startPosX + dx;
        const ny = m.startPosY + dy;
        gEl.setAttribute('transform', `translate(${nx} ${ny})`);
      }
      for (const h of m.incidents) {
        h.applyDrag(id, dx, dy);
      }
    },
    [id],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      moveRef.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (m?.dragged && (m.lastDx !== 0 || m.lastDy !== 0)) {
        updateNode(
          id,
          { position: { x: m.startPosX + m.lastDx, y: m.startPosY + m.lastDy } },
          'move-node',
          '위치 이동',
        );
      }
    },
    [id, updateNode],
  );

  const halfW = width / 2;
  const halfH = height / 2;
  const rootClass = `trama-node${className ? ` ${className}` : ''}`;

  return (
    <g
      ref={outerGRef}
      className={rootClass}
      data-trama-node-id={id}
      transform={`translate(${pos.x} ${pos.y})`}
    >
      <rect
        className="trama-node-drag-hit"
        x={-halfW}
        y={-halfH}
        width={width}
        height={height}
        fill="transparent"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onBodyDoubleClick}
      />
      {children}
    </g>
  );
}

export const NodeFrame = memo(NodeFrameImpl);
