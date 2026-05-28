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

interface InverseUParams {
  peak: number;
  width: number;
  height: number;
}

const DEFAULTS: InverseUParams = { peak: 0.5, width: 0.35, height: 1 };

/**
 * 종 모양 곡선의 직접조작 에디터. 공통 CurveEditorFrame 위.
 *
 *  - 피크 핸들 → peak·height (x = peak, y = height)
 *  - 폭   핸들 → width      (peak에서 1-시그마 떨어진 위치)
 */
export function InverseUCurveEditor({ edge }: Props): JSX.Element | null {
  const params = edge.shape.params as Partial<InverseUParams>;
  const peak = typeof params.peak === 'number' ? clamp01(params.peak) : DEFAULTS.peak;
  const width = typeof params.width === 'number' ? Math.max(0.02, params.width) : DEFAULTS.width;
  const height = typeof params.height === 'number' ? clamp01(params.height) : DEFAULTS.height;

  const commit = useShapeCommit<InverseUParams>(edge);
  const reset = useShapeReset(edge, DEFAULTS as unknown as Record<string, unknown>);

  const dragRef = useRef<'peak' | 'width' | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const helpersRef = useRef<CurveEditorHelpers | null>(null);

  const onHandleDown = (which: 'peak' | 'width') => (e: React.PointerEvent<SVGCircleElement>) => {
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
      const yn = h.maybeSnap(h.pxToYn(local.y), e);
      if (which === 'peak') {
        commit({ peak: xn, height: yn });
        setTip(`피크 → ${h.formatA(xn)} · ${h.formatB(yn)}`);
      } else {
        const dist = Math.max(0.02, Math.abs(xn - peak));
        commit({ width: dist });
        setTip(`폭 → ${h.formatA(Math.min(1, peak + dist))}`);
      }
    },
    [commit, peak],
  );

  return (
    <CurveEditorFrame edge={edge} onPointerMove={onMove} onReset={reset} tip={tip}>
      {(helpers) => {
        helpersRef.current = helpers;
        const sigma = Math.max(0.001, width);
        const STEPS = 64;
        const parts: string[] = [];
        for (let i = 0; i <= STEPS; i++) {
          const xn = i / STEPS;
          const z = (xn - peak) / sigma;
          const yn = clamp01(height * Math.exp(-(z * z)));
          parts.push(
            `${i === 0 ? 'M' : 'L'} ${helpers.xN2Px(xn).toFixed(2)} ${helpers.yN2Px(yn).toFixed(2)}`,
          );
        }
        const peakPx = { x: helpers.xN2Px(peak), y: helpers.yN2Px(height) };
        const widthXn = Math.min(1, peak + width);
        const widthYn = clamp01(height * Math.exp(-1));
        const widthPx = { x: helpers.xN2Px(widthXn), y: helpers.yN2Px(widthYn) };
        return (
          <>
            {/* 피크 위치 가이드 */}
            <line
              className="trama-curve-guide"
              x1={peakPx.x}
              y1={peakPx.y}
              x2={peakPx.x}
              y2={helpers.yN2Px(0)}
            />
            <line
              className="trama-curve-guide"
              x1={helpers.xN2Px(0)}
              y1={peakPx.y}
              x2={peakPx.x}
              y2={peakPx.y}
            />
            <path d={parts.join(' ')} className="trama-curve-line" />
            <CurveHandle
              cx={widthPx.x}
              cy={widthPx.y}
              variant="secondary"
              onPointerDown={onHandleDown('width')}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
            />
            <CurveHandle
              cx={peakPx.x}
              cy={peakPx.y}
              onPointerDown={onHandleDown('peak')}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              label={helpers.formatA(peak)}
              labelOffset={{ dx: 0, dy: -12 }}
            />
          </>
        );
      }}
    </CurveEditorFrame>
  );
}
