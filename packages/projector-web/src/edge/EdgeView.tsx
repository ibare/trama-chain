import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { tokens } from '@trama/tokens';
import { isValueNode, normalize, type EdgeId } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { getNodeLayout } from '../node/box.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { edgePath, type Point } from './geometry.js';
import { registerEdgeHandle, type EdgeHandle } from '../canvas/drag-registry.js';

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
const ARROW_SIZE = 7;

function computeArrowPoints(tip: Point, tangent: Point): string {
  const back = { x: tip.x - tangent.x * ARROW_SIZE, y: tip.y - tangent.y * ARROW_SIZE };
  const left = { x: back.x - tangent.y * ARROW_SIZE * 0.6, y: back.y + tangent.x * ARROW_SIZE * 0.6 };
  const right = { x: back.x + tangent.y * ARROW_SIZE * 0.6, y: back.y - tangent.x * ARROW_SIZE * 0.6 };
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

function EdgeViewImpl({
  edgeId,
  fromIncomingCount,
  toIncomingCount,
  socketIndex,
  introducing,
}: Props): JSX.Element | null {
  const edge = useModelStore((s) => s.model.edges[edgeId]);
  const fromId = edge?.from ?? '';
  const toId = edge?.to ?? '';
  const fromNode = useModelStore((s) => (fromId ? s.model.nodes[fromId] : undefined));
  const toNode = useModelStore((s) => (toId ? s.model.nodes[toId] : undefined));
  const srcValue = useModelStore((s) => {
    if (!fromId) return 0;
    const n = s.model.nodes[fromId];
    const fallback = n && isValueNode(n) ? n.initialValue : 0;
    return s.executionState.values[fromId] ?? fallback;
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

  // 현재 baseline 좌표·소켓 (드래그 오프셋 미포함). 매 render마다 갱신해
  // imperative 핸들이 항상 최신 baseline을 보게 한다.
  const baseStart: Point = useMemo(() => {
    if (!fromNode) return { x: 0, y: 0 };
    const layout = getNodeLayout(fromNode, { incomingCount: fromIncomingCount });
    const base = fromNode.position ?? { x: 0, y: 0 };
    const socket = layout.rightPin.sockets[0] ?? { x: 0, y: 0 };
    return { x: base.x + socket.x, y: base.y + socket.y };
  }, [fromNode, fromIncomingCount]);

  const baseEnd: Point = useMemo(() => {
    if (!toNode) return { x: 0, y: 0 };
    const layout = getNodeLayout(toNode, { incomingCount: toIncomingCount });
    const base = toNode.position ?? { x: 0, y: 0 };
    const socket =
      layout.leftPin.sockets[Math.max(0, socketIndex)] ?? layout.leftPin.sockets[0] ?? { x: 0, y: 0 };
    return { x: base.x + socket.x, y: base.y + socket.y };
  }, [toNode, toIncomingCount, socketIndex]);

  const lag = edge?.lag ?? 0;
  const { d, tip, tangent, mid } = useMemo(
    () => edgePath(baseStart, baseEnd, { lag }),
    [baseStart.x, baseStart.y, baseEnd.x, baseEnd.y, lag],
  );

  // imperative 핸들이 참조할 최신 상태. 매 render에서 갱신.
  const stateRef = useRef({ baseStart, baseEnd, lag, fromId, toId });
  stateRef.current = { baseStart, baseEnd, lag, fromId, toId };

  const pathRef = useRef<SVGPathElement | null>(null);
  const hitPathRef = useRef<SVGPathElement | null>(null);
  const arrowRef = useRef<SVGPolygonElement | null>(null);
  const stepCountRef = useRef<SVGTextElement | null>(null);

  // 핸들 등록 — edge가 존재하고 fromId/toId가 확정될 때만.
  useEffect(() => {
    if (!fromId || !toId) return;
    const handle: EdgeHandle = {
      applyDrag(draggedId, dx, dy) {
        const s = stateRef.current;
        const start = s.fromId === draggedId
          ? { x: s.baseStart.x + dx, y: s.baseStart.y + dy }
          : s.baseStart;
        const end = s.toId === draggedId
          ? { x: s.baseEnd.x + dx, y: s.baseEnd.y + dy }
          : s.baseEnd;
        const path = edgePath(start, end, { lag: s.lag });
        pathRef.current?.setAttribute('d', path.d);
        hitPathRef.current?.setAttribute('d', path.d);
        arrowRef.current?.setAttribute('points', computeArrowPoints(path.tip, path.tangent));
        if (stepCountRef.current) {
          stepCountRef.current.setAttribute('x', String(path.mid.x));
          stepCountRef.current.setAttribute('y', String(path.mid.y - 14));
        }
      },
    };
    return registerEdgeHandle(edgeId, fromId, toId, handle);
  }, [edgeId, fromId, toId]);

  if (!edge || !fromNode || !toNode) return null;

  // FunctionNode source는 단위 정규화 의미가 없음 — strained 시각화는 0으로 처리.
  const norm = isValueNode(fromNode) ? normalize(srcValue, resolveNodeUnit(fromNode)) : 0.5;
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
      <path ref={pathRef} className={baseClasses.join(' ')} d={d} />
      <polygon
        ref={arrowRef}
        className={arrowClass}
        points={computeArrowPoints(tip, tangent)}
      />
      {isFeedback && (
        <text
          ref={stepCountRef}
          className="trama-step-count"
          x={mid.x}
          y={mid.y - 14}
          style={{ pointerEvents: 'none' }}
        >
          t+1
        </text>
      )}
      <path
        ref={hitPathRef}
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
