import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { tokens } from '@trama/tokens';
import {
  getFunctionSlotOccupancy,
  isConditionalNode,
  isFunctionNode,
  isValueNode,
  type NodeId,
} from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { combinerRegistry, functionRegistry } from '../store/registries.js';
import { formatNodeValue } from '../util/format.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { getNodeLayout, type PinLayout } from './box.js';
import { NodeBorderTrack } from './NodeBorderTrack.js';
import { NodeFrame } from './NodeFrame.js';
import { InteractiveArea } from './InteractiveArea.js';

interface Props {
  id: NodeId;
  incomingCount: number;
}

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);
const PIN_RADIUS = parseFloat(tokens.spacing.pinRadius);
const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const SOCKET_DOT_SIZE = parseFloat(tokens.spacing.socketDotSize);

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

function ValueNodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  const node = useModelStore((s) => s.model.nodes[id]);
  const currentValue = useModelStore((s) => {
    const n = s.model.nodes[id];
    const fallback = n && isValueNode(n) ? n.initialValue : 0;
    return s.executionState.values[id] ?? fallback;
  });

  const updateNode = useModelStore((s) => s.updateNode);
  const addEdge = useModelStore((s) => s.addEdge);
  const playbackStep = useModelStore((s) => s.playbackStep);
  const trajectoryLength = useModelStore((s) => s.trajectory.length);
  const selectNode = useUIStore((s) => s.selectNode);
  const editingNodeId = useUIStore((s) => s.editingNodeId);
  const setEditingNode = useUIStore((s) => s.setEditingNode);
  const startEdgeDraft = useUIStore((s) => s.startEdgeDraft);
  const endEdgeDraft = useUIStore((s) => s.endEdgeDraft);
  const openFunctionPicker = useUIStore((s) => s.openFunctionPicker);
  const openUnitInspector = useUIStore((s) => s.openUnitInspector);

  // lag=0 인입 엣지가 하나라도 있으면 매 step마다 propagation이 값을 덮어쓰므로
  // initialValue 슬라이더는 사용자에게 거짓 affordance가 된다.
  const hasLag0Incoming = useModelStore((s) => {
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (e && e.to === id && e.lag === 0) return true;
    }
    return false;
  });

  const labelDraftSeed = node?.label ?? '';
  const pos = node?.position ?? { x: 200, y: 200 };

  // 인라인 편집 중에는 drag 시작을 막아 input 포커스가 끊기지 않게.
  const canStartDrag = useCallback(() => editingNodeId !== id, [editingNodeId, id]);

  const onBodyDoubleClick = useCallback(() => {
    setEditingNode(id);
  }, [id, setEditingNode]);

  const handleDragRef = useRef<{ dragged: boolean } | null>(null);

  const onSocketPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (!node) return;
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
      const slotEl = target?.closest?.('[data-trama-slot-index]');
      const groupEl = target?.closest?.('[data-trama-node-id]');
      const targetId = groupEl?.getAttribute('data-trama-node-id');
      if (targetId && targetId !== id) {
        const lag: 0 | 1 = e.altKey ? 1 : 0;
        const model = useModelStore.getState().model;
        const targetNode = model.nodes[targetId];
        let slotIndex: number | undefined;
        if (targetNode && isFunctionNode(targetNode)) {
          const def = functionRegistry.get(targetNode.functionKey);
          if (!def) {
            endEdgeDraft();
            return;
          }
          const explicit = slotEl?.getAttribute('data-trama-slot-index');
          const occupied = new Set(
            getFunctionSlotOccupancy(model, targetId).map((o) => o.slotIndex),
          );
          if (explicit !== null && explicit !== undefined) {
            const s = Number(explicit);
            if (!occupied.has(s)) slotIndex = s;
          }
          if (slotIndex === undefined) {
            for (let i = 0; i < def.slots.length; i++) {
              if (!occupied.has(i)) {
                slotIndex = i;
                break;
              }
            }
          }
          if (slotIndex === undefined) {
            endEdgeDraft();
            return;
          }
        } else if (targetNode && isConditionalNode(targetNode)) {
          const explicit = slotEl?.getAttribute('data-trama-slot-index');
          const occupied = new Set(
            model.edgeOrder
              .map((eid) => model.edges[eid])
              .filter((edge) => edge && edge.to === targetId)
              .map((edge) => edge!.slotIndex),
          );
          if (explicit !== null && explicit !== undefined) {
            const s = Number(explicit);
            if (!occupied.has(s) && s >= 0 && s <= 1) slotIndex = s;
          }
          if (slotIndex === undefined) {
            for (let i = 0; i < 2; i++) {
              if (!occupied.has(i)) {
                slotIndex = i;
                break;
              }
            }
          }
          if (slotIndex === undefined) {
            endEdgeDraft();
            return;
          }
        }
        const created = addEdge({
          from: id,
          to: targetId,
          shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
          lag,
          slotIndex,
        });
        if (
          created &&
          !(targetNode && (isFunctionNode(targetNode) || isConditionalNode(targetNode)))
        ) {
          openFunctionPicker(created.id, { x: dropX, y: dropY });
        }
      }
      endEdgeDraft();
    },
    [addEdge, endEdgeDraft, id, openFunctionPicker],
  );

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
  if (!isValueNode(node)) return null;

  const layout = getNodeLayout(node, { incomingCount });
  const { halfW, halfH, width, height } = layout;
  const unit = resolveNodeUnit(node);

  // 입력성 노드(외부 입력이 없는 ValueNode)는 사용자가 의미를 직접 정한 값이라
  // focal 톤으로 강조. 나머지는 차분한 기본 톤.
  const isInputNode = !hasLag0Incoming;
  const isFocal = node.isFocal;
  const stateClass = isInputNode ? 'is-focal' : 'is-calm';

  const formatted = formatNodeValue(currentValue, unit);
  const combiner = combinerRegistry.get(node.combiner);
  const combinerLabel = combiner?.labels.ko ?? node.combiner;
  const combinerSym = combinerSymbol(node.combiner);

  return (
    <NodeFrame
      id={id}
      pos={pos}
      width={width}
      height={height}
      canStartDrag={canStartDrag}
      onBodyDoubleClick={onBodyDoubleClick}
    >
      <rect
        className={`trama-node-body ${stateClass}`}
        x={-halfW}
        y={-halfH}
        width={width}
        height={height}
        rx={CARD_CORNER}
        ry={CARD_CORNER}
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

      <line
        className="trama-node-divider"
        x1={layout.divider.x1}
        x2={layout.divider.x2}
        y1={layout.divider.y}
        y2={layout.divider.y}
      />

      <text className="trama-node-value" x={0} y={layout.valueY} textAnchor="middle">
        {formatted.primary}
        {formatted.accessory && (
          <tspan className="trama-node-unit" dx="6">
            {formatted.accessory}
          </tspan>
        )}
      </text>
      {/* 값+단위 영역을 InteractiveArea로 — 클릭 시 단위 인스펙터, 선택은 직접 처리.
          드래그는 InteractiveArea가 hit를 잡은 시점에 NodeFrame의 drag rect로 흐르지
          않으므로(같은 g 형제, topmost가 우선) 별도 stopPropagation 불필요. */}
      <InteractiveArea
        x={-halfW + 12}
        y={layout.valueY - 16}
        width={width - 24}
        height={28}
        hitClassName="trama-node-value-hit"
        onClick={() => {
          selectNode(id);
          openUnitInspector(id);
        }}
      />

      {layout.hasCombiner && layout.combinerCenterY !== null && (
        <CombinerChip
          symbol={combinerSym}
          label={combinerLabel}
          cy={layout.combinerCenterY}
        />
      )}

      {isFocal && playbackStep !== null && (
        <text className="trama-node-step-overlay" x={halfW + 6} y={-halfH + 10}>
          step {playbackStep + 1} / {trajectoryLength}
        </text>
      )}

      <PinShape pin={layout.leftPin} stateClass={stateClass} />
      {layout.leftPin.sockets.map((s, i) => (
        <SocketVisual key={`l${i}`} cx={s.x} cy={s.y} stateClass={stateClass} />
      ))}

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
      {isInputNode && editingNodeId !== id && (
        <NodeBorderTrack node={node} halfH={halfH} halfW={halfW} />
      )}
    </NodeFrame>
  );
}

export const ValueNodeView = memo(ValueNodeViewImpl);

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
  const text = `${symbol} ${label}`;
  const paddingX = parseFloat(tokens.spacing.combinerPaddingX);
  const fontSize = parseFloat(tokens.typography.textNodeUnit) * 16;
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
