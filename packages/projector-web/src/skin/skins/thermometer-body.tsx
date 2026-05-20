import { useCallback, useRef } from 'react';
import { useTrama } from '../../store/index.js';
import { InteractiveArea } from '../../node/InteractiveArea.js';
import type { NumericSkinRenderProps } from '../types.js';

/**
 * 체온계 스킨 (35.0..42.0 °C, 0.1 step).
 *
 * 임상 도메인 — 발열 진단. 액체 캡슐이 아니라 **digital LCD readout + 발열 단계 색
 * 밴드**가 권위. 0.1°C 단위 정밀도가 색·라벨로 즉시 읽힌다.
 *
 * 레이아웃:
 *   - 상단 24px           : 라벨 + InteractiveArea (인스펙터 진입)
 *   - 중앙 LCD 텍스트     : 큰 monospace 숫자 (예: 37.2°)
 *   - 그 아래 색 밴드     : 5단계 가로 스트립 — 저체온/정상/미열/발열/고열
 *   - 밴드 위 needle      : 현재 값 위치
 *   - 하단 상태 칩        : "정상"·"미열"·"발열"·"고열"
 *   - 인터랙션            : 색 밴드 자체가 슬라이더 (좌우 드래그)
 */
export function ThermometerBody({
  node,
  value,
  unit,
  halfW,
  halfH,
  onScrub,
  disabled,
  onLabelClick,
}: NumericSkinRenderProps): JSX.Element {
  const { viewport } = useTrama();
  const labelSlotH = 24;
  const labelCenterY = -halfH + labelSlotH / 2;

  // LCD 영역 — 라벨 슬롯 바로 아래.
  const lcdTop = -halfH + labelSlotH + 8;
  const lcdW = 168;
  const lcdH = 64;
  const lcdX = -lcdW / 2;

  // 색 밴드 — LCD 아래.
  const bandTop = lcdTop + lcdH + 18;
  const bandW = 184;
  const bandH = 14;
  const bandX = -bandW / 2;

  // 상태 칩 — 밴드 아래.
  const chipTop = bandTop + bandH + 12;

  const range = unit.max - unit.min || 1;
  const ratio = Math.max(0, Math.min(1, (value - unit.min) / range));
  const needleX = bandX + ratio * bandW;

  // 발열 단계 매핑 — 35.0~36.4 저체온, 36.5~37.4 정상, 37.5~38.4 미열,
  // 38.5~39.9 발열, 40.0+ 고열.
  const stages: ReadonlyArray<{
    from: number;
    to: number;
    color: string;
    label: string;
    chipClass: string;
  }> = [
    { from: 35.0, to: 36.4, color: '#7fa3c6', label: '저체온', chipClass: 'is-cool' },
    { from: 36.5, to: 37.4, color: '#7cb86a', label: '정상', chipClass: 'is-normal' },
    { from: 37.5, to: 38.4, color: '#e6c45c', label: '미열', chipClass: 'is-warm' },
    { from: 38.5, to: 39.9, color: '#e8964a', label: '발열', chipClass: 'is-fever' },
    { from: 40.0, to: 42.0, color: '#d04a3a', label: '고열', chipClass: 'is-hot' },
  ];
  const currentStage = stages.find((s) => value <= s.to) ?? stages[stages.length - 1]!;

  // 색 밴드 — 5개 인접 세그먼트.
  const segments = stages.map((s) => {
    const x0 = bandX + ((s.from - unit.min) / range) * bandW;
    const x1 = bandX + ((Math.min(s.to, unit.max) - unit.min) / range) * bandW;
    return { x: x0, w: x1 - x0, color: s.color, label: s.label };
  });

  // 임계 마커 — 38.0°C (발열 시작) 굵은 세로선.
  const feverMarkerX = bandX + ((38.0 - unit.min) / range) * bandW;

  // value 표시 — 한 자리 소수점 고정.
  const valueLabel = `${value.toFixed(1)}°`;

  const dragRef = useRef<{
    startClientX: number;
    startRatio: number;
    zoom: number;
  } | null>(null);

  const applyDelta = useCallback(
    (clientX: number) => {
      const d = dragRef.current;
      if (!d || !onScrub || bandW <= 0) return;
      const dxCanvas = (clientX - d.startClientX) / d.zoom;
      const dNorm = dxCanvas / bandW;
      const rawRatio = Math.max(0, Math.min(1, d.startRatio + dNorm));
      const raw = unit.min + rawRatio * range;
      const step = unit.step > 0 ? unit.step : 0;
      const snapped = step > 0 ? Math.round(raw / step) * step : raw;
      const clamped = Math.max(unit.min, Math.min(unit.max, snapped));
      onScrub(clamped);
    },
    [onScrub, range, unit.max, unit.min, unit.step],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!onScrub) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startClientX: e.clientX,
        startRatio: ratio,
        zoom: viewport.getCurrentZoom(),
      };
    },
    [onScrub, ratio, viewport],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!dragRef.current) return;
      applyDelta(e.clientX);
    },
    [applyDelta],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<SVGGElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  }, []);

  const handleClass =
    'trama-skin-body-band' +
    (onScrub ? ' is-handle' : '') +
    (disabled ? ' is-disabled' : '');

  return (
    <g className="trama-skin-body" aria-label={node.label}>
      <g pointerEvents="none">
        <text
          className="trama-skin-body-name"
          x={0}
          y={labelCenterY + 5}
          textAnchor="middle"
        >
          {node.label}
        </text>

        {/* LCD 패널 — 어두운 무광 배경 + 큰 모노 숫자. */}
        <rect
          className="trama-skin-body-lcd-bg"
          x={lcdX}
          y={lcdTop}
          width={lcdW}
          height={lcdH}
          rx={10}
          ry={10}
        />
        <text
          className="trama-skin-body-lcd-value"
          x={0}
          y={lcdTop + lcdH / 2 + 14}
          textAnchor="middle"
          style={{ fill: currentStage.color }}
        >
          {valueLabel}
        </text>

        {/* 색 밴드 (visual layer) — interactive layer는 아래에 별도. */}
        <g>
          {segments.map((s, i) => (
            <rect
              key={i}
              className="trama-skin-body-band-seg"
              x={s.x}
              y={bandTop}
              width={s.w}
              height={bandH}
              rx={bandH / 2}
              ry={bandH / 2}
              fill={s.color}
            />
          ))}
        </g>

        {/* 38°C 발열 임계선. */}
        <line
          className="trama-skin-body-fever-mark"
          x1={feverMarkerX}
          x2={feverMarkerX}
          y1={bandTop - 4}
          y2={bandTop + bandH + 4}
        />

        {/* 현재 값 needle — 위에서 아래로 내려오는 삼각형. */}
        <g transform={`translate(${needleX},${bandTop})`}>
          <path
            className="trama-skin-body-needle"
            d="M 0 -6 L -5 -14 L 5 -14 Z"
          />
          <line
            className="trama-skin-body-needle-line"
            x1={0}
            x2={0}
            y1={-6}
            y2={bandH + 6}
          />
        </g>

        {/* 상태 칩. */}
        <g transform={`translate(0,${chipTop})`}>
          <rect
            className={`trama-skin-body-chip ${currentStage.chipClass}`}
            x={-32}
            y={-12}
            width={64}
            height={24}
            rx={12}
            ry={12}
          />
          <text
            className="trama-skin-body-chip-text"
            x={0}
            y={4}
            textAnchor="middle"
          >
            {currentStage.label}
          </text>
        </g>
      </g>

      {onLabelClick && (
        <InteractiveArea
          x={-lcdW / 2}
          y={-halfH}
          width={lcdW}
          height={labelSlotH}
          hitClassName="trama-skin-body-name-hit"
          onClick={onLabelClick}
        />
      )}

      {/* 색 밴드가 직접 슬라이더 — drag scrub. */}
      <g
        className={handleClass}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: onScrub ? 'ew-resize' : 'default' }}
      >
        <rect
          x={bandX - 4}
          y={bandTop - 8}
          width={bandW + 8}
          height={bandH + 16}
          fill="transparent"
        />
      </g>
    </g>
  );
}
