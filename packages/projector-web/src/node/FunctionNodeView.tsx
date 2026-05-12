import { memo, useCallback, useEffect, useRef } from 'react';
import { tokens } from '@trama/tokens';
import {
  getFunctionSlotOccupancy,
  isFunctionNode,
  isNodeValid,
  isValueNode,
  type NodeId,
} from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { functionRegistry } from '../store/registries.js';
import { getFunctionNodeLayout, type FunctionPinLayout } from './function-box.js';
import {
  getIncidentEdgeHandles,
  registerNodeEl,
  type EdgeHandle,
} from '../canvas/drag-registry.js';

interface Props {
  id: NodeId;
}

const PIN_RADIUS = parseFloat(tokens.spacing.pinRadius);
const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const SOCKET_DOT_SIZE = parseFloat(tokens.spacing.socketDotSize);
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);
const DRAG_THRESHOLD_PX = 3;

function FunctionNodeViewImpl({ id }: Props): JSX.Element | null {
  const node = useModelStore((s) => s.model.nodes[id]);
  const isValid = useModelStore((s) => isNodeValid(s.executionState, id));
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
    [id, pos.x, pos.y, selectNode],
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

  const onSocketPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (!node || !isValid) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      const startPoint = { x: pos.x, y: pos.y };
      startEdgeDraft(id, startPoint, startPoint, lag);
      handleDragRef.current = { dragged: false };
    },
    [id, isValid, node, pos.x, pos.y, startEdgeDraft],
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
        }
        const created = addEdge({
          from: id,
          to: targetId,
          shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
          lag,
          slotIndex,
        });
        // 함수 → 값 노드: 대상의 단위를 'raw'(suffix 없음, 넓은 범위)로 자동
        // 변경. 함수가 산출한 값에 cm/kg 같은 임의의 단위를 강제하면 clamp 때문에
        // 잘못된 값으로 보임. 정밀한 단위 추론은 추후 과제.
        if (created && targetNode && isValueNode(targetNode) && targetNode.unitId !== 'raw') {
          updateNode(
            targetId,
            { unitId: 'raw', unitOverride: undefined },
            'update-node',
            '단위 자동 설정',
          );
        }
      }
      endEdgeDraft();
    },
    [addEdge, endEdgeDraft, id, updateNode],
  );

  if (!node || !isFunctionNode(node)) return null;
  const def = functionRegistry.get(node.functionKey);
  if (!def) return null;

  const layout = getFunctionNodeLayout(def.slots.length);
  const { halfW, halfH, width, height, symbolY, labelY } = layout;
  const isSelected = selection.kind === 'node' && selection.id === id;
  const stateClass = isValid ? 'is-calm' : 'is-low';

  return (
    <g
      ref={outerGRef}
      className={`trama-node trama-function-node ${isValid ? '' : 'is-invalid'}`}
      data-trama-node-id={id}
      transform={`translate(${pos.x} ${pos.y})`}
    >
      <g className="trama-node-inner">
        <rect
          className={`trama-node-body trama-function-body ${stateClass}${isSelected ? ' is-selected' : ''}`}
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
        <text
          className="trama-function-symbol"
          x={0}
          y={symbolY}
          textAnchor="middle"
        >
          {def.symbol}
        </text>
        <text
          className="trama-function-label"
          x={0}
          y={labelY}
          textAnchor="middle"
        >
          {node.label || def.labels.ko}
        </text>

        {/* 좌측 핀 (입력 슬롯) — slotIndex 0..arity-1.
            각 슬롯에 hit 영역을 둬서 엣지 드롭 시 정확한 슬롯을 식별. */}
        <PinShape pin={layout.leftPin} stateClass={stateClass} />
        {layout.leftPin.sockets.map((s) => (
          <g key={`in${s.slotIndex}`}>
            <SocketVisual cx={s.x} cy={s.y} stateClass={stateClass} />
            <circle
              className="trama-node-socket-hit"
              data-trama-slot-index={s.slotIndex}
              cx={s.x}
              cy={s.y}
              r={Math.max(SOCKET_SIZE, 12)}
            />
          </g>
        ))}

        {/* 우측 핀 (출력) — valid일 때만 보임 */}
        {isValid && (
          <>
            <PinShape pin={layout.rightPin} stateClass={stateClass} />
            <SocketVisual
              cx={layout.rightPin.sockets[0]!.x}
              cy={layout.rightPin.sockets[0]!.y}
              stateClass={stateClass}
            />
            <circle
              className="trama-node-socket-hit"
              cx={layout.rightPin.sockets[0]!.x}
              cy={layout.rightPin.sockets[0]!.y}
              r={Math.max(SOCKET_SIZE, 12)}
              onPointerDown={onSocketPointerDown}
              onPointerMove={onSocketPointerMove}
              onPointerUp={onSocketPointerUp}
            />
          </>
        )}
      </g>
    </g>
  );
}

export const FunctionNodeView = memo(FunctionNodeViewImpl);

function PinShape({
  pin,
  stateClass,
}: {
  pin: FunctionPinLayout;
  stateClass: string;
}): JSX.Element {
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
