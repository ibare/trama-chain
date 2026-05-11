import { useCallback, useEffect, useRef } from 'react';
import { normalize } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { EdgeView } from '../edge/EdgeView.js';
import { NodeView } from '../node/NodeView.js';
import { EdgeDraftView } from './EdgeDraftView.js';

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

  const svgRef = useRef<SVGSVGElement | null>(null);

  const toCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

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

  // 키보드: Delete, Cmd+Z, Cmd+Shift+Z
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
        // editor 안에서 입력 중이면 무시
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
        const dstValue = execState.values[edge.to] ?? toNode.initialValue;
        const norm = normalize(srcValue, fromNode.unit);
        return (
          <EdgeView
            key={eid}
            edge={edge}
            fromNode={fromNode}
            toNode={toNode}
            fromValue={srcValue}
            toValue={dstValue}
            sourceNormalized={norm}
          />
        );
      })}
      {edgeDraft && <EdgeDraftView />}
      {model.nodeOrder.map((nid) => {
        const node = model.nodes[nid];
        if (!node) return null;
        const v = execState.values[nid] ?? node.initialValue;
        return <NodeView key={nid} node={node} currentValue={v} />;
      })}
    </svg>
  );
}
