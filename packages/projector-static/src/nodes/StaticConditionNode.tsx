import { tokens } from '@trama-chain/tokens';
import {
  defaultUnitCatalog,
  isConditionNode,
  isConstantNode,
  isNumericValue,
  isValueNode,
  resolveUnit,
  type ConditionOperator,
  type Model,
  type Node,
} from '@trama-chain/core';
import type { StaticNodeRendererProps } from '../registry.js';
import { isSlotValid } from '../snapshot.js';
import { PinShape, SocketVisual } from './primitives.js';

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

const OPERATOR_GLYPH: Record<ConditionOperator, string> = {
  '>': '>',
  '<': '<',
  '>=': '≥',
  '<=': '≤',
  '==': '=',
  '!=': '≠',
};

function formatThreshold(v: number): string {
  if (!Number.isFinite(v)) return '·';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

function findInputSourceSuffix(model: Model, nodeId: string): string {
  for (const eid of model.edgeOrder) {
    const e = model.edges[eid];
    if (!e || e.to !== nodeId) continue;
    if ((e.slotIndex ?? 0) !== 0) continue;
    const src: Node | undefined = model.nodes[e.from];
    if (!src) continue;
    if (isValueNode(src) && isNumericValue(src.initialValue)) {
      const def = defaultUnitCatalog.get(src.initialValue.unitId);
      if (def) return resolveUnit(def, src.unitOverride).suffix ?? '';
    } else if (isConstantNode(src) && isNumericValue(src.value)) {
      const def = defaultUnitCatalog.get(src.value.unitId);
      if (def) return resolveUnit(def).suffix ?? '';
    }
    break;
  }
  return '';
}

/**
 * Condition 의 정적 시각. operator + threshold + (입력 source unit suffix). 좌측 입력 1,
 * 우측 출력 2 (slot 0=true, slot 1=false). 각 출력 슬롯은 valid 여부로 흐림 처리.
 */
export function StaticConditionNode({
  node,
  layout,
  slotIndex,
  model,
}: StaticNodeRendererProps): JSX.Element | null {
  if (!isConditionNode(node)) return null;
  const pos = node.position ?? { x: 0, y: 0 };
  const valid0 = isSlotValid(slotIndex, node.id, 0);
  const valid1 = isSlotValid(slotIndex, node.id, 1);
  const isActive = valid0 || valid1;
  const stateClass = isActive ? 'is-calm' : 'is-low';

  const opGlyph = OPERATOR_GLYPH[node.operator];
  const thresholdText = formatThreshold(node.threshold);
  const suffix = findInputSourceSuffix(model, node.id);
  const suffixText = suffix ? ` ${suffix}` : '';

  return (
    <g
      className={`trama-static-node trama-static-condition ${isActive ? '' : 'is-invalid'}`}
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
        {node.label || '조건'}
      </text>
      <text
        className="trama-static-condition-formula"
        x={layout.panelCx}
        y={layout.panelCy}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {`${opGlyph} ${thresholdText}${suffixText}`}
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
