import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { tokens } from '@trama/tokens';
import {
  isConditionNode,
  isExpressionNode,
  isNumericValue,
  isOutputValid,
  isValueNode,
  normalize,
  type EdgeId,
  type Node,
} from '@trama/core';
import { useTrama } from '../store/index.js';
import { shapeRegistry } from '../store/registries.js';
import { getNodeLayout } from '../node/box.js';
import { getConditionNodeLayout } from '../node/condition-box.js';
import { slotColor } from '../node/slot-palette.js';
import { useExpressionMeasureStore } from '../expression/expression-measure-store.js';
import type { FizzexMeasure } from '../expression/use-fizzex-renderer.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { type Point } from './geometry.js';
import { type EdgeHandle } from '../canvas/drag-registry.js';
import { completeEdgeDraft } from '../canvas/edge-draft-actions.js';
import {
  cableEndTangent,
  cableMidpoint,
  cablePointAt,
  cableToPoints,
  createCable,
  setCableEndpoints,
  stepCable,
  type Cable,
} from './cable-physics.js';

/** 케이블 위 shape 마커 위치 비율 — consumer 쪽으로 살짝 치우쳐 metaphor를 살림. */
const SHAPE_MARKER_FRACTION = 0.65;

/**
 * 엣지가 identity 변환(`linear`, slope=1, offset=0)이 아니라 실제로 입력값을
 * 가공하는가? raw vs shape 시각 구분의 단일 판정.
 */
