import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { EdgeId, NodeId } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { EdgeView } from '../edge/EdgeView.js';
import { NodeView } from '../node/NodeView.js';
import { EdgeDraftView } from './EdgeDraftView.js';

export function Canvas(): JSX.Element {
  // 좁은 셀렉터 — Canvas 자체는 topology(노드·엣지 목록) 변경에만 리렌더된다.
  // 드래그 오프셋, 값 변화, 셀렉션 변화는 모두 자식이 자기 id로 직접 구독하므로
  // 여기서는 구독하지 않는다.
  const nodeOrder = useModelStore((s) => s.model.nodeOrder);
  const edgeOrder = useModelStore((s) => s.model.edgeOrder);
  const edges = useModelStore((s) => s.model.edges);
  const nodeCount = nodeOrder.length;

  const addNode = useModelStore((s) => s.addNode);
  const setEditingNode = useUIStore((s) => s.setEditingNode);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const closeFunctionPicker = useUIStore((s) => s.closeFunctionPicker);
  const clearInsertIntent = useUIStore((s) => s.clearInsertNodeIntent);
  const edgeDraft = useUIStore((s) => s.edgeDraft);
  const updateEdgeDraft = useUIStore((s) => s.updateEdgeDraft);
  const endEdgeDraft = useUIStore((s) => s.endEdgeDraft);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const toCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
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

  // 노드별 incomingCount (자식 prop으로 전달). 토폴로지가 동일하면 안정.
  const incomingCountByNode = useMemo(() => {
    const m: Record<NodeId, number> = {};
    for (const nid of nodeOrder) m[nid] = incomingMap[nid]?.length ?? 0;
    return m;
  }, [nodeOrder, incomingMap]);

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
        isFocal: nodeCount === 0,
      });
      setEditingNode(node.id);
    },
    [addNode, nodeCount, setEditingNode, toCanvasCoords],
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
      {edgeOrder.map((eid) => {
        const e = edges[eid];
        if (!e) return null;
        const fromIncoming = incomingCountByNode[e.from] ?? 0;
        const toIncoming = incomingCountByNode[e.to] ?? 0;
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
        <NodeView key={nid} id={nid} incomingCount={incomingCountByNode[nid] ?? 0} />
      ))}
    </svg>
  );
}
