import { useCallback, useRef, useState } from 'react';
import type { Edge } from '@trama/core';
import { useTrama } from '../store/index.js';
import {
  CurveEditorFrame,
  CurveHandle,
  clamp01,
  PAD_L,
  PAD_T,
  PLOT_W,
  PLOT_H,
  VIEW_W,
  VIEW_H,
  type CurveEditorHelpers,
} from './CurveEditorFrame.js';
import { useShapeReset } from './use-shape-commit.js';

interface Props {
  edge: Edge;
}

interface Pt {
  x: number;
  y: number;
}

const DEFAULTS = {
  points: [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.8 },
    { x: 1, y: 0.3 },
  ],
};

/**
 * 점 집합으로 정의되는 선형 보간 곡선의 직접조작 에디터.
 *
 *  - 핸들 드래그   → 그 점의 (x, y) 변경. 인접 점의 x 사이로 자동 clamp.
 *  - plot 빈 영역 더블클릭 → 클릭 좌표에 새 점 추가.
 *  - 점 더블클릭   → 제거 (최소 2점 유지).
 *  - Shift 누르면 0.05 스냅.
 */
export function PiecewiseEditor({ edge }: Props): JSX.Element | null {
  const { modelStore } = useTrama();
  const updateEdge = modelStore((s) => s.updateEdge);
  const reset = useShapeReset(edge, DEFAULTS as unknown as Record<string, unknown>);

  const rawPoints = (edge.shape.params.points as Pt[] | undefined) ?? [];
  const points: Pt[] = rawPoints.length > 0 ? [...rawPoints].sort((a, b) => a.x - b.x) : [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];

  const dragRef = useRef<number | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const helpersRef = useRef<CurveEditorHelpers | null>(null);

  const commit = useCallback(
    (next: Pt[]) => {
      const sorted = [...next].sort((a, b) => a.x - b.x);
      updateEdge(edge.id, { shape: { kind: 'piecewise', params: { points: sorted } } });
    },
    [edge.id, updateEdge],
  );

  const onHandleDown = (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = i;
  };

  const onHandleUp = (e: React.PointerEvent<SVGCircleElement>) => {
    if (dragRef.current === null) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    dragRef.current = null;
    setTip(null);
  };

  const onHandleDoubleClick = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (points.length <= 2) return;
    const next = points.slice();
    next.splice(i, 1);
    commit(next);
  };

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const i = dragRef.current;
      const h = helpersRef.current;
      if (i === null || !h) return;
      const local = h.localFromEvent(e);
      if (!local) return;
      const xn = h.maybeSnap(h.pxToXn(local.x), e);
      const yn = h.maybeSnap(h.pxToYn(local.y), e);
      // 인접 점 사이로 clamp — 정렬 유지.
      const lower = i > 0 ? (points[i - 1]?.x ?? 0) + 0.01 : 0;
      const upper = i < points.length - 1 ? (points[i + 1]?.x ?? 1) - 0.01 : 1;
      const clampedX = Math.max(lower, Math.min(upper, xn));
      const next = points.slice();
      next[i] = { x: clampedX, y: clamp01(yn) };
      commit(next);
      setTip(`${h.formatA(clampedX)} → ${h.formatB(clamp01(yn))}`);
    },
    [commit, points],
  );

  // plot 영역 더블클릭으로 점 추가.
  const onPlotDoubleClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      e.stopPropagation();
      const h = helpersRef.current;
      if (!h) return;
      const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement | null)?.getBoundingClientRect();
      if (!rect) return;
      const lx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
      const ly = ((e.clientY - rect.top) / rect.height) * VIEW_H;
      const xn = h.pxToXn(lx);
      const yn = h.pxToYn(ly);
      commit([...points, { x: xn, y: yn }]);
    },
    [commit, points],
  );

  return (
    <CurveEditorFrame edge={edge} onPointerMove={onMove} onReset={reset} tip={tip}>
      {(helpers) => {
        helpersRef.current = helpers;
        // 곡선 path: 각 점을 직선으로 연결, 첫 점 이전·마지막 점 이후는 평탄선.
        const segs: string[] = [];
        // 좌측 평탄
        if (points[0] && points[0].x > 0) {
          segs.push(`M ${helpers.xN2Px(0)} ${helpers.yN2Px(clamp01(points[0].y))}`);
          segs.push(`L ${helpers.xN2Px(points[0].x)} ${helpers.yN2Px(clamp01(points[0].y))}`);
        } else if (points[0]) {
          segs.push(`M ${helpers.xN2Px(points[0].x)} ${helpers.yN2Px(clamp01(points[0].y))}`);
        }
        for (let i = 1; i < points.length; i++) {
          const p = points[i]!;
          segs.push(`L ${helpers.xN2Px(p.x)} ${helpers.yN2Px(clamp01(p.y))}`);
        }
        const last = points[points.length - 1];
        if (last && last.x < 1) {
          segs.push(`L ${helpers.xN2Px(1)} ${helpers.yN2Px(clamp01(last.y))}`);
        }
        return (
          <>
            {/* plot 빈 영역 hit-rect — 더블클릭 추가. 핸들/path는 위에 그려져 우선. */}
            <rect
              x={PAD_L}
              y={PAD_T}
              width={PLOT_W}
              height={PLOT_H}
              fill="transparent"
              onDoubleClick={onPlotDoubleClick}
              style={{ cursor: 'crosshair' }}
            />
            <path d={segs.join(' ')} className="trama-curve-line" />
            {points.map((p, i) => (
              <CurveHandle
                key={i}
                cx={helpers.xN2Px(p.x)}
                cy={helpers.yN2Px(clamp01(p.y))}
                variant="point"
                onPointerDown={onHandleDown(i)}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                onDoubleClick={onHandleDoubleClick(i) as unknown as (e: React.PointerEvent<SVGCircleElement>) => void}
              />
            ))}
          </>
        );
      }}
    </CurveEditorFrame>
  );
}
