import { memo, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { NodeId } from '@trama/core';
import { tokens } from '@trama/tokens';
import { useTrama } from '../store/index.js';
import { type EdgeHandle } from '../canvas/drag-registry.js';
import { useNodeFlashId } from '../pulse/use-node-flash.js';

const DRAG_THRESHOLD_PX = 3;
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

interface Props {
  id: NodeId;
  pos: { x: number; y: number };
  /** drag hit 영역의 크기 — 보통 노드 박스 width/height. 노드 중심 기준 사각형. */
  width: number;
  height: number;
  /** 추가 root className. 노드별 hook 클래스(예: 'trama-condition-node') 부착용. */
  className?: string;
  /** body 빈 영역 더블클릭. (예: 인라인 편집 진입) */
  onBodyDoubleClick?: (e: React.MouseEvent<SVGRectElement>) => void;
  children: ReactNode;
}

/**
 * 노드 공통 뼈대.
 *
 * **핵심 구조**: drag 핸들러를 outer `<g>`에 부착한다. 자식 element 위에서
 * 발생한 pointerdown은 React 합성 이벤트로 outer `<g>`까지 버블링되어 드래그가
 * 시작된다 — 자식이 `<rect fill="transparent">`이든 `<foreignObject>`이든
 * 동일하게 작동. 덕분에 식 노드처럼 본체를 foreignObject로 채우는 경우에도
 * 드래그가 영역 어디서든 가능.
 *
 * 자식의 인터랙티브 요소(InteractiveArea·socket-hit 등)는 React 합성 이벤트
 * 단계에서 `stopPropagation`을 호출해 outer로 버블링을 막아야 한다 —
 * `<InteractiveArea>`는 자체 hit-rect에 이를 빌트인으로 부착하고 있다.
 *
 * 빈 본체 영역에서도 hit-test가 발생해야 하므로 transparent `<rect>`를 자식
 * 첫머리에 깔아 영역을 정의 — 핸들러는 갖지 않고 fill만 제공.
 */
function NodeFrameImpl({
  id,
  pos,
  width,
  height,
  className,
  onBodyDoubleClick,
  children,
}: Props): JSX.Element {
  const { modelStore, uiStore, viewport, dragRegistry } = useTrama();
  const selectNode = uiStore((s) => s.selectNode);
  const updateNode = modelStore((s) => s.updateNode);
  // 이 노드가 인라인 편집 중이면 drag 시작을 막아 input 포커스가 끊기지 않게 한다.
  // 노드 뷰가 콜백으로 따로 전달하지 않아도 NodeFrame이 단일 출처로 강제 — 편집
  // 상태와 드래그 차단의 일관성 계약을 모든 노드에 동일하게 적용.
  const isEditing = uiStore((s) => s.editingNode?.id === id);

  const outerGRef = useRef<SVGGElement | null>(null);
  useEffect(() => {
    const el = outerGRef.current;
    if (!el) return undefined;
    return dragRegistry.registerNodeEl(id, el);
  }, [id, dragRegistry]);

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
    pointerId: number;
    captured: boolean;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (isEditing) return;
      const readOnly = uiStore.getState().readOnly;
      // readOnly에서도 노드 클릭 선택은 허용(셀렉션 = 비파괴 인터랙션). 드래그만 차단.
      e.stopPropagation();
      selectNode(id);
      if (readOnly) return;
      // pointerCapture는 드래그 임계치를 넘는 시점(pointermove)에 늦게 잡는다.
      // pointerdown 즉시 capture를 잡으면 click/dblclick의 target이 outer `<g>`로
      // redirect되어 자식 hit-rect(라벨·threshold)의 onDoubleClick이 발화하지 못한다.
      moveRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPosX: pos.x,
        startPosY: pos.y,
        lastDx: 0,
        lastDy: 0,
        dragged: false,
        zoom: viewport.getCurrentZoom(),
        incidents: dragRegistry.getIncidentEdgeHandles(id),
        pointerId: e.pointerId,
        captured: false,
      };
    },
    [dragRegistry, id, isEditing, pos.x, pos.y, selectNode, uiStore, viewport],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      const m = moveRef.current;
      if (!m) return;
      const dxClient = e.clientX - m.startClientX;
      const dyClient = e.clientY - m.startClientY;
      if (!m.dragged) {
        if (Math.hypot(dxClient, dyClient) < DRAG_THRESHOLD_PX) return;
        m.dragged = true;
        // 임계치를 넘은 순간에만 capture — 노드가 빠르게 이동해 포인터가 element를
        // 벗어나도 move/up이 outer `<g>`에 계속 도달하도록.
        if (!m.captured) {
          e.currentTarget.setPointerCapture(m.pointerId);
          m.captured = true;
        }
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
    (e: React.PointerEvent<SVGGElement>) => {
      const m = moveRef.current;
      moveRef.current = null;
      if (m?.captured) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
      if (m?.dragged && (m.lastDx !== 0 || m.lastDy !== 0)) {
        updateNode(id, {
          position: { x: m.startPosX + m.lastDx, y: m.startPosY + m.lastDy },
        });
      }
    },
    [id, updateNode],
  );

  const halfW = width / 2;
  const halfH = height / 2;
  const rootClass = `trama-node${className ? ` ${className}` : ''}`;

  const flashId = useNodeFlashId(id);

  return (
    <g
      ref={outerGRef}
      className={rootClass}
      data-trama-node-id={id}
      transform={`translate(${pos.x} ${pos.y})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onBodyDoubleClick}
    >
      <rect
        className="trama-node-drag-hit"
        x={-halfW}
        y={-halfH}
        width={width}
        height={height}
        fill="transparent"
      />
      {children}
      {flashId > 0 && (
        <rect
          key={flashId}
          className="trama-node-flash-overlay"
          x={-halfW}
          y={-halfH}
          width={width}
          height={height}
          rx={CARD_CORNER}
          ry={CARD_CORNER}
          pointerEvents="none"
        />
      )}
    </g>
  );
}

export const NodeFrame = memo(NodeFrameImpl);
