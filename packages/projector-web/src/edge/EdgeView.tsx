import { useEffect, useMemo, useRef, useState } from 'react';
import { tokens } from '@trama/tokens';
import { type Edge, type Node } from '@trama/core';
import { useUIStore } from '../store/index.js';
import { edgePath } from './geometry.js';
import { getNodeBox } from '../node/box.js';

interface Props {
  edge: Edge;
  fromNode: Node;
  toNode: Node;
  /** 각 노드의 *현재* 실행 값 (카드 크기·strained 판정 양쪽에 사용). */
  fromValue: number;
  toValue: number;
  /** propagation의 최종 상태에서 source의 정규화 값. strained 시각 판정용. */
  sourceNormalized: number;
  introducing?: boolean;
}

const STRAINED_LOW = tokens.physical.thresholdEdgeStrainedLow;
const STRAINED_HIGH = tokens.physical.thresholdEdgeStrainedHigh;

export function EdgeView({
  edge,
  fromNode,
  toNode,
  fromValue,
  toValue,
  sourceNormalized,
  introducing,
}: Props): JSX.Element {
  const from = fromNode.position ?? { x: 0, y: 0 };
  const to = toNode.position ?? { x: 0, y: 0 };
  const fromBox = getNodeBox(fromNode, fromValue);
  const toBox = getNodeBox(toNode, toValue);

  const { d, tip, tangent, mid } = useMemo(
    () => edgePath(from, to, { lag: edge.lag, fromBox, toBox }),
    [from.x, from.y, to.x, to.y, edge.lag, fromBox.width, fromBox.height, toBox.width, toBox.height],
  );

  const isFeedback = edge.lag === 1;
  const isStrained = sourceNormalized < STRAINED_LOW || sourceNormalized > STRAINED_HIGH;
  const baseClasses = ['trama-edge'];
  if (isFeedback) baseClasses.push('is-feedback');
  if (isStrained) baseClasses.push('is-strained');
  if (introducing) baseClasses.push('is-introducing');

  const arrowClass = `trama-arrow${isFeedback ? ' is-feedback' : ''}${isStrained ? ' is-strained' : ''}`;

  const openFunctionPicker = useUIStore((s) => s.openFunctionPicker);
  const startInsertNodeFromEdge = useUIStore((s) => s.startInsertNodeFromEdge);
  const selectEdge = useUIStore((s) => s.selectEdge);
  const [hover, setHover] = useState(false);

  // shape 변경 감지 → 모핑 클래스 잠깐 부여 (§ 11.6)
  const [morphing, setMorphing] = useState(false);
  const lastShapeKind = useRef(edge.shape.kind);
  useEffect(() => {
    if (lastShapeKind.current !== edge.shape.kind) {
      lastShapeKind.current = edge.shape.kind;
      setMorphing(true);
      const t = window.setTimeout(() => setMorphing(false), 320);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [edge.shape.kind]);

  const groupCls = `trama-edge-group${morphing ? ' is-morphing' : ''}`;

  return (
    <g
      className={groupCls}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <path className={baseClasses.join(' ')} d={d} />
      <ArrowMarker tip={tip} tangent={tangent} className={arrowClass} />
      {isFeedback && (
        <text
          className="trama-step-count"
          x={mid.x}
          y={mid.y - 14}
          style={{ pointerEvents: 'none' }}
        >
          t+1
        </text>
      )}
      <path
        className="trama-edge-hit"
        d={d}
        onClick={(e) => {
          e.stopPropagation();
          selectEdge(edge.id);
          openFunctionPicker(edge.id, { x: e.clientX, y: e.clientY });
        }}
      />
      <circle
        className={`trama-insert-affordance${hover ? ' is-active' : ''}`}
        cx={mid.x}
        cy={mid.y}
        r={7}
        onClick={(e) => {
          e.stopPropagation();
          startInsertNodeFromEdge(edge.id, mid);
        }}
      />
      {hover && (
        <g pointerEvents="none">
          <line
            x1={mid.x - 3.5}
            y1={mid.y}
            x2={mid.x + 3.5}
            y2={mid.y}
            stroke="white"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <line
            x1={mid.x}
            y1={mid.y - 3.5}
            x2={mid.x}
            y2={mid.y + 3.5}
            stroke="white"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </g>
      )}
    </g>
  );
}

function ArrowMarker({
  tip,
  tangent,
  className,
}: {
  tip: { x: number; y: number };
  tangent: { x: number; y: number };
  className: string;
}): JSX.Element {
  const size = 7;
  const back = { x: tip.x - tangent.x * size, y: tip.y - tangent.y * size };
  const left = { x: back.x - tangent.y * size * 0.6, y: back.y + tangent.x * size * 0.6 };
  const right = { x: back.x + tangent.y * size * 0.6, y: back.y - tangent.x * size * 0.6 };
  return (
    <polygon
      className={className}
      points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
    />
  );
}
