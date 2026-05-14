import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import {
  isConditionalNode,
  isOutputValid,
  type ConditionalOperator,
  type NodeId,
} from '@trama/core';
import { useTrama } from '../store/index.js';
import {
  CONDITIONAL_CARD_H,
  CONDITIONAL_CARD_W,
  getConditionalNodeLayout,
} from './conditional-box.js';
import { NodeFrame } from './NodeFrame.js';
import { InteractiveArea } from './InteractiveArea.js';
import { Socket } from './Socket.js';
import { useInputConnectionMask, useOutputConnected } from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';
import { slotColor } from './slot-palette.js';

interface Props {
  id: NodeId;
}

const CARD_W = CONDITIONAL_CARD_W;
const CARD_H = CONDITIONAL_CARD_H;
const SLOT_LABEL_INSET = 20;
const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

const OPERATORS: ConditionalOperator[] = ['>', '==', '!='];

function ConditionalNodeViewImpl({ id }: Props): JSX.Element | null {
  const { modelStore, uiStore, socketRegistry } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  const trueValid = modelStore((s) => isOutputValid(s.executionState, id, 0));
  const falseValid = modelStore((s) => isOutputValid(s.executionState, id, 1));
  const updateNode = modelStore((s) => s.updateNode);
  const selection = uiStore((s) => s.selection);
  const inputMask = useInputConnectionMask(id);
  const outTrueConnected = useOutputConnected(id, 0);
  const outFalseConnected = useOutputConnected(id, 1);

  const pos = node?.position ?? { x: 200, y: 200 };
  const layout = getConditionalNodeLayout();
  const { halfW, halfH } = layout;

  // 입력 슬롯 등록 — snap 후보가 된다. (A=0, B=1)
  useEffect(() => {
    const unA = socketRegistry.register({
      nodeId: id,
      slotIndex: 0,
      offset: { x: layout.inputSockets[0]!.x, y: layout.inputSockets[0]!.y },
    });
    const unB = socketRegistry.register({
      nodeId: id,
      slotIndex: 1,
      offset: { x: layout.inputSockets[1]!.x, y: layout.inputSockets[1]!.y },
    });
    return () => {
      unA();
      unB();
    };
  }, [id, layout.inputSockets, socketRegistry]);

  const getTrueStartPoint = useCallback(
    () => ({
      x: pos.x + layout.outputSockets[0]!.x,
      y: pos.y + layout.outputSockets[0]!.y,
    }),
    [layout.outputSockets, pos.x, pos.y],
  );
  const getFalseStartPoint = useCallback(
    () => ({
      x: pos.x + layout.outputSockets[1]!.x,
      y: pos.y + layout.outputSockets[1]!.y,
    }),
    [layout.outputSockets, pos.x, pos.y],
  );
  const trueHandlers = useEdgeDraftSource(id, {
    enabled: !!node && trueValid,
    getStartPoint: getTrueStartPoint,
    sourceSlotIndex: 0,
  });
  const falseHandlers = useEdgeDraftSource(id, {
    enabled: !!node && falseValid,
    getStartPoint: getFalseStartPoint,
    sourceSlotIndex: 1,
  });

  const onOperatorClick = useCallback(() => {
    if (uiStore.getState().readOnly) return;
    if (!node || !isConditionalNode(node)) return;
    const idx = OPERATORS.indexOf(node.operator);
    const next = OPERATORS[(idx + 1) % OPERATORS.length]!;
    updateNode(id, { operator: next });
  }, [id, node, uiStore, updateNode]);

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
      {inputSlots.map((s) => {
        const color = slotColor(s.slot, inputSlots.length);
        return (
          <g key={`in${s.slot}`}>
            <text
              className="trama-conditional-slot-label"
              x={s.x + SLOT_LABEL_INSET}
              y={s.y + 4}
              textAnchor="start"
              style={color ? { fill: color } : undefined}
            >
              {s.label}
            </text>
            <Socket
              cx={s.x}
              cy={s.y}
              connected={(inputMask & (1 << s.slot)) !== 0}
              color={color}
            />
            <circle
              className="trama-node-socket-hit"
              data-trama-slot-index={s.slot}
              cx={s.x}
              cy={s.y}
              r={Math.max(SOCKET_SIZE, 12)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </g>
        );
      })}

      {/* 출력 슬롯 (TR=참, BR=거짓) — 두 슬롯 모두 항상 노출, valid 여부는 상태 클래스로. */}
      {outputSlots.map((s) => {
        const handlers = s.slot === 0 ? trueHandlers : falseHandlers;
        const slotConnected = s.slot === 0 ? outTrueConnected : outFalseConnected;
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
            <Socket cx={s.x} cy={s.y} connected={slotConnected} />
            <circle
              className="trama-node-socket-hit"
              cx={s.x}
              cy={s.y}
              r={Math.max(SOCKET_SIZE, 12)}
              onPointerDown={handlers.onPointerDown}
              onPointerUp={handlers.onPointerUp}
            />
          </g>
        );
      })}
    </NodeFrame>
  );
}

export const ConditionalNodeView = memo(ConditionalNodeViewImpl);

