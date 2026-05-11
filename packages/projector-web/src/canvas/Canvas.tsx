import { useCallback, useEffect, useMemo, useRef } from 'react';
import { normalize, type EdgeId, type NodeId } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { EdgeView } from '../edge/EdgeView.js';
import { NodeView } from '../node/NodeView.js';
import { EdgeDraftView } from './EdgeDraftView.js';
import { getNodeLayout } from '../node/box.js';

export function Canvas(): JSX.Element {
  const model = useModelStore((s) => s.model);
  const execState = useModelStore((s) => s.executionState);
  const addNode = useModelStore((s) => s.addNode);
  const setEditingNode = useUIStore((s) => s.setEditingNode);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const closeFunctionPicker = useUIStore((s) => s.closeFunctionPicker);
  const clearInsertIntent = useUIStore((s) => s.clearInsertNodeIntent);
  const edgeDraft = useUIStore((s) => s.edgeDraft);
  const updateEdgeDraft = useUIStore((s) => s.updateEdgeDraft);
  const endEdgeDraft = useUIStore((s) => s.endEdgeDraft);
  const activeNodeDrag = useUIStore((s) => s.activeNodeDrag);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const toCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // 각 노드별 incoming 엣지 id 목록 (edgeOrder 순서 유지) — 좌측 핀 소켓 인덱스 결정에 사용
  const incomingMap = useMemo(() => {
    const map: Record<NodeId, EdgeId[]> = {};
    for (const eid of model.edgeOrder) {
      const e = model.edges[eid];
      if (!e) continue;
      (map[e.to] ??= []).push(eid);
    }
    return map;
  }, [model.edgeOrder, model.edges]);

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.target === e.currentTarget || (e.target as Element).classList?.contains?.('trama-canvas-bg')) {
        clearSelection();
        closeFunctionPicker();
        clearInsertIntent();
      }
    },
    [clearSelection, closeFunctionPicker, clearInsertIntent],
  );

  const onCanvasDoubleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const target = e.target as Element;
      if (target !== e.currentTarget && !target.classList?.contains?.('trama-canvas-bg')) return;
      const pos = toCanvasCoords(e.clientX, e.clientY);
      const node = addNode({
        label: '새 변수',
        unit: { kind: 'scale', min: 0, max: 1 },
        initialValue: 0.5,
        position: pos,
        isFocal: model.nodeOrder.length === 0,
      });
      setEditingNode(node.id);
    },
    [addNode, model.nodeOrder.length, setEditingNode, toCanvasCoords],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!edgeDraft) return;
      const pos = toCanvasCoords(e.clientX, e.clientY);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      updateEdgeDraft(pos, lag);
    },
    [edgeDraft, toCanvasCoords, updateEdgeDraft],
  );

  const onPointerUp = useCallback(() => {
    if (edgeDraft) endEdgeDraft();
  }, [edgeDraft, endEdgeDraft]);

  const undo = useModelStore((s) => s.undo);
  const redo = useModelStore((s) => s.redo);
  const removeNode = useModelStore((s) => s.removeNode);
  const removeEdge = useModelStore((s) => s.removeEdge);
  const selection = useUIStore((s) => s.selection);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
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
  }, [redo, removeEdge, removeNode, selection, undo]);

  return (
    <svg
      ref={svgRef}
      className="trama-canvas"
      onPointerDown={onCanvasPointerDown}
      onDoubleClick={onCanvasDoubleClick}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <rect className="trama-canvas-bg" x={0} y={0} width="100%" height="100%" />
      {model.edgeOrder.map((eid) => {
        const edge = model.edges[eid];
        if (!edge) return null;
        const fromNode = model.nodes[edge.from];
        const toNode = model.nodes[edge.to];
        if (!fromNode || !toNode) return null;
        const srcValue = execState.values[edge.from] ?? fromNode.initialValue;
        const norm = normalize(srcValue, fromNode.unit);

        const fromIncoming = incomingMap[fromNode.id]?.length ?? 0;
        const toIncoming = incomingMap[toNode.id]?.length ?? 0;
        const socketIdx = (incomingMap[toNode.id] ?? []).indexOf(eid);
        const fromLayout = getNodeLayout(fromNode, { incomingCount: fromIncoming });
        const toLayout = getNodeLayout(toNode, { incomingCount: toIncoming });
        // 드래그 중인 노드는 model.position 위에 ephemeral 오프셋을 더해 엣지 끝점을 계산.
        const fromBase = fromNode.position ?? { x: 0, y: 0 };
        const toBase = toNode.position ?? { x: 0, y: 0 };
        const fromPos =
          activeNodeDrag && activeNodeDrag.nodeId === fromNode.id
            ? { x: fromBase.x + activeNodeDrag.dx, y: fromBase.y + activeNodeDrag.dy }
            : fromBase;
        const toPos =
          activeNodeDrag && activeNodeDrag.nodeId === toNode.id
            ? { x: toBase.x + activeNodeDrag.dx, y: toBase.y + activeNodeDrag.dy }
            : toBase;
        const sourceSocket = fromLayout.rightPin.sockets[0];
        const targetSocket =
          toLayout.leftPin.sockets[Math.max(0, socketIdx)] ?? toLayout.leftPin.sockets[0];
        if (!sourceSocket || !targetSocket) return null;
        const start = { x: fromPos.x + sourceSocket.x, y: fromPos.y + sourceSocket.y };
        const end = { x: toPos.x + targetSocket.x, y: toPos.y + targetSocket.y };

        return (
          <EdgeView
            key={eid}
            edge={edge}
            start={start}
            end={end}
            sourceNormalized={norm}
          />
        );
      })}
      {edgeDraft && <EdgeDraftView />}
      {model.nodeOrder.map((nid) => {
        const node = model.nodes[nid];
        if (!node) return null;
        const v = execState.values[nid] ?? node.initialValue;
        const incomingCount = incomingMap[node.id]?.length ?? 0;
        const dragOffset =
          activeNodeDrag && activeNodeDrag.nodeId === nid
            ? { dx: activeNodeDrag.dx, dy: activeNodeDrag.dy }
            : null;
        return (
          <NodeView
            key={nid}
            node={node}
            currentValue={v}
            incomingCount={incomingCount}
            dragOffset={dragOffset}
          />
        );
      })}
    </svg>
  );
}
