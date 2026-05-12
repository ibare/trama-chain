import { memo, useCallback, useRef } from 'react';
import { tokens } from '@trama/tokens';
import {
  isConditionalNode,
  isFunctionNode,
  isOutputValid,
  type ConditionalOperator,
  type NodeId,
} from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { functionRegistry } from '../store/registries.js';
import {
  CONDITIONAL_CARD_H,
  CONDITIONAL_CARD_W,
  getConditionalNodeLayout,
} from './conditional-box.js';
import { NodeFrame } from './NodeFrame.js';
import { InteractiveArea } from './InteractiveArea.js';

interface Props {
  id: NodeId;
}

const CARD_W = CONDITIONAL_CARD_W;
const CARD_H = CONDITIONAL_CARD_H;
const SLOT_LABEL_INSET = 20;
const PIN_W = parseFloat(tokens.spacing.pinMinSize);
const PIN_RADIUS = parseFloat(tokens.spacing.pinRadius);
const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const SOCKET_DOT_SIZE = parseFloat(tokens.spacing.socketDotSize);
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

const OPERATORS: ConditionalOperator[] = ['>', '==', '!='];

function ConditionalNodeViewImpl({ id }: Props): JSX.Element | null {
  const node = useModelStore((s) => s.model.nodes[id]);
  const trueValid = useModelStore((s) => isOutputValid(s.executionState, id, 0));
  const falseValid = useModelStore((s) => isOutputValid(s.executionState, id, 1));
  const updateNode = useModelStore((s) => s.updateNode);
  const addEdge = useModelStore((s) => s.addEdge);
  const selection = useUIStore((s) => s.selection);
  const startEdgeDraft = useUIStore((s) => s.startEdgeDraft);
  const endEdgeDraft = useUIStore((s) => s.endEdgeDraft);

  const pos = node?.position ?? { x: 200, y: 200 };
  const layout = getConditionalNodeLayout();
  const { halfW, halfH } = layout;

  const handleDragRef = useRef<{ dragged: boolean; sourceSlot?: number } | null>(null);

  const makeOutputHandlers = useCallback(
    (slotIndex: 0 | 1, valid: boolean) => ({
      onPointerDown: (e: React.PointerEvent<SVGCircleElement>) => {
        if (!node || !valid) return;
        (e.target as Element).setPointerCapture(e.pointerId);
        const lag: 0 | 1 = e.altKey ? 1 : 0;
        const startPoint = { x: pos.x, y: pos.y };
        startEdgeDraft(id, startPoint, startPoint, lag);
        handleDragRef.current = { dragged: false, sourceSlot: slotIndex };
      },
      onPointerMove: () => {
        if (!handleDragRef.current) return;
        handleDragRef.current.dragged = true;
      },
      onPointerUp: (e: React.PointerEvent<SVGCircleElement>) => {
        (e.target as Element).releasePointerCapture?.(e.pointerId);
        const captured = handleDragRef.current;
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
          let resolvedSlot: number | undefined;
          if (targetNode && isFunctionNode(targetNode)) {
            const def = functionRegistry.get(targetNode.functionKey);
            if (!def) {
              endEdgeDraft();
              return;
            }
            const explicit = slotEl?.getAttribute('data-trama-slot-index');
            const occupied = new Set(
              model.edgeOrder
                .map((eid) => model.edges[eid])
                .filter((edge) => edge && edge.to === targetId)
                .map((edge) => edge!.slotIndex),
            );
            if (explicit !== null && explicit !== undefined) {
              const s = Number(explicit);
              if (!occupied.has(s)) resolvedSlot = s;
            }
            if (resolvedSlot === undefined) {
              for (let i = 0; i < def.slots.length; i++) {
                if (!occupied.has(i)) {
                  resolvedSlot = i;
                  break;
                }
              }
            }
            if (resolvedSlot === undefined) {
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
              if (!occupied.has(s) && s >= 0 && s <= 1) resolvedSlot = s;
            }
            if (resolvedSlot === undefined) {
              for (let i = 0; i < 2; i++) {
                if (!occupied.has(i)) {
                  resolvedSlot = i;
                  break;
                }
              }
            }
            if (resolvedSlot === undefined) {
              endEdgeDraft();
              return;
            }
          }
          addEdge({
            from: id,
            to: targetId,
            shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
            lag,
            slotIndex: resolvedSlot,
            sourceSlotIndex: captured?.sourceSlot ?? slotIndex,
          });
        }
        endEdgeDraft();
      },
    }),
    [addEdge, endEdgeDraft, id, node, pos.x, pos.y, startEdgeDraft],
  );

  const onOperatorClick = useCallback(() => {
    if (!node || !isConditionalNode(node)) return;
    const idx = OPERATORS.indexOf(node.operator);
    const next = OPERATORS[(idx + 1) % OPERATORS.length]!;
    updateNode(id, { operator: next }, 'update-node', '연산자 변경');
  }, [id, node, updateNode]);

  if (!node || !isConditionalNode(node)) return null;

  const isSelected = selection.kind === 'node' && selection.id === id;
  // 노드 활성 상태: 양 입력이 모두 valid해야 출력이 살아남는다.
  const isActive = trueValid || falseValid;
  const stateClass = isActive ? 'is-calm' : 'is-low';

  // 입력 슬롯 위치 — TL, BL
  const inputSlots: { slot: 0 | 1; label: 'A' | 'B'; x: number; y: number }[] = [
    { slot: 0, label: 'A', x: layout.inputSockets[0]!.x, y: layout.inputSockets[0]!.y },
    { slot: 1, label: 'B', x: layout.inputSockets[1]!.x, y: layout.inputSockets[1]!.y },
  ];
  // 출력 슬롯 — TR, BR
  const outputSlots: { slot: 0 | 1; label: string; x: number; y: number; valid: boolean }[] = [
    {
      slot: 0,
      label: '참',
      x: layout.outputSockets[0]!.x,
      y: layout.outputSockets[0]!.y,
      valid: trueValid,
    },
    {
      slot: 1,
      label: '거짓',
      x: layout.outputSockets[1]!.x,
      y: layout.outputSockets[1]!.y,
      valid: falseValid,
    },
  ];

  return (
    <NodeFrame
      id={id}
      pos={pos}
      width={CARD_W}
      height={CARD_H}
      className={`trama-conditional-node${isActive ? '' : ' is-invalid'}`}
    >
      <rect
        className={`trama-node-body trama-function-body ${stateClass}${isSelected ? ' is-selected' : ''}`}
        x={-halfW}
        y={-halfH}
        width={CARD_W}
        height={CARD_H}
        rx={CARD_CORNER}
        ry={CARD_CORNER}
      />

      {/* 중앙: A {op} B — operator 클릭 시 순환. NodeFrame이 drag rect를 z-order
          아래에 깔기 때문에, 이 InteractiveArea가 hit를 잡으면 drag는 발화하지 않는다. */}
      <InteractiveArea
        x={-56}
        y={-22}
        width={112}
        height={44}
        rx={6}
        ry={6}
        hitClassName="trama-conditional-operator-hit"
        onClick={onOperatorClick}
      >
        <text className="trama-function-symbol" x={0} y={4} textAnchor="middle">
          {`A ${node.operator} B`}
        </text>
      </InteractiveArea>
      <text className="trama-function-label" x={0} y={halfH - 8} textAnchor="middle">
        {node.label || '조건'}
      </text>

      {/* 입력 슬롯 라벨 + 핀 + 소켓 (TL=A, BL=B). 라벨은 핀 안쪽으로 충분히 inset. */}
      {inputSlots.map((s) => (
        <g key={`in${s.slot}`}>
          <text
            className="trama-conditional-slot-label"
            x={s.x + SLOT_LABEL_INSET}
            y={s.y + 4}
            textAnchor="start"
          >
            {s.label}
          </text>
          <PinShape side="left" cx={s.x} cy={s.y} stateClass={stateClass} />
          <SocketVisual cx={s.x} cy={s.y} stateClass={stateClass} />
          <circle
            className="trama-node-socket-hit"
            data-trama-slot-index={s.slot}
            cx={s.x}
            cy={s.y}
            r={Math.max(SOCKET_SIZE, 12)}
          />
        </g>
      ))}

      {/* 출력 슬롯 (TR=참, BR=거짓) — 두 슬롯 모두 항상 노출, valid 여부는 상태 클래스로. */}
      {outputSlots.map((s) => {
        const handlers = makeOutputHandlers(s.slot, s.valid);
        const slotState = s.valid ? 'is-calm' : 'is-low';
        return (
          <g key={`out${s.slot}`} className={s.valid ? '' : 'is-inactive-output'}>
            <text
              className="trama-conditional-slot-label"
              x={s.x - SLOT_LABEL_INSET}
              y={s.y + 4}
              textAnchor="end"
            >
              {s.label}
            </text>
            <PinShape side="right" cx={s.x} cy={s.y} stateClass={slotState} />
            <SocketVisual cx={s.x} cy={s.y} stateClass={slotState} />
            <circle
              className="trama-node-socket-hit"
              cx={s.x}
              cy={s.y}
              r={Math.max(SOCKET_SIZE, 12)}
              onPointerDown={handlers.onPointerDown}
              onPointerMove={handlers.onPointerMove}
              onPointerUp={handlers.onPointerUp}
            />
          </g>
        );
      })}
    </NodeFrame>
  );
}

export const ConditionalNodeView = memo(ConditionalNodeViewImpl);

function PinShape({
  side,
  cx,
  cy,
  stateClass,
}: {
  side: 'left' | 'right';
  cx: number;
  cy: number;
  stateClass: string;
}): JSX.Element {
  void side;
  return (
    <rect
      className={`trama-node-pin ${stateClass}`}
      x={cx - PIN_W / 2}
      y={cy - PIN_W / 2}
      width={PIN_W}
      height={PIN_W}
      rx={Math.min(PIN_RADIUS, PIN_W / 2)}
      ry={Math.min(PIN_RADIUS, PIN_W / 2)}
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
