import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { tokens } from '@trama/tokens';
import { normalize, type EdgeId } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { getNodeLayout } from '../node/box.js';
import { edgePath } from './geometry.js';

interface Props {
  edgeId: EdgeId;
  fromIncomingCount: number;
  toIncomingCount: number;
  /** 이 엣지가 to-node에서 몇 번째 incoming인가 (좌측 핀 소켓 인덱스). */
  socketIndex: number;
  introducing?: boolean;
}

const STRAINED_LOW = tokens.physical.thresholdEdgeStrainedLow;
const STRAINED_HIGH = tokens.physical.thresholdEdgeStrainedHigh;

function EdgeViewImpl({
  edgeId,
  fromIncomingCount,
  toIncomingCount,
  socketIndex,
  introducing,
}: Props): JSX.Element | null {
  // 좁은 셀렉터로 자기 엣지와 양 끝 노드만 구독. 무관한 변경에는 리렌더되지 않는다.
  const edge = useModelStore((s) => s.model.edges[edgeId]);
  const fromId = edge?.from ?? '';
  const toId = edge?.to ?? '';
  const fromNode = useModelStore((s) => (fromId ? s.model.nodes[fromId] : undefined));
  const toNode = useModelStore((s) => (toId ? s.model.nodes[toId] : undefined));
  const srcValue = useModelStore((s) => {
    if (!fromId) return 0;
    const n = s.model.nodes[fromId];
    return s.executionState.values[fromId] ?? n?.initialValue ?? 0;
  });
  // 양 끝 노드 중 어느 쪽이 드래그 중이면 그 오프셋만 받는다. 두 노드 모두
  // 무관할 때는 null 반환 → Object.is로 리렌더 차단.
  const drag = useUIStore((s) => {
    const d = s.activeNodeDrag;
    if (!d) return null;
    if (d.nodeId === fromId || d.nodeId === toId) return d;
    return null;
  });

  const openFunctionPicker = useUIStore((s) => s.openFunctionPicker);
  const startInsertNodeFromEdge = useUIStore((s) => s.startInsertNodeFromEdge);
  const selectEdge = useUIStore((s) => s.selectEdge);
  const [hover, setHover] = useState(false);

  const [morphing, setMorphing] = useState(false);
  const lastShapeKind = useRef(edge?.shape.kind);
  useEffect(() => {
    if (edge && lastShapeKind.current !== edge.shape.kind) {
      lastShapeKind.current = edge.shape.kind;
      setMorphing(true);
      const t = window.setTimeout(() => setMorphing(false), 320);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [edge]);

  // 양 끝 좌표 계산 — drag 오프셋을 model.position에 더한다.
  const start = useMemo(() => {
    if (!fromNode) return { x: 0, y: 0 };
    const layout = getNodeLayout(fromNode, { incomingCount: fromIncomingCount });
    const base = fromNode.position ?? { x: 0, y: 0 };
    const offset = drag && drag.nodeId === fromId ? { dx: drag.dx, dy: drag.dy } : { dx: 0, dy: 0 };
    const socket = layout.rightPin.sockets[0] ?? { x: 0, y: 0 };
    return { x: base.x + offset.dx + socket.x, y: base.y + offset.dy + socket.y };
  }, [fromNode, fromIncomingCount, drag, fromId]);

  const end = useMemo(() => {
    if (!toNode) return { x: 0, y: 0 };
    const layout = getNodeLayout(toNode, { incomingCount: toIncomingCount });
    const base = toNode.position ?? { x: 0, y: 0 };
    const offset = drag && drag.nodeId === toId ? { dx: drag.dx, dy: drag.dy } : { dx: 0, dy: 0 };
    const socket =
      layout.leftPin.sockets[Math.max(0, socketIndex)] ?? layout.leftPin.sockets[0] ?? { x: 0, y: 0 };
    return { x: base.x + offset.dx + socket.x, y: base.y + offset.dy + socket.y };
  }, [toNode, toIncomingCount, drag, toId, socketIndex]);

  const { d, tip, tangent, mid } = useMemo(
    () => edgePath(start, end, { lag: edge?.lag ?? 0 }),
    [start.x, start.y, end.x, end.y, edge?.lag],
  );

  if (!edge || !fromNode || !toNode) return null;

  const norm = normalize(srcValue, fromNode.unit);
  const isFeedback = edge.lag === 1;
  const isStrained = norm < STRAINED_LOW || norm > STRAINED_HIGH;
  const baseClasses = ['trama-edge'];
  if (isFeedback) baseClasses.push('is-feedback');
  if (isStrained) baseClasses.push('is-strained');
  if (introducing) baseClasses.push('is-introducing');

  const arrowClass = `trama-arrow${isFeedback ? ' is-feedback' : ''}${isStrained ? ' is-strained' : ''}`;
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

export const EdgeView = memo(EdgeViewImpl);

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
