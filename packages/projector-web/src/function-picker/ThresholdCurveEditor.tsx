import { useCallback, useRef, useState } from 'react';
import type { Edge } from '@trama-chain/core';
import {
  CurveEditorFrame,
  CurveHandle,
  clamp01,
  type CurveEditorHelpers,
} from './CurveEditorFrame.js';
import { useShapeCommit, useShapeReset } from './use-shape-commit.js';

interface Props {
  edge: Edge;
}

interface ThresholdParams {
  threshold: number;
  slope: number;
}

const DEFAULTS: ThresholdParams = { threshold: 0.3, slope: 1.5 };

/**
 * y = (x < threshold) ? 0 : clamp01((x - threshold) * slope) — ReLU 류.
 *
 * 핸들 2개:
 *  - knee   (x=threshold, y=0)            → x로 threshold 이동
 *  - sat    (x=threshold+1/slope, y=1)    → x로 saturation 폭(=1/slope) 결정
 *
 * slope이 매우 크면 sat 핸들이 knee에 붙어 보이므로 최소 0.05 폭은 유지.
 */
export function ThresholdCurveEditor({ edge }: Props): JSX.Element | null {
  const params = edge.shape.params as Partial<ThresholdParams>;
  const threshold = typeof params.threshold === 'number'
    ? clamp01(params.threshold)
    : DEFAULTS.threshold;
  const slope = typeof params.slope === 'number'
    ? Math.max(0.1, params.slope)
    : DEFAULTS.slope;

  const commit = useShapeCommit<ThresholdParams>(edge);
  const reset = useShapeReset(edge, DEFAULTS as unknown as Record<string, unknown>);

  const dragRef = useRef<'knee' | 'sat' | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const helpersRef = useRef<CurveEditorHelpers | null>(null);

  const onHandleDown = (which: 'knee' | 'sat') => (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = which;
  };

  const onHandleUp = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    dragRef.current = null;
    setTip(null);
  };

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const which = dragRef.current;
      const h = helpersRef.current;
      if (!which || !h) return;
      const local = h.localFromEvent(e);
      if (!local) return;
      const xn = h.maybeSnap(h.pxToXn(local.x), e);
      if (which === 'knee') {
        // saturation 폭(1/slope) 유지 — slope은 그대로, threshold만 이동.
        const next = Math.min(0.95, xn);
        commit({ threshold: next });
        setTip(`시작점 → ${h.formatA(next)}`);
      } else {
        // sat x = threshold + 1/slope → slope = 1 / (xn - threshold)
        const width = Math.max(0.05, xn - threshold);
        commit({ slope: 1 / width });
        setTip(`최대 도달 → ${h.formatA(threshold + width)}`);
      }
    },
    [commit, threshold],
  );

  const satXn = Math.min(1, threshold + 1 / slope);
  const satYn = clamp01((satXn - threshold) * slope);

  return (
    <CurveEditorFrame edge={edge} onPointerMove={onMove} onReset={reset} tip={tip}>
      {(helpers) => {
        helpersRef.current = helpers;
        // 곡선 path: 두 구간 — knee 이전 0, 이후 선형 → clamp01.
        const xKneePx = helpers.xN2Px(threshold);
        const yZeroPx = helpers.yN2Px(0);
        const xSatPx = helpers.xN2Px(satXn);
        const ySatPx = helpers.yN2Px(satYn);
        const xRightPx = helpers.xN2Px(1);
        // saturation 이후는 y=1 평탄.
        return (
          <>
            <path
              d={`M ${helpers.xN2Px(0)} ${yZeroPx} L ${xKneePx} ${yZeroPx} L ${xSatPx} ${ySatPx} L ${xRightPx} ${ySatPx}`}
              className="trama-curve-line"
            />
            {/* knee 가이드 라인 */}
            <line
              className="trama-curve-guide"
              x1={xKneePx}
              y1={yZeroPx}
              x2={xKneePx}
              y2={helpers.yN2Px(1)}
            />
            <CurveHandle
              cx={xKneePx}
              cy={yZeroPx}
              onPointerDown={onHandleDown('knee')}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              label={helpers.formatA(threshold)}
              labelOffset={{ dx: 0, dy: 18 }}
            />
            <CurveHandle
              cx={xSatPx}
              cy={ySatPx}
              variant="secondary"
              onPointerDown={onHandleDown('sat')}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              label={helpers.formatA(satXn)}
              labelOffset={{ dx: 0, dy: -10 }}
            />
          </>
        );
      }}
    </CurveEditorFrame>
  );
}
