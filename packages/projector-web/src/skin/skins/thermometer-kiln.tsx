import { useCallback, useId, useRef } from 'react';
import { useTrama } from '../../store/index.js';
import { InteractiveArea } from '../../node/InteractiveArea.js';
import type { SkinRenderProps } from '../types.js';

/**
 * 흑체복사 가마 스킨 (500..1500 °C).
 *
 * 도자기 가마·금속 단조 영역. 색=온도라는 물리법칙 그대로 — 노드의 공통 원형
 * 보더가 **흑체복사 스펙트럼**으로 빛난다. 600°C 적열, 1000°C 등황, 1300°C
 * 노랑, 1500°C 백열.
 *
 * 기구(칼럼·다이얼)가 없다. 노드 자체가 달궈진 물체. 가장 trama스러운 메타포.
 *
 * 레이아웃:
 *   - 상단 24px       : 라벨 슬롯 (InteractiveArea로 인스펙터 진입)
 *   - 원형 핵         : 보더 stroke가 온도색으로 발광, 그 안에 큰 값 텍스트
 *   - 인터랙션        : 원 안쪽 영역 자체가 슬라이더 (세로 드래그)
 */
export function ThermometerKiln({
  node,
  value,
  unit,
  halfW,
  halfH,
  onScrub,
  disabled,
  onLabelClick,
}: SkinRenderProps): JSX.Element {
  const { viewport } = useTrama();
  const uid = useId().replace(/[:#]/g, '');

  const labelSlotH = 24;
  const labelCenterY = -halfH + labelSlotH / 2;

  // 원 중심·반경 — box.ts SKIN_LAYOUTS와 일치 (cy=12, r≈90).
  const cx = 0;
  const cy = 12;
  const r = Math.min(halfW, halfH - labelSlotH / 2) - 6;

  const range = unit.max - unit.min || 1;
  const ratio = Math.max(0, Math.min(1, (value - unit.min) / range));

  // 흑체복사 색 매핑 — 값에 따른 보더 색. 다소 도식화된 색온도(°C → RGB) 표.
  const colorStops: ReadonlyArray<{ v: number; c: string }> = [
    { v: 500, c: '#3a1208' },
    { v: 700, c: '#7a1d0a' },
    { v: 850, c: '#b13312' },
    { v: 1000, c: '#dd5a18' },
    { v: 1150, c: '#ec8a20' },
    { v: 1300, c: '#f3b73a' },
    { v: 1450, c: '#fce6a0' },
    { v: 1500, c: '#ffffff' },
  ];
  // 현재 값에 해당하는 색 — 두 stop 사이 lerp.
  const lerpColor = (v: number): string => {
    for (let i = 0; i < colorStops.length - 1; i++) {
      const a = colorStops[i]!;
      const b = colorStops[i + 1]!;
      if (v <= b.v) {
        const t = (v - a.v) / (b.v - a.v || 1);
        return mixHex(a.c, b.c, Math.max(0, Math.min(1, t)));
      }
    }
    return colorStops[colorStops.length - 1]!.c;
  };
  const currentColor = lerpColor(value);
  // glow 강도 — 600°C 미만 약함, 1300°C 이상 강함.
  const glowAlpha = Math.max(0.1, Math.min(0.85, ratio * 0.95 + 0.05));

  // 텍스트 색 — 보색 자동: 1100°C 이하 흰색, 위는 짙은 색.
  const textFill = value < 1100 ? '#ffffff' : '#2a1505';

  // 도메인 임계 — 850(자기 굽기), 1100(자기 본소성), 1300(단조 가능).
  const milestones: ReadonlyArray<{ v: number; label: string }> = [
    { v: 850, label: '소성' },
    { v: 1100, label: '본소성' },
    { v: 1300, label: '단조' },
  ];

  // 다음/이전 milestone에서 얼마나 떨어졌는지 — 보조 라벨.
  const nearest =
    milestones
      .map((m) => ({ ...m, d: Math.abs(m.v - value) }))
      .sort((a, b) => a.d - b.d)[0] ?? null;
  const milestoneLabel = nearest && nearest.d < 80 ? nearest.label : '';

  const dragRef = useRef<{
    startClientY: number;
    startRatio: number;
    zoom: number;
  } | null>(null);

  const dragHeight = r * 2;
  const applyDelta = useCallback(
    (clientY: number) => {
      const d = dragRef.current;
      if (!d || !onScrub || dragHeight <= 0) return;
      const dyCanvas = (clientY - d.startClientY) / d.zoom;
      const dNorm = -dyCanvas / dragHeight;
      const rawRatio = Math.max(0, Math.min(1, d.startRatio + dNorm));
      const raw = unit.min + rawRatio * range;
      const step = unit.step > 0 ? unit.step : 0;
      const snapped = step > 0 ? Math.round(raw / step) * step : raw;
      const clamped = Math.max(unit.min, Math.min(unit.max, snapped));
      onScrub(clamped);
    },
    [dragHeight, onScrub, range, unit.max, unit.min, unit.step],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!onScrub) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startClientY: e.clientY,
        startRatio: ratio,
        zoom: viewport.getCurrentZoom(),
      };
    },
    [onScrub, ratio, viewport],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!dragRef.current) return;
      applyDelta(e.clientY);
    },
    [applyDelta],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<SVGGElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  }, []);

  const wrapperClass =
    'trama-skin-kiln-core' +
    (onScrub ? ' is-handle' : '') +
    (disabled ? ' is-disabled' : '');

  return (
    <g className="trama-skin-kiln" aria-label={node.label}>
      <defs>
        {/* radial gradient — 중심은 currentColor의 hot 톤, 가장자리는 약간 어둡게 */}
        <radialGradient id={`kiln-fill-${uid}`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={currentColor} stopOpacity={glowAlpha} />
          <stop offset="100%" stopColor={currentColor} stopOpacity={glowAlpha * 0.55} />
        </radialGradient>
        <filter id={`kiln-glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g pointerEvents="none">
        <text
          className="trama-skin-kiln-name"
          x={0}
          y={labelCenterY + 5}
          textAnchor="middle"
        >
          {node.label}
        </text>

        {/* 발광 핵 — 흐릿한 외각 + 선명한 보더 + 안쪽 fill. */}
        <circle
          className="trama-skin-kiln-aura"
          cx={cx}
          cy={cy}
          r={r + 4}
          fill={currentColor}
          opacity={glowAlpha * 0.35}
          filter={`url(#kiln-glow-${uid})`}
        />
        <circle
          className="trama-skin-kiln-body"
          cx={cx}
          cy={cy}
          r={r}
          fill={`url(#kiln-fill-${uid})`}
          stroke={currentColor}
          strokeWidth={2.5}
        />

        {/* 값 텍스트 — 중앙. */}
        <text
          className="trama-skin-kiln-value"
          x={cx}
          y={cy + 6}
          textAnchor="middle"
          style={{ fill: textFill }}
        >
          {Math.round(value)}°
        </text>
        {milestoneLabel && (
          <text
            className="trama-skin-kiln-milestone"
            x={cx}
            y={cy + 26}
            textAnchor="middle"
            style={{ fill: textFill, opacity: 0.7 }}
          >
            {milestoneLabel}
          </text>
        )}
      </g>

      {onLabelClick && (
        <InteractiveArea
          x={-halfW}
          y={-halfH}
          width={halfW * 2}
          height={labelSlotH}
          hitClassName="trama-skin-kiln-name-hit"
          onClick={onLabelClick}
        />
      )}

      {/* 원 안쪽이 그대로 슬라이더 (세로 드래그). */}
      <g
        className={wrapperClass}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: onScrub ? 'ns-resize' : 'default' }}
      >
        <circle cx={cx} cy={cy} r={r - 4} fill="transparent" />
      </g>
    </g>
  );
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(c: string): [number, number, number] {
  const s = c.replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}
