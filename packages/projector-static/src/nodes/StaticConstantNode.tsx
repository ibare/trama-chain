import { tokens } from '@trama-chain/tokens';
import { isConstantNode, isNumericValue } from '@trama-chain/core';
import type { StaticNodeRendererProps } from '../registry.js';
import { getCapturedBoolean, getCapturedNumeric } from '../snapshot.js';
import { PinShape, SocketVisual } from './primitives.js';

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

function formatConstantValue(v: number): string {
  if (!Number.isFinite(v)) return '·';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return v.toExponential(3);
  if (abs >= 100) return v.toFixed(2);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(4);
}

/**
 * Constant 노드의 정적 시각. 라벨 + 값 한 줄 — 입력 슬롯 없음, 출력 1개. boolean
 * constant 는 ●/○ 으로 표시.
 */
export function StaticConstantNode({
  node,
  layout,
  snapshot,
}: StaticNodeRendererProps): JSX.Element | null {
  if (!isConstantNode(node)) return null;
  const pos = node.position ?? { x: 0, y: 0 };
  const stateClass = node.isFocal ? 'is-focal' : 'is-calm';

  const captured = snapshot.values[node.id];
  const initial = node.value;
  const isBoolean = initial.kind === 'boolean';
  const numericValue = !isBoolean
    ? (getCapturedNumeric(captured) ?? (isNumericValue(initial) ? initial.n : 0))
    : 0;
  const booleanValue = isBoolean
    ? (getCapturedBoolean(captured) ?? (initial.kind === 'boolean' ? initial.b : false))
    : false;

  const valueText = isBoolean
    ? booleanValue ? '●' : '○'
    : formatConstantValue(numericValue);

  return (
    <g
      className="trama-static-node trama-static-constant-node"
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
        className="trama-static-node-label"
        x={layout.labelAnchor === 'middle' ? layout.panelCx : layout.textX}
        y={layout.labelY}
        textAnchor={layout.labelAnchor}
      >
        {node.label}
      </text>
      <text
        className="trama-static-node-value"
        x={layout.labelAnchor === 'middle' ? layout.panelCx : layout.textX}
        y={layout.panelCy}
        textAnchor={layout.labelAnchor}
        dominantBaseline="central"
      >
        {valueText}
      </text>
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
