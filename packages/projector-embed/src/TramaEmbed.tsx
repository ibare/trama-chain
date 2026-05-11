import { useMemo } from 'react';
import { tokens } from '@trama/tokens';
import {
  documentToModel,
  initializeFromInitialValues,
  normalize,
  parseTrama,
  propagateOneStep,
  type Node,
} from '@trama/core';
import { combinerRegistry, shapeRegistry } from './registries.js';
import { computeBounds, staticEdgePath } from './geometry.js';
import { formatValue, unitSuffix } from './format.js';

const CARD_MIN_W = parseFloat(tokens.spacing.cardMinWidth);
const CARD_MAX_W = parseFloat(tokens.spacing.cardMaxWidth);
const CARD_MIN_H = parseFloat(tokens.spacing.cardMinHeight);
const CARD_MAX_H = parseFloat(tokens.spacing.cardMaxHeight);
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);
const OPACITY_LOW = tokens.physical.opacityNodeLow;
const OPACITY_HIGH = tokens.physical.opacityNodeHigh;
const THRESH_LOW = tokens.physical.thresholdNodeLow;
const STRAINED_LOW = tokens.physical.thresholdEdgeStrainedLow;
const STRAINED_HIGH = tokens.physical.thresholdEdgeStrainedHigh;

function boxFor(value: number, unit: import('@trama/core').Unit): { width: number; height: number } {
  const norm = normalize(value, unit);
  return {
    width: CARD_MIN_W + (CARD_MAX_W - CARD_MIN_W) * norm,
    height: CARD_MIN_H + (CARD_MAX_H - CARD_MIN_H) * norm,
  };
}

interface Props {
  json: string;
  height?: number;
  showQuestion?: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function TramaEmbed({ json, height = 360, showQuestion = true }: Props): JSX.Element {
  const result = useMemo(() => {
    try {
      const doc = parseTrama(json, { shapeRegistry, combinerRegistry });
      const model = documentToModel(doc);
      const initial = initializeFromInitialValues(model);
      const next = propagateOneStep(initial, model, { shapeRegistry, combinerRegistry });
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
          const from = fromNode.position ?? { x: 0, y: 0 };
          const to = toNode.position ?? { x: 0, y: 0 };
          const srcValue = values[edge.from] ?? fromNode.initialValue;
          const dstValue = values[edge.to] ?? toNode.initialValue;
          const fromBox = boxFor(srcValue, fromNode.unit);
          const toBox = boxFor(dstValue, toNode.unit);
          const { d, tip, tangent, mid } = staticEdgePath(from, to, { lag: edge.lag, fromBox, toBox });
          const srcNorm = normalize(srcValue, fromNode.unit);
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
          if (!node) return null;
          const v = values[nid] ?? node.initialValue;
          return <StaticNode key={nid} node={node} currentValue={v} />;
        })}
      </svg>
    </div>
  );
}

function StaticNode({ node, currentValue }: { node: Node; currentValue: number }): JSX.Element {
  const norm = normalize(currentValue, node.unit);
  const { width, height } = boxFor(currentValue, node.unit);
  const halfW = width / 2;
  const halfH = height / 2;
  const opacity = lerp(OPACITY_LOW, OPACITY_HIGH, norm);
  const isLow = norm < THRESH_LOW;
  const isFocal = node.isFocal;
  const stateClass = isFocal ? 'is-focal' : isLow ? 'is-low' : 'is-calm';
  const pos = node.position ?? { x: 0, y: 0 };
  const suffix = unitSuffix(node.unit);
  return (
    <g
      className="trama-embed-node"
      transform={`translate(${pos.x} ${pos.y})`}
      style={{ opacity }}
    >
      <rect
        className={`trama-embed-node-body ${stateClass}`}
        x={-halfW}
        y={-halfH}
        width={width}
        height={height}
        rx={CARD_CORNER}
        ry={CARD_CORNER}
      />
      <text className="trama-embed-node-label" y={-halfH + 18}>
        {node.label}
      </text>
      <text className="trama-embed-node-value" y={4}>
        {formatValue(currentValue, node.unit)}
      </text>
      {suffix && (
        <text className="trama-embed-node-unit" y={halfH - 8}>
          {suffix}
        </text>
      )}
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
