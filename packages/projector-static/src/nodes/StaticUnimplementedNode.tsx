import { tokens } from '@trama/tokens';
import type { StaticNodeRendererProps } from '../registry.js';

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

/**
 * P4-a 단계의 자리표 — value/constant 외 노드 종류는 라벨 + kind 만 표시한
 * 빈 카드로 그린다. P4-b, P4-c 에서 각 kind 별 정식 컴포넌트로 교체.
 */
export function StaticUnimplementedNode({
  node,
  layout,
}: StaticNodeRendererProps): JSX.Element {
  const pos = node.position ?? { x: 0, y: 0 };
  const stateClass = 'is-calm';
  const label = (node as { label?: string }).label ?? node.kind;

  return (
    <g
      className="trama-static-node trama-static-unimplemented"
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
        {label}
      </text>
      <text
        className="trama-static-node-value"
        x={layout.panelCx}
        y={layout.panelCy + 4}
        textAnchor="middle"
        dominantBaseline="central"
        opacity={0.5}
      >
        [{node.kind}]
      </text>
    </g>
  );
}
