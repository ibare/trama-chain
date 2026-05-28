import { tokens } from '@trama-chain/tokens';
import { isLogicGateNode, type LogicGateOperator } from '@trama-chain/core';
import type { StaticNodeRendererProps } from '../registry.js';
import { getCapturedBoolean, isSlotValid } from '../snapshot.js';
import { PinShape, SocketVisual } from './primitives.js';

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

const OPERATOR_LABEL: Record<LogicGateOperator, string> = {
  and: 'AND',
  or: 'OR',
  xor: 'XOR',
  not: 'NOT',
};

/**
 * LogicGate 의 정적 시각. operator 텍스트(라벨 슬롯) + 본문 ●/○ 결과. invalid 면
 * 결과 아이콘은 그리지 않고 카드만 흐림 상태로 표시.
 */
export function StaticLogicGateNode({
  node,
  layout,
  snapshot,
  slotIndex,
}: StaticNodeRendererProps): JSX.Element | null {
  if (!isLogicGateNode(node)) return null;
  const pos = node.position ?? { x: 0, y: 0 };
  const valid = isSlotValid(slotIndex, node.id);
  const value = valid ? getCapturedBoolean(snapshot.values[node.id]) : null;
  const stateClass = !valid ? 'is-low' : value ? 'is-focal' : 'is-calm';

  return (
    <g
      className={`trama-static-node trama-static-logic-gate ${valid ? '' : 'is-invalid'}`}
      transform={`translate(${pos.x} ${pos.y})`}
    >
      <rect
        className={`trama-static-node-body ${stateClass}`}
        x={layout.panelCx - layout.panelWidth / 2}
        y={layout.panelCy - layout.panelHeight / 2}
        width={layout.panelWidth}
        height={layout.panelHeight}
        rx={CARD_CORNER}
        ry={CARD_CORNER}
      />
      <text
        className="trama-static-logic-gate-operator"
        x={layout.panelCx}
        y={layout.labelY}
        textAnchor="middle"
      >
        {OPERATOR_LABEL[node.operator]}
      </text>
      {valid && value !== null && (
        <text
          className="trama-static-node-value"
          x={layout.panelCx}
          y={layout.panelCy}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {value ? '●' : '○'}
        </text>
      )}
      <PinShape pin={layout.leftPin} stateClass={stateClass} />
      {layout.leftPin.sockets.map((s, i) => (
        <SocketVisual key={`l${i}`} cx={s.x} cy={s.y} stateClass={stateClass} />
      ))}
      <PinShape pin={layout.rightPin} stateClass={stateClass} />
      {layout.rightPin.sockets[0] && (
        <SocketVisual
          cx={layout.rightPin.sockets[0].x}
          cy={layout.rightPin.sockets[0].y}
          stateClass={stateClass}
        />
      )}
    </g>
  );
}
