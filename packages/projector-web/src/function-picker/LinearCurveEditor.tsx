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

interface LinearParams {
  slope: number;
  offset: number;
}

const DEFAULTS: LinearParams = { slope: 1, offset: 0 };

/**
 * y = clamp01(slope * x + offset) 그래프를 시작점·끝점 두 핸들로 편집.
 *
 *  - 시작 핸들 (x=0)   ↔ y0 = offset
 *  - 끝   핸들 (x=1)   ↔ y1 = slope + offset
 *
 * 핸들을 끌면 (offset, slope) = (y0, y1 - y0)로 재계산.
 */
export function LinearCurveEditor({ edge }: Props): JSX.Element | null {
  const params = edge.shape.params as Partial<LinearParams>;
  const slope = typeof params.slope === 'number' ? params.slope : DEFAULTS.slope;
  const offset = typeof params.offset === 'number' ? params.offset : DEFAULTS.offset;

  const commit = useShapeCommit<LinearParams>(edge);
  const reset = useShapeReset(edge, DEFAULTS as unknown as Record<string, unknown>);

  const dragRef = useRef<'start' | 'end' | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const helpersRef = useRef<CurveEditorHelpers | null>(null);

  const y0 = clamp01(offset);
  const y1 = clamp01(slope + offset);

  const onHandleDown = (which: 'start' | 'end') => (e: React.PointerEvent<SVGCircleElement>) => {
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
      const yn = h.maybeSnap(h.pxToYn(local.y), e);
      if (which === 'start') {
        // y0 = yn, y1 유지 → offset = yn, slope = (slope+offset) - yn
        const keptY1 = clamp01(slope + offset);
        commit({ offset: yn, slope: keptY1 - yn });
        setTip(`시작점 → ${h.formatB(yn)}`);
      } else {
        // y1 = yn, y0 유지 → slope = yn - offset
        commit({ slope: yn - offset });
        setTip(`끝점 → ${h.formatB(yn)}`);
      }
    },
    [commit, offset, slope],
  );

  return (
    <CurveEditorFrame edge={edge} onPointerMove={onMove} onReset={reset} tip={tip}>
      {(helpers) => {
        helpersRef.current = helpers;
        const xStart = helpers.xN2Px(0);
        const xEnd = helpers.xN2Px(1);
        const yStart = helpers.yN2Px(y0);
        const yEnd = helpers.yN2Px(y1);
        return (
          <>
            <path
              d={`M ${xStart} ${yStart} L ${xEnd} ${yEnd}`}
              className="trama-curve-line"
            />
            <CurveHandle
              cx={xStart}
              cy={yStart}
              onPointerDown={onHandleDown('start')}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              label={helpers.formatB(y0)}
              labelOffset={{ dx: 14, dy: -10 }}
            />
            <CurveHandle
              cx={xEnd}
              cy={yEnd}
              onPointerDown={onHandleDown('end')}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              label={helpers.formatB(y1)}
              labelOffset={{ dx: -14, dy: -10 }}
            />
          </>
        );
      }}
    </CurveEditorFrame>
  );
}
