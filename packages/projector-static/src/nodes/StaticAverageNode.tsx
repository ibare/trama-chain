import { tokens } from '@trama-chain/tokens';
import { isAverageNode } from '@trama-chain/core';
import type { StaticNodeRendererProps } from '../registry.js';
import { getCapturedNumeric, isSlotValid } from '../snapshot.js';
import { PinShape, SocketVisual } from './primitives.js';

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

function formatAverage(v: number): string {
  if (!Number.isFinite(v)) return '·';
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  if (abs >= 1_000_000 || (abs > 0 && abs < 0.001)) return v.toExponential(2);
  return v.toFixed(3);
}

/**
 * Average 의 정적 시각. 라벨 + 평균값 1줄. 단위는 source ObserveNode 가 가지며
 * 정적 출력은 그 단위 시각을 따라가지 않고 raw 숫자만 표시 — 출력 자체는 raw('free').
 */
export function StaticAverageNode({
  node,
  layout,
  snapshot,
  slotIndex,
}: StaticNodeRendererProps): JSX.Element | null {
  if (!isAverageNode(node)) return null;
  const pos = node.position ?? { x: 0, y: 0 };
  const valid = isSlotValid(slotIndex, node.id);
  const stateClass = valid ? (node.isFocal ? 'is-focal' : 'is-calm') : 'is-low';

  const numeric = getCapturedNumeric(snapshot.values[node.id]);
  const valueText = valid && numeric !== null ? formatAverage(numeric) : '—';

  return (
    <g
      className={`trama-static-node trama-static-average-node ${valid ? '' : 'is-invalid'}`}
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
        x={layout.panelCx}
        y={layout.labelY}
        textAnchor="middle"
      >
        {node.label || '평균'}
      </text>
      <text
        className="trama-static-node-value"
        x={layout.panelCx}
        y={layout.valueY}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {valueText}
      </text>
      <PinShape pin={layout.leftPin} stateClass={stateClass} />
      {layout.leftPin.sockets[0] && (
        <SocketVisual
          cx={layout.leftPin.sockets[0].x}
          cy={layout.leftPin.sockets[0].y}
          stateClass={stateClass}
        />
      )}
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
