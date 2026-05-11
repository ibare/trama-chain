import { useCallback, useEffect, useRef, useState } from 'react';
import { tokens } from '@trama/tokens';
import { normalize, type Node } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { formatValue, unitSuffix } from '../util/format.js';
import { getNodeBox } from './box.js';
import { NodeMicroSlider } from './NodeMicroSlider.js';

interface Props {
  node: Node;
  currentValue: number;
}

const THRESH_LOW = tokens.physical.thresholdNodeLow;
const THRESH_TIRED = tokens.physical.thresholdNodeTired;
const THRESH_ALIVE = tokens.physical.thresholdNodeAlive;
const OPACITY_LOW = tokens.physical.opacityNodeLow;
const OPACITY_HIGH = tokens.physical.opacityNodeHigh;
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);
const HANDLE_OFFSET = parseFloat(tokens.spacing.nodeHandleOffset);
const DRAG_THRESHOLD_PX = 3;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function NodeView({ node, currentValue }: Props): JSX.Element {
  const norm = normalize(currentValue, node.unit);
  const { width, height } = getNodeBox(node, currentValue);
  const halfW = width / 2;
  const halfH = height / 2;
  const opacity = lerp(OPACITY_LOW, OPACITY_HIGH, norm);

  const isLow = norm < THRESH_LOW;
  const isFocal = node.isFocal;
  const stateClass = isFocal ? 'is-focal' : isLow ? 'is-low' : 'is-calm';

  let animClass = '';
  if (norm < THRESH_TIRED) animClass = 'is-tired';
  else if (norm > THRESH_ALIVE) animClass = 'is-alive';

  const pos = node.position ?? { x: 200, y: 200 };

  const updateNode = useModelStore((s) => s.updateNode);
  const addEdge = useModelStore((s) => s.addEdge);
  const playbackStep = useModelStore((s) => s.playbackStep);
  const trajectoryLength = useModelStore((s) => s.trajectory.length);
  const selection = useUIStore((s) => s.selection);
  const selectNode = useUIStore((s) => s.selectNode);
  const editingNodeId = useUIStore((s) => s.editingNodeId);
  const setEditingNode = useUIStore((s) => s.setEditingNode);
  const startEdgeDraft = useUIStore((s) => s.startEdgeDraft);
  const endEdgeDraft = useUIStore((s) => s.endEdgeDraft);
  const openFunctionPicker = useUIStore((s) => s.openFunctionPicker);

  const isSelected = selection.kind === 'node' && selection.id === node.id;

  // Body 드래그 = 위치 이동 -------------------------------------------------
  const moveRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPosX: number;
    startPosY: number;
    dragged: boolean;
  } | null>(null);

  const onBodyPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (editingNodeId === node.id) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      selectNode(node.id);
      moveRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPosX: pos.x,
        startPosY: pos.y,
        dragged: false,
      };
    },
    [editingNodeId, node.id, pos.x, pos.y, selectNode],
  );

  const onBodyPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      if (!m) return;
      const dx = e.clientX - m.startClientX;
      const dy = e.clientY - m.startClientY;
      if (!m.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      m.dragged = true;
      updateNode(
        node.id,
        { position: { x: m.startPosX + dx, y: m.startPosY + dy } },
        'move-node',
        '위치 이동',
      );
    },
    [node.id, updateNode],
  );

  const onBodyPointerUp = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      moveRef.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (!m?.dragged && e.detail >= 2) {
        setEditingNode(node.id);
      }
    },
    [node.id, setEditingNode],
  );

  // Handle 드래그 (엣지 생성) ----------------------------------------------
  const handleDragRef = useRef<{ dragged: boolean } | null>(null);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      startEdgeDraft(node.id, { x: pos.x, y: pos.y }, lag);
      handleDragRef.current = { dragged: false };
    },
    [node.id, pos.x, pos.y, startEdgeDraft],
  );

  const onHandlePointerMove = useCallback(() => {
    if (!handleDragRef.current) return;
    handleDragRef.current.dragged = true;
  }, []);

  const onHandlePointerUp = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      handleDragRef.current = null;
      const dropX = e.clientX;
      const dropY = e.clientY;
      const target = document.elementFromPoint(dropX, dropY);
      const groupEl = target?.closest?.('[data-trama-node-id]');
      const targetId = groupEl?.getAttribute('data-trama-node-id');
      if (targetId && targetId !== node.id) {
        const lag: 0 | 1 = e.altKey ? 1 : 0;
        const created = addEdge({
          from: node.id,
          to: targetId,
          shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
          lag,
        });
        if (created) {
          openFunctionPicker(created.id, { x: dropX, y: dropY });
        }
      }
      endEdgeDraft();
    },
    [addEdge, endEdgeDraft, node.id, openFunctionPicker],
  );

  // Inline name editor ---------------------------------------------------
  const [nameDraft, setNameDraft] = useState(node.label);
  useEffect(() => {
    if (editingNodeId === node.id) setNameDraft(node.label);
  }, [editingNodeId, node.id, node.label]);

  const commitName = useCallback(() => {
    const v = nameDraft.trim();
    if (v && v !== node.label) updateNode(node.id, { label: v }, 'rename-node', '이름 변경');
    setEditingNode(null);
  }, [nameDraft, node.id, node.label, setEditingNode, updateNode]);

  const labelY = -halfH + 18;
  const valueY = 4;
  const unitY = halfH - 8;

  return (
    <g
      className={`trama-node ${animClass}`}
      data-trama-node-id={node.id}
      transform={`translate(${pos.x} ${pos.y})`}
      style={{ '--trama-node-opacity': opacity } as React.CSSProperties}
    >
      <g className="trama-node-inner">
        <rect
          className={`trama-node-body ${stateClass}`}
          x={-halfW}
          y={-halfH}
          width={width}
          height={height}
          rx={CARD_CORNER}
          ry={CARD_CORNER}
          onPointerDown={onBodyPointerDown}
          onPointerMove={onBodyPointerMove}
          onPointerUp={onBodyPointerUp}
        />
        {editingNodeId === node.id ? (
          <foreignObject x={-halfW + 6} y={-12} width={width - 12} height={26}>
            <input
              className="trama-node-name-input"
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') setEditingNode(null);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </foreignObject>
        ) : (
          <>
            <text className="trama-node-label" y={labelY}>
              {node.label}
            </text>
            <text className="trama-node-value" y={valueY}>
              {formatValue(currentValue, node.unit)}
            </text>
            {unitSuffix(node.unit) && (
              <text className="trama-node-unit" y={unitY}>
                {unitSuffix(node.unit)}
              </text>
            )}
            {isFocal && playbackStep !== null && (
              <text className="trama-node-step-overlay" x={halfW + 6} y={-halfH + 10}>
                step {playbackStep + 1} / {trajectoryLength}
              </text>
            )}
          </>
        )}
        {/* 엣지 생성 핸들: 카드 우측 변 중앙 */}
        <circle
          className="trama-affordance is-visible"
          cx={halfW + HANDLE_OFFSET + 3}
          cy={0}
          r={5}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        />
      </g>
      {isSelected && editingNodeId !== node.id && (
        <NodeMicroSlider node={node} halfH={halfH} halfW={halfW} />
      )}
    </g>
  );
}
