import { tokens } from '@trama-chain/tokens';
import {
  defaultUnitCatalog,
  isStockNode,
  resolveUnit,
  type ResolvedUnit,
} from '@trama-chain/core';
import type { StaticNodeRendererProps } from '../registry.js';
import { getCapturedNumeric, isSlotValid } from '../snapshot.js';
import { PinShape, SocketVisual } from './primitives.js';
import { sparklinePath } from '../sparkline.js';

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

const FREE_FALLBACK: ResolvedUnit = {
  id: 'free',
  kind: 'free',
  suffix: '',
  labels: [],
  min: 0,
  max: 1,
  step: 0.01,
};

function formatLevel(v: number, unit: ResolvedUnit): { primary: string; accessory: string } {
  if (!Number.isFinite(v)) return { primary: '·', accessory: '' };
  const abs = Math.abs(v);
  const primary =
    Number.isInteger(v)
      ? String(v)
      : abs >= 1_000_000
        ? v.toExponential(2)
        : abs >= 100
          ? v.toFixed(1)
          : v.toFixed(2);
  const suffix = unit.kind === 'number' ? unit.suffix : '';
  return { primary, accessory: suffix };
}

/**
 * Stock 의 정적 시각. 라벨 + level (slot 0 numeric + unit suffix) + rate sparkline
 * (snapshot.stockWindows[id].window). 좌측 2 (inflow/outflow), 우측 3 (level/overflow/rate).
 * level 슬롯 유효성으로 카드 흐림 처리.
 */
export function StaticStockNode({
  node,
  layout,
  snapshot,
  slotIndex,
}: StaticNodeRendererProps): JSX.Element | null {
  if (!isStockNode(node)) return null;
  const pos = node.position ?? { x: 0, y: 0 };
  const valid0 = isSlotValid(slotIndex, node.id, 0);
  const valid1 = isSlotValid(slotIndex, node.id, 1);
  const valid2 = isSlotValid(slotIndex, node.id, 2);
  const isActive = valid0 || valid1 || valid2;
  const stateClass = isActive ? (node.isFocal ? 'is-focal' : 'is-calm') : 'is-low';

  const unitDef = defaultUnitCatalog.get(node.unitId);
  const unit = unitDef ? resolveUnit(unitDef, node.unitOverride) : FREE_FALLBACK;
  const level = getCapturedNumeric(snapshot.values[node.id]) ?? node.initialLevel;
  const formatted = formatLevel(level, unit);

  const window = snapshot.stockWindows[node.id]?.window ?? [];
  const halfW = layout.panelWidth / 2;
  const halfH = layout.panelHeight / 2;
  const sparkBox = {
    x: layout.panelCx - halfW + 16,
    y: layout.panelCy + halfH - 28,
    w: layout.panelWidth - 32,
    h: 18,
  };
  const ratePath = sparklinePath(window, sparkBox, (s) => s.delta);

  return (
    <g
      className={`trama-static-node trama-static-stock-node ${isActive ? '' : 'is-invalid'}`}
      transform={`translate(${pos.x} ${pos.y})`}
    >
      <rect
        className={`trama-static-node-body ${stateClass}`}
        x={layout.panelCx - halfW}
        y={layout.panelCy - halfH}
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
        {node.label || '탱크'}
      </text>
      <text
        className="trama-static-node-value"
        x={layout.panelCx}
        y={layout.valueY}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {formatted.primary}
        {formatted.accessory && (
          <tspan className="trama-static-node-unit" dx="6">
            {formatted.accessory}
          </tspan>
        )}
      </text>
      {ratePath && (
        <path
          className="trama-static-stock-rate"
          d={ratePath}
          fill="none"
        />
      )}
      <PinShape pin={layout.leftPin} stateClass={stateClass} />
      {layout.leftPin.sockets.map((s, i) => (
        <SocketVisual key={`l${i}`} cx={s.x} cy={s.y} stateClass={stateClass} />
      ))}
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
      {layout.rightPin.sockets[2] && (
        <g className={valid2 ? '' : 'is-inactive-output'}>
          <SocketVisual
            cx={layout.rightPin.sockets[2].x}
            cy={layout.rightPin.sockets[2].y}
            stateClass={stateClass}
          />
        </g>
      )}
    </g>
  );
}
