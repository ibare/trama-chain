import {
  useCallback,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { Edge, ResolvedUnit, Model } from '@trama/core';
import { useTrama } from '../store/index.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { formatNodeValue } from '../util/format.js';

/**
 * 도메인 좌표계 위 직접조작 곡선 에디터의 공통 프레임.
 *
 * 모든 shape 에디터(linear·threshold·diminishing·accelerating·piecewise·inverseU)는
 * 이 프레임 위에 곡선 path와 핸들만 정의한다.
 *
 * 책임:
 *  - SVG viewBox·여백·축선
 *  - A(from)/B(to) 노드 도메인 라벨 (value 노드면 resolved unit, 아니면 [0,1] fallback)
 *  - 정규화 ↔ 픽셀 좌표 helper (xN2Px, yN2Px, pxToXn, pxToYn)
 *  - pointer 캡처와 SVG-local 좌표 변환 (localFromEvent)
 *  - Shift 키 그리드 스냅 (0.05)
 *  - drag 중 표시 tip
 *  - Reset 버튼 (defaultParams 복원)
 *
 * 핸들 드래그 상태(dragRef)는 각 에디터가 자체 관리한다. frame은 onPointerMove를
 * 받아서 SVG에 그대로 전달한다.
 */

export const VIEW_W = 300;
export const VIEW_H = 200;
export const PAD_L = 44;
export const PAD_R = 14;
export const PAD_T = 28;
export const PAD_B = 28;
export const PLOT_W = VIEW_W - PAD_L - PAD_R;
export const PLOT_H = VIEW_H - PAD_T - PAD_B;

export const FALLBACK_UNIT: ResolvedUnit = {
  id: 'free',
  kind: 'free',
  suffix: '',
  labels: [],
  min: 0,
  max: 1,
  step: 0.01,
};

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const SNAP_STEP = 0.05;
const snap = (n: number): number => Math.round(n / SNAP_STEP) * SNAP_STEP;

export interface CurveEditorHelpers {
  /** 정규화 [0,1] → SVG pixel. */
  xN2Px: (xn: number) => number;
  yN2Px: (yn: number) => number;
  /** SVG pixel → 정규화 [0,1] (clamped). */
  pxToXn: (px: number) => number;
  pxToYn: (py: number) => number;
  /** PointerEvent → SVG-local 좌표. null이면 svg가 mount되지 않음. */
  localFromEvent: (
    e: ReactPointerEvent<SVGElement>,
  ) => { x: number; y: number } | null;
  /** Shift 키 누르면 0.05 그리드 스냅. */
  maybeSnap: (n: number, e: { shiftKey: boolean }) => number;
  /** 정규화 값을 A(from)/B(to) 노드의 도메인 단위로 환산. */
  toADomain: (xn: number) => number;
  toBDomain: (yn: number) => number;
  /** 도메인 라벨 (단위 포함). */
  formatA: (xn: number) => string;
  formatB: (yn: number) => string;
  aUnit: ResolvedUnit;
  bUnit: ResolvedUnit;
}

interface Props {
  edge: Edge;
  /** 곡선 path와 핸들 등 SVG 콘텐츠. helpers를 받아 그린다. */
  children: (helpers: CurveEditorHelpers) => ReactNode;
  /** SVG 단위 onPointerMove. 각 에디터의 dragRef 분기. */
  onPointerMove?: (e: ReactPointerEvent<SVGSVGElement>) => void;
  /** Reset 버튼 클릭 시 호출. 없으면 버튼이 숨김. */
  onReset?: () => void;
  /** drag 중 표시할 tip 텍스트. 없으면 숨김. */
  tip?: string | null;
}

export function useEdgeDomainUnits(edge: Edge): {
  fromNode: Model['nodes'][string] | undefined;
  toNode: Model['nodes'][string] | undefined;
  aUnit: ResolvedUnit;
  bUnit: ResolvedUnit;
} {
  const { modelStore } = useTrama();
  const model = modelStore((s) => s.model);
  const fromNode = model.nodes[edge.from];
  const toNode = model.nodes[edge.to];
  const aUnit = useMemo(
    () =>
      fromNode && fromNode.kind === 'value' ? resolveNodeUnit(fromNode) : FALLBACK_UNIT,
    [fromNode],
  );
  const bUnit = useMemo(
    () =>
      toNode && toNode.kind === 'value' ? resolveNodeUnit(toNode) : FALLBACK_UNIT,
    [toNode],
  );
  return { fromNode, toNode, aUnit, bUnit };
}

export function CurveEditorFrame({
  edge,
  children,
  onPointerMove,
  onReset,
  tip,
}: Props): JSX.Element | null {
  const { fromNode, toNode, aUnit, bUnit } = useEdgeDomainUnits(edge);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const xN2Px = useCallback((xn: number) => PAD_L + xn * PLOT_W, []);
  const yN2Px = useCallback((yn: number) => PAD_T + (1 - yn) * PLOT_H, []);
  const pxToXn = useCallback(
    (px: number) => clamp01((px - PAD_L) / PLOT_W),
    [],
  );
  const pxToYn = useCallback(
    (py: number) => clamp01(1 - (py - PAD_T) / PLOT_H),
    [],
  );

  const localFromEvent = useCallback(
    (e: ReactPointerEvent<SVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const lx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
      const ly = ((e.clientY - rect.top) / rect.height) * VIEW_H;
      return { x: lx, y: ly };
    },
    [],
  );

  const maybeSnap = useCallback(
    (n: number, e: { shiftKey: boolean }) => (e.shiftKey ? clamp01(snap(n)) : n),
    [],
  );

  const toADomain = useCallback(
    (xn: number) => aUnit.min + xn * (aUnit.max - aUnit.min),
    [aUnit.min, aUnit.max],
  );
  const toBDomain = useCallback(
    (yn: number) => bUnit.min + yn * (bUnit.max - bUnit.min),
    [bUnit.min, bUnit.max],
  );
  const formatA = useCallback(
    (xn: number) => {
      const f = formatNodeValue(toADomain(xn), aUnit);
      return `${f.primary}${f.accessory ? ` ${f.accessory}` : ''}`;
    },
    [toADomain, aUnit],
  );
  const formatB = useCallback(
    (yn: number) => {
      const f = formatNodeValue(toBDomain(yn), bUnit);
      return `${f.primary}${f.accessory ? ` ${f.accessory}` : ''}`;
    },
    [toBDomain, bUnit],
  );

  const helpers: CurveEditorHelpers = useMemo(
    () => ({
      xN2Px,
      yN2Px,
      pxToXn,
      pxToYn,
      localFromEvent,
      maybeSnap,
      toADomain,
      toBDomain,
      formatA,
      formatB,
      aUnit,
      bUnit,
    }),
    [
      xN2Px,
      yN2Px,
      pxToXn,
      pxToYn,
      localFromEvent,
      maybeSnap,
      toADomain,
      toBDomain,
      formatA,
      formatB,
      aUnit,
      bUnit,
    ],
  );

  if (!fromNode || !toNode) return null;

  const aMin = formatNodeValue(aUnit.min, aUnit);
  const aMax = formatNodeValue(aUnit.max, aUnit);
  const bMin = formatNodeValue(bUnit.min, bUnit);
  const bMax = formatNodeValue(bUnit.max, bUnit);

  // onReset prop은 picker level toolbar로 통합되어 더 이상 사용되지 않지만,
  // 7개 호출자 시그니처 호환을 위해 그대로 받아 무시한다.
  void onReset;

  return (
    <div className="trama-curve-editor" style={{ gridColumn: '1 / -1' }}>
      <div className="trama-curve-toolbar">
        <span className="trama-curve-tip">{tip ?? ''}</span>
      </div>
      <svg
        ref={svgRef}
        width={VIEW_W}
        height={VIEW_H}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        onPointerMove={onPointerMove}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ touchAction: 'none', display: 'block' }}
      >
        {/* 축 */}
        <line
          className="trama-curve-axis"
          x1={PAD_L}
          y1={VIEW_H - PAD_B}
          x2={VIEW_W - PAD_R}
          y2={VIEW_H - PAD_B}
        />
        <line
          className="trama-curve-axis"
          x1={PAD_L}
          y1={PAD_T}
          x2={PAD_L}
          y2={VIEW_H - PAD_B}
        />

        {/* x축 도메인 라벨 */}
        <text
          className="trama-curve-axis-label"
          x={PAD_L}
          y={VIEW_H - 8}
          textAnchor="start"
        >
          {aMin.primary}
          {aUnit.kind === 'number' ? aMin.accessory : ''}
        </text>
        <text
          className="trama-curve-axis-label"
          x={VIEW_W - PAD_R}
          y={VIEW_H - 8}
          textAnchor="end"
        >
          {aMax.primary}
          {aUnit.kind === 'number' ? aMax.accessory : ''}
        </text>
        <text
          className="trama-curve-axis-name"
          x={(PAD_L + VIEW_W - PAD_R) / 2}
          y={VIEW_H - 8}
          textAnchor="middle"
        >
          {fromNode.label}
        </text>

        {/* y축 도메인 라벨 */}
        <text
          className="trama-curve-axis-label"
          x={PAD_L - 6}
          y={VIEW_H - PAD_B}
          textAnchor="end"
        >
          {bMin.primary}
        </text>
        <text
          className="trama-curve-axis-label"
          x={PAD_L - 6}
          y={PAD_T + 4}
          textAnchor="end"
        >
          {bMax.primary}
        </text>
        <text
          className="trama-curve-axis-name"
          x={4}
          y={PAD_T + PLOT_H / 2}
          textAnchor="start"
        >
          {toNode.label}
        </text>

        {children(helpers)}
      </svg>
    </div>
  );
}

