import { tokens } from '@trama-chain/tokens';
import {
  defaultUnitCatalog,
  isNumericValue,
  isValueNode,
  resolveUnit,
  type ResolvedUnit,
  type UnitOverride,
} from '@trama-chain/core';
import type { StaticNodeRendererProps } from '../registry.js';
import { formatNodeValue } from '../format.js';
import { getCapturedBoolean, getCapturedNumeric, isSlotValid } from '../snapshot.js';
import { PinShape, SocketVisual } from './primitives.js';

const FREE_FALLBACK: ResolvedUnit = {
  id: 'free',
  kind: 'free',
  suffix: '',
  labels: [],
  min: 0,
  max: 1,
  step: 0.01,
};

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

function resolveValueNodeUnit(
  unitId: string,
  override: UnitOverride | undefined,
): ResolvedUnit {
  const def = defaultUnitCatalog.get(unitId);
  if (!def) return FREE_FALLBACK;
  return resolveUnit(def, override);
}

/**
 * Value 노드의 정적 시각. skin 이 켜진 경우는 P4-c 에서 별도 분기로 옮기고,
 * 여기서는 sklin 없는 카드 폼만 그린다. boolean 값은 ●/○ 으로 표시.
 */
export function StaticValueNode({
  node,
  layout,
  snapshot,
  slotIndex,
  registries,
}: StaticNodeRendererProps): JSX.Element | null {
  if (!isValueNode(node)) return null;
  const pos = node.position ?? { x: 0, y: 0 };
  const stateClass = node.isFocal ? 'is-focal' : 'is-calm';
  const valid = isSlotValid(slotIndex, node.id);

  const captured = snapshot.values[node.id];
  const initial = node.initialValue;

  const isBoolean = initial.kind === 'boolean';
  const numericValue = !isBoolean
    ? (getCapturedNumeric(captured) ?? (isNumericValue(initial) ? initial.n : 0))
    : 0;
  const booleanValue = isBoolean
    ? (getCapturedBoolean(captured) ?? (initial.kind === 'boolean' ? initial.b : false))
    : false;

  const unit =
    isNumericValue(initial)
      ? resolveValueNodeUnit(initial.unitId, node.unitOverride)
      : FREE_FALLBACK;
  const formatted = isBoolean
    ? { primary: booleanValue ? '●' : '○', accessory: '' }
    : formatNodeValue(numericValue, unit);

  const combiner = registries.combiners.get(node.combiner);
  const combinerLabel = combiner?.labels.ko ?? node.combiner;

  return (
    <g
      className={`trama-static-node trama-static-value-node ${valid ? '' : 'is-invalid'}`}
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
        y={layout.valueY}
        textAnchor={layout.labelAnchor}
        dominantBaseline="central"
      >
        {formatted.primary}
        {formatted.accessory && (
          <tspan className="trama-static-node-unit" dx="6">
            {formatted.accessory}
          </tspan>
        )}
      </text>
      {layout.hasCombiner && layout.combinerCenterY !== null && (
        <CombinerChip symbol={combinerSymbol(node.combiner)} label={combinerLabel} cy={layout.combinerCenterY} />
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

function combinerSymbol(key: string): string {
  switch (key) {
    case 'sum':
      return '+';
    case 'product':
      return '×';
    case 'average':
      return 'Ø';
    case 'max':
      return '↑';
    default:
      return '·';
  }
}

function CombinerChip({
  symbol,
  label,
  cy,
}: {
  symbol: string;
  label: string;
  cy: number;
}): JSX.Element {
  const text = `${symbol} ${label}`;
  const paddingX = parseFloat(tokens.spacing.combinerPaddingX);
  const fontSize = parseFloat(tokens.typography.textNodeUnit) * 16;
  const approxCharW = fontSize * 0.55;
  const innerW = text.length * approxCharW;
  const w = innerW + paddingX * 2;
  const h = parseFloat(tokens.spacing.combinerPaddingY) * 2 + fontSize + 2;
  const radius = Math.min(parseFloat(tokens.spacing.radiusCombiner), h / 2);
  return (
    <g>
      <rect
        className="trama-static-node-combiner"
        x={-w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
      />
      <text
        className="trama-static-node-combiner-text"
        x={0}
        y={cy + fontSize / 3}
        textAnchor="middle"
      >
        {text}
      </text>
    </g>
  );
}
