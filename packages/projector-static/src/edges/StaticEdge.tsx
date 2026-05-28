import type { Model, NodeSnapshot } from '@trama-chain/core';
import type { NodeLayout } from '@trama-chain/layout';
import { staticEdgePath, type Point } from '../geometry.js';
import { isSlotValid } from '../snapshot.js';
import type { SlotIndex } from '../snapshot.js';

interface Props {
  edgeId: string;
  model: Model;
  layouts: Record<string, NodeLayout>;
  incomingMap: Record<string, string[]>;
  snapshot: NodeSnapshot;
  slotIndex: SlotIndex;
}

export function StaticEdge({
  edgeId,
  model,
  layouts,
  incomingMap,
  slotIndex,
}: Props): JSX.Element | null {
  const edge = model.edges[edgeId];
  if (!edge) return null;
  const fromNode = model.nodes[edge.from];
  const toNode = model.nodes[edge.to];
  if (!fromNode || !toNode) return null;
  const fromLayout = layouts[edge.from];
  const toLayout = layouts[edge.to];
  if (!fromLayout || !toLayout) return null;

  const fromPos = fromNode.position ?? { x: 0, y: 0 };
  const toPos = toNode.position ?? { x: 0, y: 0 };

  const sourceSlotIdx = edge.sourceSlotIndex ?? 0;
  const src =
    fromLayout.rightPin.sockets[sourceSlotIdx] ?? fromLayout.rightPin.sockets[0];
  const inIdx = (incomingMap[edge.to] ?? []).indexOf(edgeId);
  const dst =
    toLayout.leftPin.sockets[Math.max(0, inIdx)] ?? toLayout.leftPin.sockets[0];
  if (!src || !dst) return null;

  const start: Point = { x: fromPos.x + src.x, y: fromPos.y + src.y };
  const end: Point = { x: toPos.x + dst.x, y: toPos.y + dst.y };

  const { d, tip, tangent, mid } = staticEdgePath(start, end, { lag: edge.lag });

  const isFeedback = edge.lag === 1;
  const sourceValid = isSlotValid(slotIndex, edge.from, sourceSlotIdx);
  const cls = [
    'trama-static-edge',
    isFeedback ? 'is-feedback' : '',
    sourceValid ? '' : 'is-invalid',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <g className="trama-static-edge-group">
      <path className={cls} d={d} />
      <ArrowMarker tip={tip} tangent={tangent} isFeedback={isFeedback} />
      {isFeedback && (
        <text className="trama-static-edge-step" x={mid.x} y={mid.y - 14}>
          t+1
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
  tip: Point;
  tangent: Point;
  isFeedback: boolean;
}): JSX.Element {
  const size = 7;
  const back: Point = { x: tip.x - tangent.x * size, y: tip.y - tangent.y * size };
  const left: Point = {
    x: back.x - tangent.y * size * 0.6,
    y: back.y + tangent.x * size * 0.6,
  };
  const right: Point = {
    x: back.x + tangent.y * size * 0.6,
    y: back.y - tangent.x * size * 0.6,
  };
  return (
    <polygon
      className={`trama-static-arrow${isFeedback ? ' is-feedback' : ''}`}
      points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
    />
  );
}
