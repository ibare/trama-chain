import { useCallback, useId, useRef } from 'react';
import { isNumericValue, type ValueNode } from '@trama/core';
import { useTrama } from '../store/index.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';

interface DragState {
  startClientX: number;
  startValue: number;
  zoom: number;
  lastValue: number;
}

export type ValueNodeSliderMode = 'standard' | 'compact';

interface Props {
  node: ValueNode;
  halfW: number;
  /** 슬라이더 세로 중심선 y. 노드 중심 기준. */
  sliderY: number;
  mode: ValueNodeSliderMode;
}

// 모드별 좌·우 inset — 슬라이더 가시 폭 = (2*halfW - 2*sideInset) * scale.
// scale 은 전체 비례 균일 축소용 — ratio 가 sliderW 기준이라 sliderW 만 줄이면
// 캡슐·트랙·thumb 모두 따라 축소된다.
const STANDARD_SIDE_INSET = 18;
const COMPACT_SIDE_INSET = 18;
const STANDARD_SCALE = 0.85;
const COMPACT_SCALE = 1.0;

// 시안(viewBox 289×62) 비례 — 슬라이더 가시 폭(sliderW) 기준.
const CAPSULE_H_RATIO = 29 / 289;
const CAPSULE_RX_RATIO = 14.5 / 289;
const TRACK_INSET_RATIO = 12 / 289;
const TRACK_H_RATIO = 6 / 289;
const TRACK_RX_RATIO = 3 / 289;
const THUMB_W_RATIO = 89 / 289;
const THUMB_H_RATIO = 46 / 289;
const THUMB_RX_RATIO = 23 / 289;
const THUMB_INNER_INSET_RATIO = 7 / 289;
const THUMB_INNER_RX_RATIO = 17.5 / 289;

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

