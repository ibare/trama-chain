import { useCallback, useEffect, useRef, useState } from 'react';
import { tokens } from '@trama/tokens';
import { normalize, type Node } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { combinerRegistry } from '../store/registries.js';
import { formatValue, unitSuffix } from '../util/format.js';
import { getNodeLayout, type PinLayout } from './box.js';
import { NodeMicroSlider } from './NodeMicroSlider.js';

interface Props {
  node: Node;
  currentValue: number;
  incomingCount: number;
}

const THRESH_LOW = tokens.physical.thresholdNodeLow;
const THRESH_TIRED = tokens.physical.thresholdNodeTired;
const THRESH_ALIVE = tokens.physical.thresholdNodeAlive;
const OPACITY_LOW = tokens.physical.opacityNodeLow;
const OPACITY_HIGH = tokens.physical.opacityNodeHigh;
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);
const PIN_RADIUS = parseFloat(tokens.spacing.pinRadius);
const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const SOCKET_DOT_SIZE = parseFloat(tokens.spacing.socketDotSize);
const DRAG_THRESHOLD_PX = 3;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function combinerSymbol(key: string): string {
  switch (key) {
    case 'sum':
      return '+';
    case 'product':
      return '×';
    case 'average':
      return 'Ø';
    case 'max':
      return '↑';
    default:
      return '·';
  }
}

export function NodeView({ node, currentValue, incomingCount }: Props): JSX.Element {
  const layout = getNodeLayout(node, { incomingCount });
  const { halfW, halfH, width, height } = layout;
  const norm = normalize(currentValue, node.unit);
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

  // Socket 드래그 (엣지 생성) ----------------------------------------------
  const handleDragRef = useRef<{ dragged: boolean } | null>(null);

  const onSocketPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      const out = layout.rightPin.sockets[0];
      const startPoint = out
        ? { x: pos.x + out.x, y: pos.y + out.y }
        : { x: pos.x, y: pos.y };
      startEdgeDraft(node.id, startPoint, startPoint, lag);
      handleDragRef.current = { dragged: false };
    },
    [layout.rightPin.sockets, node.id, pos.x, pos.y, startEdgeDraft],
  );

  const onSocketPointerMove = useCallback(() => {
    if (!handleDragRef.current) return;
    handleDragRef.current.dragged = true;
  }, []);

  const onSocketPointerUp = useCallback(
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

  const suffix = unitSuffix(node.unit);
  const combiner = combinerRegistry.get(node.combiner);
  const combinerLabel = combiner?.labels.ko ?? node.combiner;
  const combinerSym = combinerSymbol(node.combiner);

  return (
    <g
      className={`trama-node ${animClass}`}
      data-trama-node-id={node.id}
      transform={`translate(${pos.x} ${pos.y})`}
      style={{ '--trama-node-opacity': opacity } as React.CSSProperties}
    >
      <g className="trama-node-inner">
        {/* 카드 본체 — 드래그 핸들 */}
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
          <foreignObject
            x={-halfW + 12}
            y={layout.labelY - 14}
            width={width - 24}
            height={26}
          >
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
          <text className="trama-node-label" x={0} y={layout.labelY} textAnchor="middle">
            {node.label}
          </text>
        )}

        {/* 구분선 */}
        <line
          className="trama-node-divider"
          x1={layout.divider.x1}
          x2={layout.divider.x2}
          y1={layout.divider.y}
          y2={layout.divider.y}
        />

        {/* 값 + 단위 */}
        <text className="trama-node-value" x={0} y={layout.valueY} textAnchor="middle">
          {formatValue(currentValue, node.unit)}
          {suffix && (
            <tspan className="trama-node-unit" dx="6">
              {suffix}
            </tspan>
          )}
        </text>

        {/* combiner 칩 (다중 입력시만) */}
        {layout.hasCombiner && layout.combinerCenterY !== null && (
          <CombinerChip
            symbol={combinerSym}
            label={combinerLabel}
            cy={layout.combinerCenterY}
          />
        )}

        {isFocal && playbackStep !== null && (
          <text
            className="trama-node-step-overlay"
            x={halfW + 6}
            y={-halfH + 10}
          >
            step {playbackStep + 1} / {trajectoryLength}
          </text>
        )}

        {/* 좌측 핀 (입력) */}
        <PinShape pin={layout.leftPin} stateClass={stateClass} />
        {layout.leftPin.sockets.map((s, i) => (
          <SocketVisual key={`l${i}`} cx={s.x} cy={s.y} stateClass={stateClass} />
        ))}

        {/* 우측 핀 (출력) */}
        <PinShape pin={layout.rightPin} stateClass={stateClass} />
        {layout.rightPin.sockets[0] && (
          <>
            <SocketVisual
              cx={layout.rightPin.sockets[0].x}
              cy={layout.rightPin.sockets[0].y}
              stateClass={stateClass}
            />
            <circle
              className="trama-node-socket-hit"
              cx={layout.rightPin.sockets[0].x}
              cy={layout.rightPin.sockets[0].y}
              r={Math.max(SOCKET_SIZE, 12)}
              onPointerDown={onSocketPointerDown}
              onPointerMove={onSocketPointerMove}
              onPointerUp={onSocketPointerUp}
            />
          </>
        )}
      </g>
      {isSelected && editingNodeId !== node.id && (
        <NodeMicroSlider node={node} halfH={halfH} halfW={halfW} />
      )}
    </g>
  );
}

function PinShape({ pin, stateClass }: { pin: PinLayout; stateClass: string }): JSX.Element {
  return (
    <rect
      className={`trama-node-pin ${stateClass}`}
      x={pin.rectX}
      y={pin.rectY}
      width={pin.width}
      height={pin.height}
      rx={Math.min(PIN_RADIUS, pin.width / 2, pin.height / 2)}
      ry={Math.min(PIN_RADIUS, pin.width / 2, pin.height / 2)}
    />
  );
}

function SocketVisual({
  cx,
  cy,
  stateClass,
}: {
  cx: number;
  cy: number;
  stateClass: string;
}): JSX.Element {
  return (
    <g pointerEvents="none">
      <circle
        className={`trama-node-socket-ring ${stateClass}`}
        cx={cx}
        cy={cy}
        r={SOCKET_SIZE / 2}
      />
      <circle
        className={`trama-node-socket-dot ${stateClass}`}
        cx={cx}
        cy={cy}
        r={SOCKET_DOT_SIZE / 2}
      />
    </g>
  );
}

function CombinerChip({
  symbol,
  label,
  cy,
}: {
  symbol: string;
  label: string;
  cy: number;
}): JSX.Element {
  // SVG에서 텍스트 폭을 정확히 알기 어려우니 라벨 길이로 근사.
  const text = `${symbol} ${label}`;
  const paddingX = parseFloat(tokens.spacing.combinerPaddingX);
  const fontSize = parseFloat(tokens.typography.textNodeUnit) * 16; // rem→px 근사
  const approxCharW = fontSize * 0.55;
  const innerW = text.length * approxCharW;
  const w = innerW + paddingX * 2;
  const h = parseFloat(tokens.spacing.combinerPaddingY) * 2 + fontSize + 2;
  const radius = Math.min(parseFloat(tokens.spacing.radiusCombiner), h / 2);
  return (
    <g pointerEvents="none">
      <rect
        className="trama-node-combiner"
        x={-w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
      />
      <text className="trama-node-combiner-text" x={0} y={cy + fontSize / 3} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}
