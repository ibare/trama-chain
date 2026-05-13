import { useCallback, useMemo, useRef, useState } from 'react';
import type { Edge } from '@trama/core';
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

interface DiminishingParams {
  curvature: number;
}

const DEFAULTS: DiminishingParams = { curvature: 0.5 };
const LOG_HALF = Math.log(0.5);

/**
 * y = x^(1-k), k ∈ (0,1) — 갈수록 둔해지는 sqrt 류.
 *
 * 핸들 1개: (x=0.5, y=y50). 핸들의 y를 끌어 올리면 곡선이 더 둔해진다.
 * y50과 k의 관계: k = 1 - log(y50)/log(0.5).
 */
export function DiminishingCurveEditor({ edge }: Props): JSX.Element | null {
  const params = edge.shape.params as Partial<DiminishingParams>;
  const curvature = typeof params.curvature === 'number'
    ? Math.min(0.99, Math.max(0.01, params.curvature))
    : DEFAULTS.curvature;

  const commit = useShapeCommit<DiminishingParams>(edge);
  const reset = useShapeReset(edge, DEFAULTS as unknown as Record<string, unknown>);

  const dragRef = useRef<boolean>(false);
  const [tip, setTip] = useState<string | null>(null);
  const helpersRef = useRef<CurveEditorHelpers | null>(null);

  const power = 1 - curvature;
  const y50 = Math.pow(0.5, power);

  const curvePoints = useMemo(() => {
    const STEPS = 48;
    return Array.from({ length: STEPS + 1 }, (_, i) => {
      const x = i / STEPS;
      return { x, y: clamp01(Math.pow(x, power)) };
    });
  }, [power]);

  const onHandleDown = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = true;
  };

  const onHandleUp = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    dragRef.current = false;
    setTip(null);
  };

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const h = helpersRef.current;
      if (!dragRef.current || !h) return;
      const local = h.localFromEvent(e);
      if (!local) return;
      // y50은 항상 0.5 초과. (= diminishing이라는 정의)
      const yn = Math.min(0.999, Math.max(0.501, h.maybeSnap(h.pxToYn(local.y), e)));
      const k = clamp01(1 - Math.log(yn) / LOG_HALF);
      commit({ curvature: Math.min(0.99, Math.max(0.01, k)) });
      setTip(`중간점 → ${h.formatB(yn)}`);
    },
    [commit],
  );

  return (
    <CurveEditorFrame edge={edge} onPointerMove={onMove} onReset={reset} tip={tip}>
      {(helpers) => {
        helpersRef.current = helpers;
        const d = curvePoints
          .map(
            (p, i) =>
              `${i === 0 ? 'M' : 'L'} ${helpers.xN2Px(p.x).toFixed(2)} ${helpers.yN2Px(p.y).toFixed(2)}`,
          )
          .join(' ');
        const hx = helpers.xN2Px(0.5);
        const hy = helpers.yN2Px(y50);
        return (
          <>
            <path d={d} className="trama-curve-line" />
            <line
              className="trama-curve-guide"
              x1={hx}
              y1={hy}
              x2={hx}
              y2={helpers.yN2Px(0)}
            />
            <CurveHandle
              cx={hx}
              cy={hy}
              onPointerDown={onHandleDown}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              label={helpers.formatB(y50)}
              labelOffset={{ dx: 0, dy: -12 }}
            />
          </>
        );
      }}
    </CurveEditorFrame>
  );
}