export function ValueNodeSlider({ node, halfW, sliderY, mode }: Props): JSX.Element | null {
  const { modelStore, viewport } = useTrama();
  const scrubInitialValue = modelStore((s) => s.scrubInitialValue);
  const emitValueOutput = modelStore((s) => s.emitValueOutput);
  const unit = resolveNodeUnit(node);
  const { min, max, step } = boundsForSlider(unit);
  const range = max - min;
  // boolean ValueNode 는 별도 토글 위젯이 그려지므로 여기는 numeric 만.
  const numericInitial = isNumericValue(node.initialValue) ? node.initialValue.n : null;
  const value = numericInitial ?? 0;

  const sideInset = mode === 'standard' ? STANDARD_SIDE_INSET : COMPACT_SIDE_INSET;
  const scale = mode === 'standard' ? STANDARD_SCALE : COMPACT_SCALE;
  const sliderW = (2 * halfW - 2 * sideInset) * scale;

  const capsuleH = sliderW * CAPSULE_H_RATIO;
  const capsuleRx = sliderW * CAPSULE_RX_RATIO;
  const trackInset = sliderW * TRACK_INSET_RATIO;
  const trackH = sliderW * TRACK_H_RATIO;
  const trackRx = sliderW * TRACK_RX_RATIO;
  const thumbW = sliderW * THUMB_W_RATIO;
  const thumbH = sliderW * THUMB_H_RATIO;
  const thumbRx = sliderW * THUMB_RX_RATIO;
  const thumbInnerInset = sliderW * THUMB_INNER_INSET_RATIO;
  const thumbInnerRx = sliderW * THUMB_INNER_RX_RATIO;

  const trackLen = sliderW - 2 * trackInset;
  const trackLeft = -trackLen / 2;
  const norm = range > 0 ? clamp((value - min) / range, 0, 1) : 0;
  const handleX = trackLeft + norm * trackLen;

  // <defs> 내부 id 충돌 방지 — React useId 로 노드/인스턴스별 unique prefix.
  const uid = useId().replace(/:/g, '');
  const idCapsule = `trama-slider-${uid}-capsule`;
  const idRest = `trama-slider-${uid}-rest`;
  const idFill = `trama-slider-${uid}-fill`;
  const idDrop = `trama-slider-${uid}-drop`;
  const idInner = `trama-slider-${uid}-inner`;

  const dragRef = useRef<DragState | null>(null);

  const applyClientX = useCallback(
    (clientX: number, d: DragState) => {
      if (trackLen <= 0 || range <= 0) return;
      const dxCanvas = (clientX - d.startClientX) / d.zoom;
      const dNorm = dxCanvas / trackLen;
      const raw = d.startValue + dNorm * range;
      const snapped = snap(clamp(raw, min, max), step);
      // drag 중에는 박제만 — 다운스트림 펄스는 pointerup 의 emitValueOutput 한 번.
      if (snapped !== d.lastValue) {
        d.lastValue = snapped;
        scrubInitialValue(node.id, snapped);
      }
    },
    [max, min, node.id, range, scrubInitialValue, step, trackLen],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startClientX: e.clientX,
        startValue: value,
        zoom: viewport.getCurrentZoom(),
        lastValue: value,
      };
    },
    [value, viewport],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      e.stopPropagation();
      const d = dragRef.current;
      if (!d) return;
      applyClientX(e.clientX, d);
    },
    [applyClientX],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      const d = dragRef.current;
      dragRef.current = null;
      if (d && d.lastValue !== d.startValue) emitValueOutput(node.id);
    },
    [emitValueOutput, node.id],
  );

  if (numericInitial === null || range <= 0 || trackLen <= 0 || sliderW <= 0) return null;

  const capsuleX = -sliderW / 2;
  const capsuleY = sliderY - capsuleH / 2;
  const trackY = sliderY - trackH / 2;
  const thumbOuterX = handleX - thumbW / 2;
  const thumbOuterY = sliderY - thumbH / 2;
  const thumbInnerX = thumbOuterX + thumbInnerInset;
  const thumbInnerY = thumbOuterY + thumbInnerInset;
  const thumbInnerW = thumbW - thumbInnerInset * 2;
  const thumbInnerH = thumbH - thumbInnerInset * 2;
  // hit-rect — thumb 가 캡슐 위아래로 튀어나오므로 thumbH 가 hit 세로 풋프린트.
  const hitH = Math.max(thumbH, capsuleH);

  return (
    <g className="trama-value-slider">
      <defs>
        <linearGradient
          id={idCapsule}
          x1={0}
          y1={capsuleY + capsuleH}
          x2={0}
          y2={capsuleY}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset={0.4567} stopColor="var(--color-slider-capsule-bg-start)" />
          <stop offset={1} stopColor="var(--color-slider-capsule-bg-end)" />
        </linearGradient>
        <linearGradient
          id={idRest}
          x1={trackLeft}
          y1={0}
          x2={-trackLeft}
          y2={0}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset={0} stopColor="var(--color-slider-track-rest-start)" />
          <stop offset={0.4567} stopColor="var(--color-slider-track-rest-end)" />
        </linearGradient>
        <linearGradient
          id={idFill}
          x1={trackLeft}
          y1={0}
          x2={handleX}
          y2={0}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset={0} stopColor="var(--color-slider-track-fill-start)" />
          <stop offset={0.4567} stopColor="var(--color-slider-track-fill-end)" />
        </linearGradient>
        <filter id={idDrop} x="-20%" y="-20%" width="140%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation={4} />
          <feOffset dy={4} />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.25 0"
            result="dropColored"
          />
          <feMerge>
            <feMergeNode in="dropColored" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={idInner} x="-10%" y="-10%" width="120%" height="130%">
          <feGaussianBlur in="SourceAlpha" stdDeviation={4} />
          <feOffset dy={4} />
          <feComposite in2="SourceAlpha" operator="arithmetic" k2={-1} k3={1} result="innerCut" />
          <feColorMatrix
            in="innerCut"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0"
            result="innerColored"
          />
          <feComposite in="innerColored" in2="SourceGraphic" operator="over" />
        </filter>
      </defs>
      <rect
        className="trama-value-slider-capsule"
        x={capsuleX}
        y={capsuleY}
        width={sliderW}
        height={capsuleH}
        rx={capsuleRx}
        ry={capsuleRx}
        fill={`url(#${idCapsule})`}
      />
      <rect
        className="trama-value-slider-track-rest"
        x={trackLeft}
        y={trackY}
        width={trackLen}
        height={trackH}
        rx={trackRx}
        ry={trackRx}
        fill={`url(#${idRest})`}
      />
      <rect
        className="trama-value-slider-track-fill"
        x={trackLeft}
        y={trackY}
        width={Math.max(0, handleX - trackLeft)}
        height={trackH}
        rx={trackRx}
        ry={trackRx}
        fill={`url(#${idFill})`}
      />
      <rect
        className="trama-value-slider-thumb-outer"
        x={thumbOuterX}
        y={thumbOuterY}
        width={thumbW}
        height={thumbH}
        rx={thumbRx}
        ry={thumbRx}
        filter={`url(#${idDrop})`}
      />
      <rect
        className="trama-value-slider-thumb-inner"
        x={thumbInnerX}
        y={thumbInnerY}
        width={thumbInnerW}
        height={thumbInnerH}
        rx={thumbInnerRx}
        ry={thumbInnerRx}
        filter={`url(#${idInner})`}
      />
      <rect
        className="trama-value-slider-hit"
        x={-sliderW / 2}
        y={sliderY - hitH / 2}
        width={sliderW}
        height={hitH}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </g>
  );
}
