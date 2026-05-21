import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  isConditionNode,
  isExpressionNode,
  type EdgeId,
  type Node,
} from '@trama/core';
import { useTrama } from '../store/index.js';
import {
  selectIsBranchingSlot,
  selectIsContinuousSource,
  selectIsSlotActive,
} from '../store/edge-selectors.js';
import { shapeRegistry } from '../store/registries.js';
import { getNodeLayout } from '../node/box.js';
import { resolveDisplayMode } from '../node/display-mode.js';
import { conditionSourceSlotColor, slotColor } from '../node/slot-palette.js';
import { useExpressionMeasureStore } from '../expression/expression-measure-store.js';
import type { FizzexMeasure } from '../expression/use-fizzex-renderer.js';
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
  const { modelStore, uiStore, animationLoop, cableRegistry, dragRegistry, timeSettingsStore } =
    instance;
  const edge = modelStore((s) => s.model.edges[edgeId]);
  const fromId = edge?.from ?? '';
  const toId = edge?.to ?? '';
  const fromNode = modelStore((s) => (fromId ? s.model.nodes[fromId] : undefined));
  const toNode = modelStore((s) => (toId ? s.model.nodes[toId] : undefined));
  // 케이블 dashed 시맨틱은 "분기 슬롯의 비활성 케이블" 단일 의미.
  // source 슬롯이 디스크립터에서 branching: true 로 표시되어 있고 (Condition true/
  // false, LogicGate 출력 등) 현재 그 슬롯이 valid 가 아닐 때만 dashed. 평가 결과
  // 활성으로 확정된 슬롯은 solid 로 굳어 펄스 운반의 끝을 시각적으로도 표현한다.
  // 비분기 source 는 valid 여부와 무관하게 항상 solid — 데이터 미도착/평가 보류
  // 같은 상태성은 노드 본체의 "…" + 점선 보더로 이미 표현된다.
  const edgeSourceSlot = edge?.sourceSlotIndex ?? 0;
  const isBranchingInactive = modelStore((s) => {
    if (!fromId) return false;
    if (!selectIsBranchingSlot(s.model, fromId, edgeSourceSlot)) return false;
    return !selectIsSlotActive(s.executionState, fromId, edgeSourceSlot);
  });

  const openFunctionPicker = uiStore((s) => s.openFunctionPicker);
  const openNodePickerAtEdge = uiStore((s) => s.openNodePickerAtEdge);
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

  // source 노드의 outputInterpolation을 디스크립터 경유로 조회 — 'continuous' 인
  // source(현재 sine paradigm) 만 매 프레임 stroke 시각을 변조한다. 디스크립터를 직접
  // 경유해 paradigm 종류 하드코딩 분기를 피한다(principles §3).
  const isContinuousSource = modelStore((s) =>
    fromId ? selectIsContinuousSource(s.model, fromId) : false,
  );
  // ticker 재등록 회피용 ref.
  const isContinuousRef = useRef(isContinuousSource);
  useEffect(() => {
    isContinuousRef.current = isContinuousSource;
  }, [isContinuousSource]);

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
      stepCable(cable);

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

      // continuous source: 데이터 주기와 독립인 1s 자체 진동으로 stroke 시각을 변조.
      // "유체가 흐른다" 는 추상적 시그널만 전달 — 실제 데이터 값은 ObserveNode 가 담당.
      // source 의 주기(예: sine 20s)에 시각이 결속되면 너무 느려 흐름이 느껴지지 않음.
      if (!isContinuousRef.current) return;
      const path = pathRef.current;
      if (!path) return;
      // paused 일 때는 시뮬레이션 시간이 정지 — 시각만 흐르면 "멈춤이지만 흐른다"
      // 라는 모순. 마지막 intensity 를 그대로 둬 박제한다 (performance.now() 는
      // wall-clock 이라 paused 와 무관하게 흘러 잘못된 진동을 만들 위험).
      if (timeSettingsStore.getState().paused) return;
      const intensity = (Math.sin((performance.now() / 1000) * Math.PI * 2) + 1) / 2;
      path.style.setProperty('--continuous-intensity', String(intensity));
    };
    const unregisterTicker = animationLoop.register(tick);
    const unregisterCable = cableRegistry.register(edgeId, cable);
    return () => {
      unregisterTicker();
      unregisterCable();
    };
  }, [edgeId, animationLoop, cableRegistry, timeSettingsStore]);

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

  const isFeedback = edge.lag === 1;
  const baseClasses = ['trama-edge'];
  if (isFeedback) baseClasses.push('is-feedback');
  if (introducing) baseClasses.push('is-introducing');
  if (isContinuousSource) baseClasses.push('is-continuous');

  const arrowClass = `trama-arrow${isFeedback ? ' is-feedback' : ''}`;
  const groupCls = `trama-edge-group${morphing ? ' is-morphing' : ''}${isDetaching ? ' is-detaching' : ''}${isBranchingInactive ? ' is-branching' : ''}`;

  // 멀티슬롯 노드에 연결된 엣지에 슬롯 식별색을 CSS 변수로 부여.
  // feedback은 styles.css 우선순위로 이 색을 덮어 시맨틱 상태가 우선됨.
  //
  // 우선순위: source 가 ConditionNode 면 true/false 의미가 target slot 식별색보다
  // 강하므로 conditionSourceSlotColor 가 먼저. 그 외엔 target 슬롯 식별색.
  const conditionColor =
    fromNode && isConditionNode(fromNode)
      ? conditionSourceSlotColor(edgeSourceSlot)
      : null;
  const edgeSlotColor = conditionColor ?? slotColor(effectiveSocket, toIncomingCount);
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
    // 재생 중에는 케이블 편집(detach 포함) 일괄 금지 — 출력 소켓 측 use-edge-draft-source와 일관.
    if (!timeSettingsStore.getState().paused) return;
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
          openNodePickerAtEdge(edge.id, { x: e.clientX, y: e.clientY }, mid);
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

/** 노드 종류에 맞는 우측(출력) 소켓 좌표 — 노드 중심 기준.
 *  sourceSlotIndex 가 지정되면 해당 슬롯의 소켓 좌표를, 없으면 0번 소켓을 반환한다.
 *  슬롯이 정의되지 않은 인덱스에 대해서는 0번으로 폴백. */
function rightOutputSocket(
  node: Node,
  fromIncomingCount: number,
  sourceSlotIndex: number | undefined,
  measure?: FizzexMeasure,
): Point {
  const layout = getNodeLayout(node, {
    incomingCount: fromIncomingCount,
    expressionSize: measure,
    displayMode: resolveDisplayMode(node),
  });
  const idx = Math.max(0, sourceSlotIndex ?? 0);
  return (
    layout.rightPin.sockets[idx] ??
    layout.rightPin.sockets[0] ?? { x: 0, y: 0 }
  );
}

/** 노드 종류에 맞는 좌측(입력) 소켓 좌표 — 노드 중심 기준. */
function leftInputSocket(
  node: Node,
  toIncomingCount: number,
  socketIndex: number,
  measure?: FizzexMeasure,
): Point {
  const layout = getNodeLayout(node, {
    incomingCount: toIncomingCount,
    expressionSize: measure,
    displayMode: resolveDisplayMode(node),
  });
  return (
    layout.leftPin.sockets[Math.max(0, socketIndex)] ??
    layout.leftPin.sockets[0] ?? { x: 0, y: 0 }
  );
}
