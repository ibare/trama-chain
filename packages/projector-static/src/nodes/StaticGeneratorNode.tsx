import { tokens } from '@trama-chain/tokens';
import { isGeneratorNode } from '@trama-chain/core';
import type { StaticNodeRendererProps } from '../registry.js';
import { getCapturedNumeric, isSlotValid } from '../snapshot.js';
import { PinShape, SocketVisual } from './primitives.js';

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

function formatGeneratorValue(v: number): string {
  if (!Number.isFinite(v)) return '·';
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  if (abs >= 1_000_000 || (abs > 0 && abs < 0.001)) return v.toExponential(2);
  if (abs >= 100) return v.toFixed(1);
  return v.toFixed(3);
}

/**
 * Generator 의 정적 시각. paradigm key(상단) + 라벨 + 현재값. paradigm 별 knob
 * 본문은 정적 출력에서 생략 — 측정 시점의 단일 numeric scalar 만 표시.
 */
export function StaticGeneratorNode({
  node,
  layout,
  snapshot,
  slotIndex,
}: StaticNodeRendererProps): JSX.Element | null {
  if (!isGeneratorNode(node)) return null;
  const pos = node.position ?? { x: 0, y: 0 };
  const valid = isSlotValid(slotIndex, node.id);
  const stateClass = valid ? (node.isFocal ? 'is-focal' : 'is-calm') : 'is-low';

  const numeric = getCapturedNumeric(snapshot.values[node.id]);
  const valueText = valid && numeric !== null ? formatGeneratorValue(numeric) : '—';

  return (
    <g
      className={`trama-static-node trama-static-generator-node ${valid ? '' : 'is-invalid'}`}
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
        className="trama-static-generator-paradigm"
        x={layout.panelCx - layout.panelWidth / 2 + 8}
        y={layout.panelCy - layout.panelHeight / 2 + 14}
        textAnchor="start"
      >
        {node.params.kind}
      </text>
      <text
        className="trama-static-node-label"
        x={layout.panelCx}
        y={layout.labelY}
        textAnchor="middle"
      >
        {node.label}
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