interface CurveHandleProps {
  cx: number;
  cy: number;
  variant?: 'primary' | 'secondary' | 'point';
  r?: number;
  label?: string;
  labelOffset?: { dx?: number; dy?: number };
  onPointerDown?: (e: ReactPointerEvent<SVGCircleElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<SVGCircleElement>) => void;
  onPointerCancel?: (e: ReactPointerEvent<SVGCircleElement>) => void;
  onDoubleClick?: (e: ReactPointerEvent<SVGCircleElement>) => void;
}

/** 공통 곡선 핸들. SVG 도메인 좌표계에 픽셀로 배치. */
export function CurveHandle({
  cx,
  cy,
  variant = 'primary',
  r,
  label,
  labelOffset,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onDoubleClick,
}: CurveHandleProps): JSX.Element {
  const radius = r ?? (variant === 'primary' ? 8 : variant === 'point' ? 6 : 6);
  const className =
    variant === 'secondary'
      ? 'trama-curve-handle is-secondary'
      : variant === 'point'
        ? 'trama-curve-handle is-point'
        : 'trama-curve-handle';
  const lx = cx + (labelOffset?.dx ?? 0);
  const ly = cy + (labelOffset?.dy ?? -12);
  return (
    <>
      <circle
        className={className}
        cx={cx}
        cy={cy}
        r={radius}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onDoubleClick={onDoubleClick as unknown as React.MouseEventHandler<SVGCircleElement>}
      />
      {label ? (
        <text className="trama-curve-handle-label" x={lx} y={ly} textAnchor="middle">
          {label}
        </text>
      ) : null}
    </>
  );
}
