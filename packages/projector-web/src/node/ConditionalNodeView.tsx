import { memo, useCallback, useEffect, useRef } from 'react';
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
import {
  getIncidentEdgeHandles,
  registerNodeEl,
  type EdgeHandle,
} from '../canvas/drag-registry.js';
import { getCurrentZoom } from '../canvas/viewport.js';

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
const DRAG_THRESHOLD_PX = 3;

const OPERATORS: ConditionalOperator[] = ['>', '==', '!='];

function ConditionalNodeViewImpl({ id }: Props): JSX.Element | null {
  const node = useModelStore((s) => s.model.nodes[id]);
  const trueValid = useModelStore((s) => isOutputValid(s.executionState, id, 0));
  const falseValid = useModelStore((s) => isOutputValid(s.executionState, id, 1));
  const updateNode = useModelStore((s) => s.updateNode);
  const addEdge = useModelStore((s) => s.addEdge);
  const selection = useUIStore((s) => s.selection);
  const selectNode = useUIStore((s) => s.selectNode);
  const startEdgeDraft = useUIStore((s) => s.startEdgeDraft);
  const endEdgeDraft = useUIStore((s) => s.endEdgeDraft);

  const outerGRef = useRef<SVGGElement | null>(null);
  useEffect(() => {
    const el = outerGRef.current;
    if (!el) return undefined;
    return registerNodeEl(id, el);
  }, [id]);

  const pos = node?.position ?? { x: 200, y: 200 };
  const layout = getConditionalNodeLayout();
  const { halfW, halfH } = layout;

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
  } | null>(null);

  const onBodyPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
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
        zoom: getCurrentZoom(),
        incidents: getIncidentEdgeHandles(id),
      };
    },
    [id, pos.x, pos.y, selectNode],
  );

  const onBodyPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      if (!m) return;
      const dxClient = e.clientX - m.startClientX;
      const dyClient = e.clientY - m.startClientY;
      if (!m.dragged) {
        if (Math.hypot(dxClient, dyClient) < DRAG_THRESHOLD_PX) return;
        m.dragged = true;
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

  const onBodyPointerUp = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      moveRef.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (m?.dragged && (m.lastDx !== 0 || m.lastDy !== 0)) {
        updateNode(
          id,
          { position: { x: m.startPosX + m.lastDx, y: m.startPosY + m.lastDy } },
          'move-node',
          '위치 이동',
        );
      }
    },
    [id, updateNode],
  );

  const handleDragRef = useRef<{ dragged: boolean } | null>(null);

  const makeOutputHandlers = useCallback(
    (slotIndex: 0 | 1, valid: boolean) => ({
      onPointerDown: (e: React.PointerEvent<SVGCircleElement>) => {
        if (!node || !valid) return;
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        const lag: 0 | 1 = e.altKey ? 1 : 0;
        const startPoint = { x: pos.x, y: pos.y };
        startEdgeDraft(id, startPoint, startPoint, lag);
        handleDragRef.current = { dragged: false };
        // pointerdown 시점의 슬롯을 ref에 저장하기 위해 클로저 캡쳐만으로 충분.
        (handleDragRef.current as { dragged: boolean; sourceSlot?: number }).sourceSlot =
          slotIndex;
      },
      onPointerMove: () => {
        if (!handleDragRef.current) return;
        handleDragRef.current.dragged = true;
      },
      onPointerUp: (e: React.PointerEvent<SVGCircleElement>) => {
        (e.target as Element).releasePointerCapture?.(e.pointerId);
        const captured = handleDragRef.current as
          | { dragged: boolean; sourceSlot?: number }
          | null;
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

  // pointerdown을 자체적으로 stop해서 body rect의 drag 핸들러로 흘러가지 않게.
  // 이렇게 하지 않으면 body가 pointer capture를 가져가 click 합성이 막혀
  // onClick이 영원히 발화하지 않는다.
  const onOperatorPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      e.stopPropagation();
    },
    [],
  );

  const onOperatorClick = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      e.stopPropagation();
      if (!node || !isConditionalNode(node)) return;
      const idx = OPERATORS.indexOf(node.operator);
      const next = OPERATORS[(idx + 1) % OPERATORS.length]!;
      updateNode(id, { operator: next }, 'update-node', '연산자 변경');
    },
    [id, node, updateNode],
  );

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
    <g
      ref={outerGRef}
      className={`trama-node trama-conditional-node ${isActive ? '' : 'is-invalid'}`}
      data-trama-node-id={id}
      transform={`translate(${pos.x} ${pos.y})`}
    >
      <g className="trama-node-inner">
        <rect
          className={`trama-node-body trama-function-body ${stateClass}${isSelected ? ' is-selected' : ''}`}
          x={-halfW}
          y={-halfH}
          width={CARD_W}
          height={CARD_H}
          rx={CARD_CORNER}
          ry={CARD_CORNER}
          onPointerDown={onBodyPointerDown}
          onPointerMove={onBodyPointerMove}
          onPointerUp={onBodyPointerUp}
        />

        {/* 중앙: A {op} B — operator 클릭 시 순환.
            텍스트 자체는 pointer-events:none(공용 .trama-function-symbol)이라
            클릭이 통과한다. 그래서 투명 hit-rect를 깔고 그 위에서 pointerdown을
            stop해 body drag 핸들러가 캡처를 가져가지 못하게 한다. */}
        <g onClick={onOperatorClick}>
          <rect
            className="trama-conditional-operator-hit"
            x={-56}
            y={-22}
            width={112}
            height={44}
            rx={6}
            ry={6}
            onPointerDown={onOperatorPointerDown}
          />
          <text
            className="trama-function-symbol"
            x={0}
            y={4}
            textAnchor="middle"
            pointerEvents="none"
          >
            {`A ${node.operator} B`}
          </text>
        </g>
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
              pointerEvents="none"
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
                pointerEvents="none"
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
      </g>
    </g>
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
