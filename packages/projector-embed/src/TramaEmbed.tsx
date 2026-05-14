import { useMemo } from 'react';
import { tokens } from '@trama/tokens';
import {
  defaultUnitCatalog,
  documentToModel,
  initializeFromInitialValues,
  isNumericValue,
  isValueNode,
  normalize,
  parseTrama,
  propagateOneStep,
  resolveUnit,
  type EdgeId,
  type Node,
  type NodeId,
  type ResolvedUnit,
  type Value,
  type ValueNode,
} from '@trama/core';
import { combinerRegistry, shapeRegistry } from './registries.js';
import { computeBounds, staticEdgePath } from './geometry.js';
import { getNodeLayout, type PinLayout } from './layout.js';
import { formatNodeValue } from './format.js';

const FREE_FALLBACK: ResolvedUnit = {
  id: 'free',
  kind: 'free',
  suffix: '',
  labels: [],
  min: 0,
  max: 1,
  step: 0.01,
};

function resolveNodeUnit(node: Node): ResolvedUnit {
  if (!isValueNode(node)) return FREE_FALLBACK;
  if (!isNumericValue(node.initialValue)) return FREE_FALLBACK;
  const def = defaultUnitCatalog.get(node.initialValue.unitId);
  if (!def) return FREE_FALLBACK;
  return resolveUnit(def, node.unitOverride);
}

function valueAsNumber(v: Value | undefined): number {
  if (!v || !isNumericValue(v)) return 0;
  return v.n;
}

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);
const PIN_RADIUS = parseFloat(tokens.spacing.pinRadius);
const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const SOCKET_DOT_SIZE = parseFloat(tokens.spacing.socketDotSize);
const STRAINED_LOW = tokens.physical.thresholdEdgeStrainedLow;
const STRAINED_HIGH = tokens.physical.thresholdEdgeStrainedHigh;

