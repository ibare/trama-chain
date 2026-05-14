import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EdgeId, NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { EdgeView } from '../edge/EdgeView.js';
import { NodeView } from '../node/NodeView.js';
import { PulseLayer } from '../pulse/PulseLayer.js';
import { EdgeDraftView } from './EdgeDraftView.js';
import { CanvasContextMenu } from './CanvasContextMenu.js';
import { isConditionalNode, isExpressionNode } from '@trama/core';

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const ZOOM_WHEEL_INTENSITY = 0.0015;
const PAN_THRESHOLD_PX = 3;
/** 스냅 적용 반경 — screen pixel 기준. canvas 거리 × zoom 으로 비교한다. */
const SNAP_RADIUS_PX = 12;

export function Canvas(): JSX.Element {
  const { modelStore, uiStore, viewport: viewportContainer, socketRegistry } = useTrama();
  // 좁은 셀렉터 — Canvas 자체는 topology(노드·엣지 목록) 변경에만 리렌더된다.
  // 드래그 오프셋, 값 변화, 셀렉션 변화는 모두 자식이 자기 id로 직접 구독하므로
  // 여기서는 구독하지 않는다.
  const nodeOrder = modelStore((s) => s.model.nodeOrder);
  const edgeOrder = modelStore((s) => s.model.edgeOrder);
  const edges = modelStore((s) => s.model.edges);
  const nodes = modelStore((s) => s.model.nodes);
  const nodeCount = nodeOrder.length;

  const addNode = modelStore((s) => s.addNode);
  const setEditingNode = uiStore((s) => s.setEditingNode);
  const clearSelection = uiStore((s) => s.clearSelection);
  const clearInsertIntent = uiStore((s) => s.clearInsertNodeIntent);
  const openCanvasContextMenu = uiStore((s) => s.openCanvasContextMenu);
  const closeCanvasContextMenu = uiStore((s) => s.closeCanvasContextMenu);
  const edgeDraft = uiStore((s) => s.edgeDraft);
  const updateEdgeDraft = uiStore((s) => s.updateEdgeDraft);
  const endEdgeDraft = uiStore((s) => s.endEdgeDraft);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // 뷰포트(pan·zoom). Canvas만 리렌더되며 자식 NodeView는 React.memo로 안정.
  const [viewport, setViewport] = useState<{ panX: number; panY: number; zoom: number }>({
    panX: 0,
    panY: 0,
    zoom: 1,
  });
  // 드래그·휠 핸들러가 closure 없이 최신 viewport를 읽도록 ref도 유지.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  useEffect(() => {
    viewportContainer.set(viewport);
  }, [viewport, viewportContainer]);

  const toCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    const { panX, panY, zoom } = viewportRef.current;
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top - panY) / zoom,
    };
  }, []);

  // incomingMap: to-node 기준 incoming 엣지 id 목록. edgeOrder 또는 edges 변경 시
  // 만 재계산. 드래그 등 무관한 변경에는 영향 없다.
  const incomingMap = useMemo(() => {
    const map: Record<NodeId, EdgeId[]> = {};
    for (const eid of edgeOrder) {
      const e = edges[eid];
      if (!e) continue;
      (map[e.to] ??= []).push(eid);
    }
    return map;
  }, [edgeOrder, edges]);

  // 노드별 "좌측 핀 슬롯 수" — EdgeView·NodeView가 같은 레이아웃을 그리도록 단일
  // 출처. ExpressionNode는 변수 개수가 슬롯 수의 진실(연결되지 않은 빈 슬롯도
  // 보여야 한다). 그 외는 연결된 엣지 수 그대로(ValueNode 다입력 시각화).
  const slotCountByNode = useMemo(() => {
    const m: Record<NodeId, number> = {};
    for (const nid of nodeOrder) {
      const node = nodes[nid];
      const connected = incomingMap[nid]?.length ?? 0;
      m[nid] = node && isExpressionNode(node) ? node.variables.length : connected;
    }
    return m;
  }, [nodeOrder, nodes, incomingMap]);

  // 빈 영역 드래그로 패닝. 좌클릭만, 노드/엣지/배경 외 요소는 통과.
  const panRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    dragged: boolean;
    pointerId: number;
  } | null>(null);

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const target = e.target as Element;
      const isBackground =
        e.target === e.currentTarget || target.classList?.contains?.('trama-canvas-bg');
      if (!isBackground) return;
      // 빈 영역 클릭: 선택·메뉴 등 정리. 패널(picker·inspector)은 자기
      // 외부 클릭을 document-level로 직접 감지해 닫는다.
      clearSelection();
      clearInsertIntent();
      closeCanvasContextMenu();
      // 좌클릭만 패닝.
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const v = viewportRef.current;
      panRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: v.panX,
        startPanY: v.panY,
        dragged: false,
        pointerId: e.pointerId,
      };
    },
    [clearSelection, clearInsertIntent, closeCanvasContextMenu],
  );

  const onCanvasContextMenu = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // 빈 영역에서만 컨텍스트 메뉴를 띄운다 — 노드·엣지 위 우클릭은 기본 동작
      // 또는 추후 각자의 메뉴로 위임.
      const target = e.target as Element;
      if (target !== e.currentTarget && !target.classList?.contains?.('trama-canvas-bg')) return;
      e.preventDefault();
      const canvasPos = toCanvasCoords(e.clientX, e.clientY);
      openCanvasContextMenu({ x: e.clientX, y: e.clientY }, canvasPos);
    },
    [openCanvasContextMenu, toCanvasCoords],
  );

  const onCanvasDoubleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (uiStore.getState().readOnly) return;
      const target = e.target as Element;
      if (target !== e.currentTarget && !target.classList?.contains?.('trama-canvas-bg')) return;
      const pos = toCanvasCoords(e.clientX, e.clientY);
      const node = addNode({
        label: '새 변수',
        unitId: 'rating-10',
        initialValue: 5,
        position: pos,
        isFocal: nodeCount === 0,
      });
      setEditingNode(node.id);
    },
    [addNode, nodeCount, setEditingNode, toCanvasCoords, uiStore],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const pan = panRef.current;
      if (pan) {
        const dx = e.clientX - pan.startClientX;
        const dy = e.clientY - pan.startClientY;
        if (!pan.dragged && Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
        pan.dragged = true;
        setViewport((v) => ({ ...v, panX: pan.startPanX + dx, panY: pan.startPanY + dy }));
        return;
      }
      if (!edgeDraft) return;
      const pos = toCanvasCoords(e.clientX, e.clientY);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      // 스냅: 가장 가까운 입력 소켓을 찾고 screen 거리가 임계치 이내면 스냅.
      const model = modelStore.getState().model;
      const positions: Record<string, { x: number; y: number } | undefined> = {};
      for (const nid of Object.keys(model.nodes)) {
        const p = model.nodes[nid]?.position;
        if (p) positions[nid] = p;
      }
      const fromId = edgeDraft.fromNodeId;
      const detachingId = edgeDraft.detachingEdgeId;
      const occupiedKey = (toId: string, slot: number | undefined) =>
        slot === undefined ? `${toId}` : `${toId}:${slot}`;
      // 점유 중인 슬롯 set 계산 — 단, detach 중인 엣지 자기 자신은 제외 (원위치 허용).
      const occupiedExpr = new Set<string>();
      const occupiedCond = new Set<string>();
      for (const eid of model.edgeOrder) {
        const e2 = model.edges[eid];
        if (!e2) continue;
        if (eid === detachingId) continue;
        const tgt = model.nodes[e2.to];
        if (tgt && isExpressionNode(tgt)) {
          occupiedExpr.add(occupiedKey(e2.to, e2.slotIndex));
        } else if (tgt && isConditionalNode(tgt)) {
          occupiedCond.add(occupiedKey(e2.to, e2.slotIndex));
        }
      }
      const nearest = socketRegistry.findNearest(pos, positions, (entry) => {
        // 자기 자신으로 돌아가는 엣지는 막는다.
        if (entry.nodeId === fromId) return false;
        const tgt = model.nodes[entry.nodeId];
        if (!tgt) return false;
        if (isExpressionNode(tgt)) {
          return !occupiedExpr.has(occupiedKey(entry.nodeId, entry.slotIndex));
        }
        if (isConditionalNode(tgt)) {
          return !occupiedCond.has(occupiedKey(entry.nodeId, entry.slotIndex));
        }
        // ValueNode는 multi-incoming 가능 — 항상 후보.
        return true;
      });
      let snap: typeof edgeDraft.snap = null;
      if (nearest) {
        const zoom = viewportRef.current.zoom;
        const screenDist = nearest.distance * zoom;
        if (screenDist <= SNAP_RADIUS_PX) {
          snap = {
            toNodeId: nearest.entry.nodeId,
            slotIndex: nearest.entry.slotIndex,
            point: nearest.point,
          };
        }
      }
      updateEdgeDraft({ pointer: pos, lag, snap });
    },
    [edgeDraft, toCanvasCoords, updateEdgeDraft, modelStore, socketRegistry],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (panRef.current) {
        e.currentTarget.releasePointerCapture?.(panRef.current.pointerId);
        panRef.current = null;
      }
      if (edgeDraft) endEdgeDraft();
    },
    [edgeDraft, endEdgeDraft],
  );

  const removeNode = modelStore((s) => s.removeNode);
  const removeEdge = modelStore((s) => s.removeEdge);
  const selection = uiStore((s) => s.selection);

  // 휠 줌 — 마우스 포커스 줌. React onWheel은 passive로 등록될 수 있어
  // preventDefault가 막힐 수 있으므로 native addEventListener({passive:false}).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewportRef.current;
      const factor = Math.exp(-e.deltaY * ZOOM_WHEEL_INTENSITY);
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom * factor));
      if (next === v.zoom) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // 마우스 위치의 캔버스 좌표가 줌 후에도 같은 클라이언트 위치를 가리키도록 pan 보정.
      const panX = mx - (mx - v.panX) * (next / v.zoom);
      const panY = my - (my - v.panY) * (next / v.zoom);
      setViewport({ panX, panY, zoom: next });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // readOnly에서는 모델 변경 단축키 전부 비활성. 셀렉션·pan/zoom은 유지된다.
      if (uiStore.getState().readOnly) return;
      // undo/redo는 호스트(ProseMirror history 등)가 controlled value 흐름으로 처리.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        if (selection.kind === 'node') {
          e.preventDefault();
          removeNode(selection.id);
        } else if (selection.kind === 'edge') {
          e.preventDefault();
          removeEdge(selection.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [removeEdge, removeNode, selection, uiStore]);

  return (
    <>
    <svg
      ref={svgRef}
      className="trama-canvas"
      onPointerDown={onCanvasPointerDown}
      onDoubleClick={onCanvasDoubleClick}
      onContextMenu={onCanvasContextMenu}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <rect className="trama-canvas-bg" x={0} y={0} width="100%" height="100%" />
      <g
        className="trama-canvas-content"
        transform={`translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`}
      >
        {edgeOrder.map((eid) => {
          const e = edges[eid];
          if (!e) return null;
          const fromIncoming = slotCountByNode[e.from] ?? 0;
          const toIncoming = slotCountByNode[e.to] ?? 0;
          const socketIndex = (incomingMap[e.to] ?? []).indexOf(eid);
          return (
            <EdgeView
              key={eid}
              edgeId={eid}
              fromIncomingCount={fromIncoming}
              toIncomingCount={toIncoming}
              socketIndex={socketIndex}
            />
          );
        })}
        {edgeDraft && <EdgeDraftView />}
        {nodeOrder.map((nid) => (
          <NodeView key={nid} id={nid} incomingCount={slotCountByNode[nid] ?? 0} />
        ))}
        <PulseLayer />
      </g>
      {/* 떠 있는 패널 — 모든 노드 위에 그려져 z-order 보장. 노드 그룹 안에서
          렌더하면 그 노드보다 뒤에 그려진 다른 노드에 의해 가려진다. */}
    </svg>
    <CanvasContextMenu />
    </>
  );
}
