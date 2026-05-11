import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { tokens } from '@trama/tokens';
import { normalize, type NodeId } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { combinerRegistry } from '../store/registries.js';
import { formatValue, unitSuffix } from '../util/format.js';
import { getNodeLayout, type PinLayout } from './box.js';
import { NodeMicroSlider } from './NodeMicroSlider.js';
import {
  getIncidentEdgeHandles,
  registerNodeEl,
  type EdgeHandle,
} from '../canvas/drag-registry.js';

interface Props {
  id: NodeId;
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

function NodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  // 좁은 셀렉터로 자기 노드만 구독. 다른 노드 변경에는 리렌더되지 않는다.
  const node = useModelStore((s) => s.model.nodes[id]);
  const currentValue = useModelStore((s) => {
    const n = s.model.nodes[id];
    return s.executionState.values[id] ?? n?.initialValue ?? 0;
  });

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

  // 노드 <g> 엘리먼트 ref — 드래그 중 imperative하게 transform을 갱신하고,
  // 외부(EdgeView 핸들 호출자)에서도 이 노드 DOM에 접근할 수 있게 레지스트리에 등록.
  const outerGRef = useRef<SVGGElement | null>(null);
  useEffect(() => {
    const el = outerGRef.current;
    if (!el) return undefined;
    return registerNodeEl(id, el);
  }, [id]);

  // 모든 hook은 early return 이전에 호출되어야 한다. node가 잠시 undefined일 수
  // 있으므로 안에서 옵셔널로 접근한다 (이벤트 핸들러는 node 미존재 시 발화하지
  // 않으므로 안전).
  const labelDraftSeed = node?.label ?? '';
  const pos = node?.position ?? { x: 200, y: 200 };

  // Body 드래그 = 위치 이동 -------------------------------------------------
  // 드래그 중에는 React 사이클을 거치지 않는다. 노드 <g>의 transform과 인접
  // 엣지 <path>의 d를 setAttribute로 직접 갱신하고, pointerup 시점에 한 번만
  // model.position으로 commit한다. 이후 React가 declarative 렌더로 덮어쓴다.
  const moveRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPosX: number;
    startPosY: number;
    lastDx: number;
    lastDy: number;
    dragged: boolean;
    incidents: EdgeHandle[];
  } | null>(null);

  const onBodyPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (editingNodeId === id) return;
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
        incidents: getIncidentEdgeHandles(id),
      };
    },
    [editingNodeId, id, pos.x, pos.y, selectNode],
  );

  const onBodyPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      if (!m) return;
      const dx = e.clientX - m.startClientX;
      const dy = e.clientY - m.startClientY;
      if (!m.dragged) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        m.dragged = true;
      }
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

  const onBodyPointerUp = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      moveRef.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (m?.dragged) {
        if (m.lastDx !== 0 || m.lastDy !== 0) {
          updateNode(
            id,
            { position: { x: m.startPosX + m.lastDx, y: m.startPosY + m.lastDy } },
            'move-node',
            '위치 이동',
          );
        }
        return;
      }
      if (e.detail >= 2) {
        setEditingNode(id);
      }
    },
    [id, setEditingNode, updateNode],
  );

  // Socket 드래그 (엣지 생성) ----------------------------------------------
  const handleDragRef = useRef<{ dragged: boolean } | null>(null);

  // layout은 hook 이후, 렌더 직전에 다시 계산하지만 콜백이 참조하는 right-pin
  // 좌표는 node가 있어야 의미가 있다. 핸들러 안에서 안전 fallback.
  const onSocketPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (!node) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      const layoutNow = getNodeLayout(node, { incomingCount });
      const out = layoutNow.rightPin.sockets[0];
      const startPoint = out
        ? { x: pos.x + out.x, y: pos.y + out.y }
        : { x: pos.x, y: pos.y };
      startEdgeDraft(id, startPoint, startPoint, lag);
      handleDragRef.current = { dragged: false };
    },
    [id, incomingCount, node, pos.x, pos.y, startEdgeDraft],
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
      if (targetId && targetId !== id) {
        const lag: 0 | 1 = e.altKey ? 1 : 0;
        const created = addEdge({
          from: id,
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
    [addEdge, endEdgeDraft, id, openFunctionPicker],
  );

  // Inline name editor ---------------------------------------------------
  const [nameDraft, setNameDraft] = useState(labelDraftSeed);
  useEffect(() => {
    if (editingNodeId === id && node) setNameDraft(node.label);
  }, [editingNodeId, id, node]);

  const commitName = useCallback(() => {
    if (!node) {
      setEditingNode(null);
      return;
    }
    const v = nameDraft.trim();
    if (v && v !== node.label) updateNode(id, { label: v }, 'rename-node', '이름 변경');
    setEditingNode(null);
  }, [id, nameDraft, node, setEditingNode, updateNode]);

  if (!node) return null;

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

  const isSelected = selection.kind === 'node' && selection.id === id;

  const suffix = unitSuffix(node.unit);
  const combiner = combinerRegistry.get(node.combiner);
  const combinerLabel = combiner?.labels.ko ?? node.combiner;
  const combinerSym = combinerSymbol(node.combiner);

  // 드래그 중 transform은 imperative하게 setAttribute로 갱신된다.
  // 여기서는 declarative한 baseline만 그려둔다. pointerup에서 model.position이
  // commit되면 React가 이 transform으로 자연스럽게 덮어쓴다.
  return (
    <g
      ref={outerGRef}
      className={`trama-node ${animClass}`}
      data-trama-node-id={id}
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
        {editingNodeId === id ? (
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
      {isSelected && editingNodeId !== id && (
        <NodeMicroSlider node={node} halfH={halfH} halfW={halfW} />
      )}
    </g>
  );
}

/**
 * id·incomingCount만 props로 받으므로 Canvas 리렌더가 자식까지 전파되지 않는다.
 * 내부에서는 자기 노드만 좁게 구독한다.
 */
export const NodeView = memo(NodeViewImpl);

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