interface Props {
  json: string;
  height?: number;
  showQuestion?: boolean;
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

export function TramaEmbed({ json, height = 360, showQuestion = true }: Props): JSX.Element {
  const result = useMemo(() => {
    try {
      const doc = parseTrama(json, { shapeRegistry, combinerRegistry });
      const model = documentToModel(doc);
      const initial = initializeFromInitialValues(model);
      const next = propagateOneStep(initial, model, {
        shapeRegistry,
        combinerRegistry,
      });
      return { ok: true as const, model, values: next.values };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [json]);

  if (!result.ok) {
    return (
      <div
        data-trama-root
        className="trama-embed trama-embed-error"
        style={{ height, padding: 12 }}
      >
        <p>모델을 불러올 수 없어요.</p>
        <pre style={{ fontSize: 11, opacity: 0.6 }}>{result.error}</pre>
      </div>
    );
  }

  const { model, values } = result;

  const incomingMap: Record<NodeId, EdgeId[]> = {};
  for (const eid of model.edgeOrder) {
    const e = model.edges[eid];
    if (!e) continue;
    (incomingMap[e.to] ??= []).push(eid);
  }

  const layouts: Record<NodeId, ReturnType<typeof getNodeLayout>> = {};
  for (const nid of model.nodeOrder) {
    layouts[nid] = getNodeLayout({ incomingCount: incomingMap[nid]?.length ?? 0 });
  }

  const positions = model.nodeOrder
    .map((id) => model.nodes[id]?.position)
    .filter((p): p is { x: number; y: number } => !!p);
  const bounds = computeBounds(positions);
  const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;

  return (
    <div data-trama-root className="trama-embed" style={{ height }}>
      {showQuestion && model.question && (
        <div className="trama-embed-question">{model.question}</div>
      )}
      <svg className="trama-embed-canvas" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        <rect
          className="trama-canvas-bg"
          x={bounds.minX}
          y={bounds.minY}
          width={bounds.width}
          height={bounds.height}
        />
        {model.edgeOrder.map((eid) => {
          const edge = model.edges[eid];
          if (!edge) return null;
          const fromNode = model.nodes[edge.from];
          const toNode = model.nodes[edge.to];
          if (!fromNode || !toNode) return null;
          const fromPos = fromNode.position ?? { x: 0, y: 0 };
          const toPos = toNode.position ?? { x: 0, y: 0 };
          const fromLayout = layouts[edge.from]!;
          const toLayout = layouts[edge.to]!;
          const socketIdx = (incomingMap[edge.to] ?? []).indexOf(eid);
          const src = fromLayout.rightPin.sockets[0];
          const dst = toLayout.leftPin.sockets[Math.max(0, socketIdx)] ?? toLayout.leftPin.sockets[0];
          if (!src || !dst) return null;
          const start = { x: fromPos.x + src.x, y: fromPos.y + src.y };
          const end = { x: toPos.x + dst.x, y: toPos.y + dst.y };

          const { d, tip, tangent, mid } = staticEdgePath(start, end, { lag: edge.lag });

          const srcRaw =
            values[edge.from] ??
            (isValueNode(fromNode) ? fromNode.initialValue : undefined);
          const srcValue = valueAsNumber(srcRaw);
          const srcNorm = normalize(srcValue, resolveNodeUnit(fromNode));
          const isFeedback = edge.lag === 1;
          const isStrained = srcNorm < STRAINED_LOW || srcNorm > STRAINED_HIGH;
          const cls = [
            'trama-embed-edge',
            isFeedback ? 'is-feedback' : '',
            isStrained ? 'is-strained' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <g key={eid} className="trama-embed-edge-group">
              <path className={cls} d={d} />
              <ArrowMarker tip={tip} tangent={tangent} isFeedback={isFeedback} />
              {isFeedback && (
                <text className="trama-embed-step-count" x={mid.x} y={mid.y - 14}>
                  t+1
                </text>
              )}
            </g>
          );
        })}
        {model.nodeOrder.map((nid) => {
          const node = model.nodes[nid];
          if (!node || !isValueNode(node)) return null; // embed는 ValueNode만 렌더
          const layout = layouts[nid]!;
          const v = valueAsNumber(values[nid] ?? node.initialValue);
          return <StaticNode key={nid} node={node} layout={layout} currentValue={v} />;
        })}
      </svg>
    </div>
  );
}

function StaticNode({
  node,
  layout,
  currentValue,
}: {
  node: ValueNode;
  layout: ReturnType<typeof getNodeLayout>;
  currentValue: number;
}): JSX.Element {
  const unit = resolveNodeUnit(node);
  const isFocal = node.isFocal;
  const stateClass = isFocal ? 'is-focal' : 'is-calm';
  const pos = node.position ?? { x: 0, y: 0 };
  const formatted = formatNodeValue(currentValue, unit);
  const combiner = combinerRegistry.get(node.combiner);
  const combinerLabel = combiner?.labels.ko ?? node.combiner;
  return (
    <g
      className="trama-embed-node"
      transform={`translate(${pos.x} ${pos.y})`}
    >
      <rect
        className={`trama-embed-node-body ${stateClass}`}
        x={-layout.halfW}
        y={-layout.halfH}
        width={layout.width}
        height={layout.height}
        rx={CARD_CORNER}
        ry={CARD_CORNER}
      />
      <text className="trama-embed-node-label" x={0} y={layout.labelY} textAnchor="middle">
        {node.label}
      </text>
      <line
        className="trama-embed-node-divider"
        x1={layout.divider.x1}
        x2={layout.divider.x2}
        y1={layout.divider.y}
        y2={layout.divider.y}
      />
      <text className="trama-embed-node-value" x={0} y={layout.valueY} textAnchor="middle">
        {formatted.primary}
        {formatted.accessory && (
          <tspan className="trama-embed-node-unit" dx="6">
            {formatted.accessory}
          </tspan>
        )}
      </text>
      {layout.hasCombiner && layout.combinerCenterY !== null && (
        <CombinerChip
          symbol={combinerSymbol(node.combiner)}
          label={combinerLabel}
          cy={layout.combinerCenterY}
        />
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

function PinShape({ pin, stateClass }: { pin: PinLayout; stateClass: string }): JSX.Element {
  return (
    <rect
      className={`trama-embed-node-pin ${stateClass}`}
      x={pin.rectX}
      y={pin.rectY}
      width={pin.width}
      height={pin.height}
      rx={Math.min(PIN_RADIUS, pin.width / 2, pin.height / 2)}
      ry={Math.min(PIN_RADIUS, pin.width / 2, pin.height / 2)}
    />
  );
}

function SocketVisual({
  cx,
  cy,
  stateClass,
}: {
  cx: number;
  cy: number;
  stateClass: string;
}): JSX.Element {
  return (
    <g>
      <circle
        className={`trama-embed-node-socket-ring ${stateClass}`}
        cx={cx}
        cy={cy}
        r={SOCKET_SIZE / 2}
      />
      <circle
        className={`trama-embed-node-socket-dot ${stateClass}`}
        cx={cx}
        cy={cy}
        r={SOCKET_DOT_SIZE / 2}
      />
    </g>
  );
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
        className="trama-embed-node-combiner"
        x={-w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
      />
      <text
        className="trama-embed-node-combiner-text"
        x={0}
        y={cy + fontSize / 3}
        textAnchor="middle"
      >
        {text}
      </text>
    </g>
  );
}

function ArrowMarker({
  tip,
  tangent,
  isFeedback,
}: {
  tip: { x: number; y: number };
  tangent: { x: number; y: number };
  isFeedback: boolean;
}): JSX.Element {
  const size = 7;
  const back = { x: tip.x - tangent.x * size, y: tip.y - tangent.y * size };
  const left = { x: back.x - tangent.y * size * 0.6, y: back.y + tangent.x * size * 0.6 };
  const right = { x: back.x + tangent.y * size * 0.6, y: back.y - tangent.x * size * 0.6 };
  return (
    <polygon
      className={`trama-embed-arrow${isFeedback ? ' is-feedback' : ''}`}
      points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
    />
  );
}
