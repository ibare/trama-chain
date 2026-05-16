import { memo } from 'react';
import { tokens } from '@trama/tokens';
import type { ValueNode, ResolvedUnit } from '@trama/core';
import { combinerRegistry } from '../store/registries.js';
import { formatNodeValue } from '../util/format.js';
import { NodeBody } from './NodeBody.js';
import { NodeLabel } from './NodeLabel.js';
import { InteractiveArea } from './InteractiveArea.js';
import type { NodeLayout } from './box.js';

interface Props {
  node: ValueNode;
  layout: NodeLayout;
  isSelected: boolean;
  isEditing: boolean;
  stateClass: string;
  currentValue: number;
  unit: ResolvedUnit;
  onCommitLabel: (next: string) => void;
  onCancelLabel: () => void;
  onValueAreaClick: () => void;
}

/**
 * 스킨이 없는 표준 카드 모드의 콘텐츠.
 *
 * NodeBody + 라벨 + 값/단위 + combiner 칩을 묶어 그린다. 좌·우 소켓 같은
 * 노드-스코프 공통 요소는 부모 ValueNodeView가 직접 그리므로 여기엔 포함되지 않는다.
 *
 * 카드 모드와 스킨 모드를 파일 수준에서 분리한 이유 — 한 모드의 시각/인터랙션
 * 변경이 다른 모드 코드 경로에 stale dependency로 새지 않도록 격리하기 위함.
 */
function ValueNodeCardImpl({
  node,
  layout,
  isSelected,
  isEditing,
  stateClass,
  currentValue,
  unit,
  onCommitLabel,
  onCancelLabel,
  onValueAreaClick,
}: Props): JSX.Element {
  const { halfW, width } = layout;
  const formatted = formatNodeValue(currentValue, unit);
  const combiner = combinerRegistry.get(node.combiner);
  const combinerLabel = combiner?.labels.ko ?? node.combiner;
  const combinerSym = combinerSymbol(node.combiner);

  return (
    <>
      <NodeBody
        width={layout.panelWidth}
        height={layout.panelHeight}
        cx={layout.panelCx}
        cy={layout.panelCy}
        stateClass={stateClass}
        isSelected={isSelected}
      />
      <NodeLabel
        text={node.label}
        x={layout.textX}
        y={layout.labelY}
        width={width - (layout.textX - -halfW) * 2}
        textAnchor={layout.labelAnchor}
        isEditing={isEditing}
        onCommit={onCommitLabel}
        onCancel={onCancelLabel}
      />

      <text
        className="trama-node-value"
        x={layout.textX}
        y={layout.valueY}
        textAnchor="start"
      >
        {formatted.primary}
        {formatted.accessory && (
          <tspan className="trama-node-unit" dx="6">
            {formatted.accessory}
          </tspan>
        )}
      </text>
      <InteractiveArea
        x={layout.textX}
        y={layout.valueY - 32}
        width={width - 36}
        height={44}
        hitClassName="trama-node-value-hit"
        onClick={onValueAreaClick}
      />

      {layout.hasCombiner && layout.combinerCenterY !== null && (
        <CombinerChip
          symbol={combinerSym}
          label={combinerLabel}
          cy={layout.combinerCenterY}
        />
      )}
    </>
  );
}

export const ValueNodeCard = memo(ValueNodeCardImpl);

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
    <g pointerEvents="none">
      <rect
        className="trama-node-combiner"
        x={-w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
      />
      <text className="trama-node-combiner-text" x={0} y={cy + fontSize / 3} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}