function edgeAppliesShape(edge: {
  shape: { kind: string; params: Record<string, unknown> };
}): boolean {
  if (edge.shape.kind !== 'linear') return true;
  const slope = edge.shape.params.slope;
  const offset = edge.shape.params.offset;
  return slope !== 1 || offset !== 0;
}

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
  const instance = useTrama();
  const { modelStore, uiStore, animationLoop, cableRegistry, dragRegistry } = instance;
  const edge = modelStore((s) => s.model.edges[edgeId]);
  const fromId = edge?.from ?? '';
  const toId = edge?.to ?? '';
  const fromNode = modelStore((s) => (fromId ? s.model.nodes[fromId] : undefined));
  const toNode = modelStore((s) => (toId ? s.model.nodes[toId] : undefined));
  const srcValue = modelStore((s) => {
    if (!fromId) return 0;
    const n = s.model.nodes[fromId];
    const fallback =
      n && isValueNode(n) && isNumericValue(n.initialValue) ? n.initialValue.n : 0;
    const v = s.executionState.values[fromId];
    if (v && isNumericValue(v)) return v.n;
    return fallback;
  });
  // source 출력 슬롯이 현재 valid한가. condition 게이트가 닫히는 등으로 invalid가
  // 되면 target 끝을 소켓에서 풀어 케이블이 대롱대롱 늘어진 시각을 만든다.
  const edgeSourceSlot = edge?.sourceSlotIndex ?? 0;
  const sourceValid = modelStore((s) => {
    if (!fromId) return true;
    return isOutputValid(s.executionState, fromId, edgeSourceSlot);
  });

  const openFunctionPicker = uiStore((s) => s.openFunctionPicker);
  const startInsertNodeFromEdge = uiStore((s) => s.startInsertNodeFromEdge);
  const selectEdge = uiStore((s) => s.selectEdge);
  const startEdgeDraft = uiStore((s) => s.startEdgeDraft);
  const isDetaching = uiStore((s) => s.edgeDraft?.detachingEdgeId === edgeId);
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

  // 식 노드는 fizzex 렌더 후 측정값으로 폭·높이가 동적으로 변한다. 핀 좌표도 따라가야
  // 하므로 ExpressionNodeView가 store에 흘려둔 측정값을 그대로 받아 layout 계산에 쓴다.
  const fromMeasure = useExpressionMeasureStore((s) =>
    fromNode && isExpressionNode(fromNode) ? s.measures[fromNode.id] : undefined,
  );
  const toMeasure = useExpressionMeasureStore((s) =>
    toNode && isExpressionNode(toNode) ? s.measures[toNode.id] : undefined,
  );

  // 노드 종류에 맞는 끝점 좌표. baseStart/baseEnd가 변하면 케이블의 endpoint도 따라옴.
  const edgeSourceSlotIndex = edge?.sourceSlotIndex;
  const baseStart: Point = useMemo(() => {
    if (!fromNode) return { x: 0, y: 0 };
    const base = fromNode.position ?? { x: 0, y: 0 };
    const socket = rightOutputSocket(fromNode, fromIncomingCount, edgeSourceSlotIndex, fromMeasure);
    return { x: base.x + socket.x, y: base.y + socket.y };
  }, [fromNode, fromIncomingCount, edgeSourceSlotIndex, fromMeasure]);

  const edgeSlotIndex = edge?.slotIndex;
  // 슬롯 인식 노드(조건·식)는 model에 저장된 edge.slotIndex가 진실. 그 외(ValueNode
  // 다입력)는 핀 안 시각 순서로 socketIndex(엣지 생성 순) 사용.
  const effectiveSocket = toNode
    ? isConditionNode(toNode) || isExpressionNode(toNode)
      ? (typeof edgeSlotIndex === 'number' ? edgeSlotIndex : 0)
      : socketIndex
    : 0;
  const baseEnd: Point = useMemo(() => {
    if (!toNode) return { x: 0, y: 0 };
    const base = toNode.position ?? { x: 0, y: 0 };
    const socket = leftInputSocket(toNode, toIncomingCount, effectiveSocket, toMeasure);
    return { x: base.x + socket.x, y: base.y + socket.y };
  }, [toNode, toIncomingCount, effectiveSocket, toMeasure]);

  // 케이블 인스턴스 — 한 번 생성. baseStart/baseEnd는 첫 프레임 초기값으로만 사용하고
  // 이후엔 liveEndpointsRef를 통해 매 프레임 갱신된다.
  const cableRef = useRef<Cable | null>(null);
  if (cableRef.current === null) {
    cableRef.current = createCable(baseStart, baseEnd);
  }

  // 매 프레임 ticker가 읽는 endpoint 목표. React 재렌더(노드 이동 commit) 시 baseStart/End가
  // 바뀌면 useEffect로 동기화, 노드 드래그 중엔 applyDrag이 직접 갱신한다.
  const liveEndpointsRef = useRef({
    start: { x: baseStart.x, y: baseStart.y },
    end: { x: baseEnd.x, y: baseEnd.y },
  });

  // base가 바뀌면 ref도 갱신 (드래그가 끝나 model이 commit된 직후).
  useEffect(() => {
    liveEndpointsRef.current.start = { x: baseStart.x, y: baseStart.y };
    liveEndpointsRef.current.end = { x: baseEnd.x, y: baseEnd.y };
  }, [baseStart.x, baseStart.y, baseEnd.x, baseEnd.y]);

  // sourceValid는 ticker가 매 프레임 읽도록 ref로도 유지 — effect deps에 넣어
  // ticker 재등록을 일으키지 않기 위함.
  const sourceValidRef = useRef(sourceValid);
  useEffect(() => {
    sourceValidRef.current = sourceValid;
  }, [sourceValid]);

  const lag = edge?.lag ?? 0;

  // 첫 렌더용 초기 좌표 — 케이블 점 배열에서 직접 뽑는다.
  const initialPoints = useMemo(() => cableToPoints(cableRef.current!), []);
  const initialTangent = useMemo(() => cableEndTangent(cableRef.current!), []);
  const initialMid = useMemo(() => cableMidpoint(cableRef.current!), []);
  const initialMarker = useMemo(
    () => cablePointAt(cableRef.current!, SHAPE_MARKER_FRACTION),
    [],
  );

  // imperative ref들. ticker가 매 프레임 attr을 갱신.
  const pathRef = useRef<SVGPolylineElement | null>(null);
  const hitPathRef = useRef<SVGPolylineElement | null>(null);
  const arrowRef = useRef<SVGPolygonElement | null>(null);
  const stepCountRef = useRef<SVGTextElement | null>(null);
  const insertCircleRef = useRef<SVGCircleElement | null>(null);
  const detachHitRef = useRef<SVGCircleElement | null>(null);
  const shapeMarkerRef = useRef<SVGGElement | null>(null);

  // ticker 등록 — 매 프레임 물리 시뮬레이션 + DOM 갱신.
  useEffect(() => {
    const cable = cableRef.current;
    if (!cable) return;
    const tick = (): void => {
      const live = liveEndpointsRef.current;
      setCableEndpoints(cable, live.start, live.end);
      stepCable(cable, { endFree: !sourceValidRef.current });

      const pointsStr = cableToPoints(cable);
      pathRef.current?.setAttribute('points', pointsStr);
      hitPathRef.current?.setAttribute('points', pointsStr);

      const { tip, tangent } = cableEndTangent(cable);
      arrowRef.current?.setAttribute('points', computeArrowPoints(tip, tangent));
      detachHitRef.current?.setAttribute('cx', String(tip.x));
      detachHitRef.current?.setAttribute('cy', String(tip.y));

      const mid = cableMidpoint(cable);
      if (stepCountRef.current) {
        stepCountRef.current.setAttribute('x', String(mid.x));
        stepCountRef.current.setAttribute('y', String(mid.y - 14));
      }
      if (insertCircleRef.current) {
        insertCircleRef.current.setAttribute('cx', String(mid.x));
        insertCircleRef.current.setAttribute('cy', String(mid.y));
      }
      if (shapeMarkerRef.current) {
        const m = cablePointAt(cable, SHAPE_MARKER_FRACTION);
        shapeMarkerRef.current.setAttribute('transform', `translate(${m.x},${m.y})`);
      }
    };
    const unregisterTicker = animationLoop.register(tick);
    const unregisterCable = cableRegistry.register(edgeId, cable);
    return () => {
      unregisterTicker();
      unregisterCable();
    };
  }, [edgeId, animationLoop, cableRegistry]);

  // 노드 드래그 중 imperative 갱신을 위한 drag-registry 핸들. 여기선 endpoint ref만
  // 갱신하면 ticker가 다음 프레임에 알아서 케이블을 끌어간다.
  const dragStateRef = useRef({ baseStart, baseEnd, fromId, toId });
  dragStateRef.current = { baseStart, baseEnd, fromId, toId };

  useEffect(() => {
    if (!fromId || !toId) return;
    const handle: EdgeHandle = {
      applyDrag(draggedId, dx, dy) {
        const s = dragStateRef.current;
        if (s.fromId === draggedId) {
          liveEndpointsRef.current.start = { x: s.baseStart.x + dx, y: s.baseStart.y + dy };
        }
        if (s.toId === draggedId) {
          liveEndpointsRef.current.end = { x: s.baseEnd.x + dx, y: s.baseEnd.y + dy };
        }
      },
    };
    return dragRegistry.registerEdgeHandle(edgeId, fromId, toId, handle);
  }, [edgeId, fromId, toId, dragRegistry]);

  if (!edge || !fromNode || !toNode) return null;

  const norm = isValueNode(fromNode) ? normalize(srcValue, resolveNodeUnit(fromNode)) : 0.5;
  const isFeedback = edge.lag === 1;
  const isStrained = norm < STRAINED_LOW || norm > STRAINED_HIGH;
  const baseClasses = ['trama-edge'];
  if (isFeedback) baseClasses.push('is-feedback');
  if (isStrained) baseClasses.push('is-strained');
  if (introducing) baseClasses.push('is-introducing');

  const arrowClass = `trama-arrow${isFeedback ? ' is-feedback' : ''}${isStrained ? ' is-strained' : ''}`;
  const groupCls = `trama-edge-group${morphing ? ' is-morphing' : ''}${isDetaching ? ' is-detaching' : ''}${sourceValid ? '' : ' is-gated'}`;

  // 멀티슬롯 노드에 연결된 엣지에 슬롯 식별색을 CSS 변수로 부여.
  // feedback·strained는 styles.css 우선순위로 이 색을 덮어 시맨틱 상태가 우선됨.
  const edgeSlotColor = slotColor(effectiveSocket, toIncomingCount);
  const groupStyle = edgeSlotColor
    ? ({ '--slot-color': edgeSlotColor } as React.CSSProperties)
    : undefined;

  // shape 마커 — 항상 그려두되 적용 여부에 따라 시각 무게를 다르게.
  const shapeApplied = edgeAppliesShape(edge);
  const shapeDef = shapeRegistry.get(edge.shape.kind);
  const shapePreviewPath =
    shapeApplied && shapeDef ? shapeDef.previewPath(12, 8, edge.shape.params as never) : null;
  const markerClass = `trama-shape-marker${shapeApplied ? ' is-applied' : ''}`;

  const onTipPointerDown = (e: React.PointerEvent<SVGCircleElement>): void => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const cable = cableRef.current!;
    const { tip } = cableEndTangent(cable);
    startEdgeDraft({
      fromNodeId: edge.from,
      startPoint: { x: cable.points[0]!.x, y: cable.points[0]!.y },
      pointer: { x: tip.x, y: tip.y },
      lag,
      sourceSlotIndex: edge.sourceSlotIndex,
      detachingEdgeId: edge.id,
    });
  };

  const onTipPointerUp = (e: React.PointerEvent<SVGCircleElement>): void => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    completeEdgeDraft(instance, { dropScreen: { x: e.clientX, y: e.clientY } });
  };

  return (
    <g
      className={groupCls}
      style={groupStyle}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <polyline ref={pathRef} className={baseClasses.join(' ')} points={initialPoints} fill="none" />
      <polygon
        ref={arrowRef}
        className={arrowClass}
        points={computeArrowPoints(initialTangent.tip, initialTangent.tangent)}
      />
      {isFeedback && (
        <text
          ref={stepCountRef}
          className="trama-step-count"
          x={initialMid.x}
          y={initialMid.y - 14}
          style={{ pointerEvents: 'none' }}
        >
          t+1
        </text>
      )}
      <polyline
        ref={hitPathRef}
        className="trama-edge-hit"
        points={initialPoints}
        fill="none"
        onClick={(e) => {
          e.stopPropagation();
          selectEdge(edge.id);
          openFunctionPicker(edge.id, { x: e.clientX, y: e.clientY });
        }}
      />
      <circle
        ref={detachHitRef}
        className="trama-edge-detach-hit"
        cx={initialTangent.tip.x}
        cy={initialTangent.tip.y}
        r={9}
        onPointerDown={onTipPointerDown}
        onPointerUp={onTipPointerUp}
      />
      <circle
        ref={insertCircleRef}
        className={`trama-insert-affordance${hover ? ' is-active' : ''}`}
        cx={initialMid.x}
        cy={initialMid.y}
        r={7}
        onClick={(e) => {
          e.stopPropagation();
          const mid = cableMidpoint(cableRef.current!);
          startInsertNodeFromEdge(edge.id, mid);
        }}
      />
      <g
        ref={shapeMarkerRef}
        className={markerClass}
        transform={`translate(${initialMarker.x},${initialMarker.y})`}
        onClick={(e) => {
          e.stopPropagation();
          selectEdge(edge.id);
          openFunctionPicker(edge.id, { x: e.clientX, y: e.clientY });
        }}
      >
        {/* hit-padding — 시각보다 큰 클릭 영역 */}
        <circle r={11} className="trama-shape-marker-hit" />
        {shapeApplied ? (
          <>
            <rect
              x={-9}
              y={-7}
              width={18}
              height={14}
              rx={4}
              className="trama-shape-marker-chip"
            />
            <g transform="translate(-6,-4)">
              <path d={shapePreviewPath ?? ''} className="trama-shape-marker-curve" />
            </g>
          </>
        ) : (
          <circle r={2.5} className="trama-shape-marker-dot" />
        )}
      </g>
      {hover && (
        <g pointerEvents="none">
          <line
            x1={initialMid.x - 3.5}
            y1={initialMid.y}
            x2={initialMid.x + 3.5}
            y2={initialMid.y}
            stroke="white"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <line
            x1={initialMid.x}
            y1={initialMid.y - 3.5}
            x2={initialMid.x}
            y2={initialMid.y + 3.5}
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

/** 노드 종류에 맞는 우측(출력) 소켓 좌표 — 노드 중심 기준. */
function rightOutputSocket(
  node: Node,
  fromIncomingCount: number,
  _sourceSlotIndex?: number,
  measure?: FizzexMeasure,
): Point {
  if (isConditionNode(node)) {
    const s = getConditionNodeLayout().outputSocket;
    return { x: s.x, y: s.y };
  }
  const layout = getNodeLayout(node, {
    incomingCount: fromIncomingCount,
    expressionSize: measure,
  });
  return layout.rightPin.sockets[0] ?? { x: 0, y: 0 };
}

/** 노드 종류에 맞는 좌측(입력) 소켓 좌표 — 노드 중심 기준. */
function leftInputSocket(
  node: Node,
  toIncomingCount: number,
  socketIndex: number,
  measure?: FizzexMeasure,
): Point {
  if (isConditionNode(node)) {
    const s = getConditionNodeLayout().inputSocket;
    return { x: s.x, y: s.y };
  }
  const layout = getNodeLayout(node, {
    incomingCount: toIncomingCount,
    expressionSize: measure,
  });
  return (
    layout.leftPin.sockets[Math.max(0, socketIndex)] ??
    layout.leftPin.sockets[0] ?? { x: 0, y: 0 }
  );
}
