import { tokens } from '@trama/tokens';
import { isObserveNode, isNumericValue } from '@trama/core';
import type { StaticNodeRendererProps } from '../registry.js';
import { isSlotValid } from '../snapshot.js';
import { PinShape, SocketVisual } from './primitives.js';
import { sparklinePath } from '../sparkline.js';

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

/**
 * Observe 의 정적 시각. paradigm 별 시각화 분기는 PoC 정적 출력에서는 생략 —
 * snapshot.observeSeries[id] 의 numeric sample 시계열을 단일 sparkline 으로 그린다.
 * 슬롯 2 개 (slot 0 passthrough, slot 1 누적 추출). passthrough 만 유효성 표시.
 */
export function StaticObserveNode({
  node,
  layout,
  snapshot,
  slotIndex,
}: StaticNodeRendererProps): JSX.Element | null {
  if (!isObserveNode(node)) return null;
  const pos = node.position ?? { x: 0, y: 0 };
  const valid0 = isSlotValid(slotIndex, node.id, 0);
  const valid1 = isSlotValid(slotIndex, node.id, 1);
  const isActive = valid0 || valid1;
  const stateClass = isActive ? (node.isFocal ? 'is-focal' : 'is-calm') : 'is-low';

  const body = layout.observeBody;
  const series = snapshot.observeSeries[node.id] ?? [];
  const numericSeries = series
    .filter((s) => isNumericValue(s.value))
    .map((s) => ({ t: s.t, n: (s.value as { kind: 'numeric'; n: number }).n }));
  const path = body
    ? sparklinePath(numericSeries, body, (s) => s.n)
    : '';

  return (
    <g
      className={`trama-static-node trama-static-observe-node ${isActive ? '' : 'is-invalid'}`}
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
        {node.label || '관측'}
      </text>
      {body && path && (
        <path
          className="trama-static-observe-sparkline"
          d={path}
          fill="none"
        />
      )}
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
        <g className={valid0 ? '' : 'is-inactive-output'}>
          <SocketVisual
            cx={layout.rightPin.sockets[0].x}
            cy={layout.rightPin.sockets[0].y}
            stateClass={stateClass}
          />
        </g>
      )}
      {layout.rightPin.sockets[1] && (
        <g className={valid1 ? '' : 'is-inactive-output'}>
          <SocketVisual
            cx={layout.rightPin.sockets[1].x}
            cy={layout.rightPin.sockets[1].y}
            stateClass={stateClass}
          />
        </g>
      )}
    </g>
  );
}
