import { useCallback, useRef } from 'react';
import type { ValueNode } from '@trama/core';
import { useTrama } from '../store/index.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';

interface Props {
  node: ValueNode;
  halfW: number;
  /** 트랙(슬라이더)의 y 좌표. 노드 안쪽 하단 padding 지점. */
  trackY: number;
}

const TRACK_INSET = 18;
const HANDLE_RADIUS = 9;
const HIT_HEIGHT = 22;

interface SliderBounds {
  min: number;
  max: number;
  step: number;
}

function boundsForSlider(unit: ReturnType<typeof resolveNodeUnit>): SliderBounds {
  if (unit.kind === 'label') {
    return { min: 0, max: Math.max(0, unit.labels.length - 1), step: 1 };
  }
  if (unit.kind === 'free') {
    return { min: 0, max: 1, step: 0.01 };
  }
  return { min: unit.min, max: unit.max, step: unit.step };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function snap(v: number, step: number): number {
  if (step <= 0) return v;
  return Math.round(v / step) * step;
}

export function NodeBorderTrack({ node, halfW, trackY }: Props): JSX.Element | null {
  const { modelStore, viewport } = useTrama();
  const scrubInitialValue = modelStore((s) => s.scrubInitialValue);
  const unit = resolveNodeUnit(node);
  const { min, max, step } = boundsForSlider(unit);
  const range = max - min;
  const value = node.initialValue;

  const trackLen = 2 * halfW - 2 * TRACK_INSET;
  const trackLeft = -trackLen / 2;
  const trackRight = trackLen / 2;

  const norm = range > 0 ? clamp((value - min) / range, 0, 1) : 0;
  const handleX = trackLeft + norm * trackLen;

  const dragRef = useRef<{
    startClientX: number;
    startValue: number;
    zoom: number;
  } | null>(null);

  const applyClientX = useCallback(
    (clientX: number, startClientX: number, startValue: number, zoom: number) => {
      if (trackLen <= 0 || range <= 0) return;
      const dxCanvas = (clientX - startClientX) / zoom;
      const dNorm = dxCanvas / trackLen;
      const raw = startValue + dNorm * range;
      const snapped = snap(clamp(raw, min, max), step);
      if (snapped !== node.initialValue) scrubInitialValue(node.id, snapped);
    },
    [max, min, node.id, node.initialValue, range, scrubInitialValue, step, trackLen],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startClientX: e.clientX,
        startValue: value,
        zoom: viewport.getCurrentZoom(),
      };
    },
    [value, viewport],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const d = dragRef.current;
      if (!d) return;
      applyClientX(e.clientX, d.startClientX, d.startValue, d.zoom);
    },
    [applyClientX],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<SVGRectElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  }, []);

  if (range <= 0 || trackLen <= 0) return null;

  return (
    <g className="trama-node-track" pointerEvents="auto">
      <line
        className="trama-node-track-rest"
        x1={trackLeft}
        x2={trackRight}
        y1={trackY}
        y2={trackY}
      />
      <line
        className="trama-node-track-fill"
        x1={trackLeft}
        x2={handleX}
        y1={trackY}
        y2={trackY}
      />
      <circle
        className="trama-node-track-handle"
        cx={handleX}
        cy={trackY}
        r={HANDLE_RADIUS}
      />
      <rect
        className="trama-node-track-hit"
        x={trackLeft - HANDLE_RADIUS}
        y={trackY - HIT_HEIGHT / 2}
        width={trackLen + HANDLE_RADIUS * 2}
        height={HIT_HEIGHT}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </g>
  );
}
