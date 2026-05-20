import { useCallback, useRef } from 'react';
import { useTrama } from '../../store/index.js';
import { InteractiveArea } from '../../node/InteractiveArea.js';
import type { NumericSkinRenderProps } from '../types.js';

/**
 * 오븐 온도계 스킨 (50..300 °C, step 5).
 *
 * 베이킹·로스팅 도메인. 액체 칼럼이 아니라 **회전 다이얼** — 가스레인지 노브
 * 메타포. 트라마 노드가 원형이라는 사실과 모티프 정합.
 *
 * 레이아웃:
 *   - 상단 24px       : 라벨 슬롯
 *   - 원형 다이얼     : 50→300 °C가 호(arc)를 따라 매핑 (시작 -135°, 끝 +135°)
 *   - 눈금            : 25°C 마이너, 50°C 메이저, 도메인 마커(180/200/220/250) 진하게
 *   - 바늘            : 현재 값에 따라 회전
 *   - 중앙 값         : 큰 텍스트 + 상태 라벨("베이킹"/"로스팅")
 *   - 인터랙션        : 다이얼 자체가 핸들 (세로 드래그 → 각도 변환)
 */
export function ThermometerOven({
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

  // 다이얼 — 원 보더 안쪽. box.ts SKIN_LAYOUTS oven: r=130, cy=12.
  const cx = 0;
  const cy = 12;
  const outerR = Math.min(halfW, halfH - labelSlotH / 2) - 8;
  const tickInner = outerR - 14;
  const tickMajorOuter = outerR - 2;
  const tickMinorOuter = outerR - 7;
  const labelR = outerR - 26;
  const needleLen = outerR - 20;

  // 각도 매핑 — -135°(left-bottom) → +135°(right-bottom). 단위 원 270° 호.
  const ANGLE_START = -135;
  const ANGLE_END = 135;
  const ANGLE_SPAN = ANGLE_END - ANGLE_START;

  const range = unit.max - unit.min || 1;
  const ratio = Math.max(0, Math.min(1, (value - unit.min) / range));
  const angleDeg = ANGLE_START + ratio * ANGLE_SPAN;
  const angleRad = (angleDeg * Math.PI) / 180;
  const angleOf = (v: number): number => {
    const t = (v - unit.min) / range;
    return ((ANGLE_START + t * ANGLE_SPAN) * Math.PI) / 180;
  };

  // 눈금 — 5°C step 마이너, 25°C 메이저, 50°C 라벨.
  const minorTicks: number[] = [];
  const majorTicks: number[] = [];
  for (let v = Math.ceil(unit.min / 25) * 25; v <= unit.max; v += 25) {
    if (v % 50 === 0) majorTicks.push(v);
    else minorTicks.push(v);
  }

  // 도메인 마커 — 베이킹/로스팅 임계.
  const milestones: ReadonlyArray<{ v: number; label: string; cls: string }> = [
    { v: 180, label: '베이킹', cls: 'is-bake' },
    { v: 200, label: '쿠키', cls: 'is-cookie' },
    { v: 220, label: '피자', cls: 'is-pizza' },
    { v: 250, label: '로스팅', cls: 'is-roast' },
  ];

  // 현재 단계 라벨 — 가장 가까운 milestone.
  const currentMilestone =
    milestones
      .map((m) => ({ ...m, d: Math.abs(m.v - value) }))
      .sort((a, b) => a.d - b.d)[0] ?? null;
  const stateLabel =
    currentMilestone && currentMilestone.d < 25 ? currentMilestone.label : '예열';

  // 호 path — 50°C에서 300°C까지의 호.
  const arcStart = polar(angleOf(unit.min), outerR - 1);
  const arcEnd = polar(angleOf(unit.max), outerR - 1);
  const dialArc = `M ${arcStart.x} ${arcStart.y}
                   A ${outerR - 1} ${outerR - 1} 0 1 1 ${arcEnd.x} ${arcEnd.y}`;

  function polar(rad: number, radius: number): { x: number; y: number } {
    // 0° = up, 회전은 시계방향. 각도 0이 화면 위쪽이 되도록 한다.
    return {
      x: cx + Math.sin(rad) * radius,
      y: cy - Math.cos(rad) * radius,
    };
  }

  const dragRef = useRef<{
    startClientY: number;
    startRatio: number;
    zoom: number;
  } | null>(null);

  // 세로 드래그 → 회전. 노드 높이 1배 위로 끌면 100% 회전.
  const dragHeight = outerR * 2;
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
    'trama-skin-oven-dial' +
    (onScrub ? ' is-handle' : '') +
    (disabled ? ' is-disabled' : '');

  // 바늘 끝점.
  const needleEnd = polar(angleRad, needleLen);

  return (
    <g className="trama-skin-oven" aria-label={node.label}>
      <g pointerEvents="none">
        <text
          className="trama-skin-oven-name"
          x={0}
          y={labelCenterY + 5}
          textAnchor="middle"
        >
          {node.label}
        </text>

        {/* 다이얼 베이스 + 외곽 호. */}
        <circle
          className="trama-skin-oven-base"
          cx={cx}
          cy={cy}
          r={outerR}
        />
        <path className="trama-skin-oven-arc" d={dialArc} fill="none" />

        {/* 마이너 눈금 (5°C 간격 중 50의 배수가 아닌 25 step). */}
        <g className="trama-skin-oven-ticks-minor">
          {minorTicks.map((v) => {
            const a = angleOf(v);
            const p0 = polar(a, tickInner);
            const p1 = polar(a, tickMinorOuter);
            return (
              <line key={v} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} />
            );
          })}
        </g>
        {/* 메이저 눈금 + 숫자 라벨. */}
        <g className="trama-skin-oven-ticks-major">
          {majorTicks.map((v) => {
            const a = angleOf(v);
            const p0 = polar(a, tickInner - 2);
            const p1 = polar(a, tickMajorOuter);
            const pl = polar(a, labelR);
            return (
              <g key={v}>
                <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} />
                <text
                  className="trama-skin-oven-tick-label"
                  x={pl.x}
                  y={pl.y + 4}
                  textAnchor="middle"
                >
                  {v}
                </text>
              </g>
            );
          })}
        </g>

        {/* 도메인 마커 — 호 외곽 가까이에 색 점. */}
        <g className="trama-skin-oven-milestones">
          {milestones.map((m) => {
            const a = angleOf(m.v);
            const p = polar(a, outerR + 6);
            return (
              <circle key={m.v} className={`trama-skin-oven-milestone-dot ${m.cls}`} cx={p.x} cy={p.y} r={3} />
            );
          })}
        </g>

        {/* 바늘. */}
        <g className="trama-skin-oven-needle">
          <line
            x1={cx}
            y1={cy}
            x2={needleEnd.x}
            y2={needleEnd.y}
          />
          <circle className="trama-skin-oven-pivot" cx={cx} cy={cy} r={6} />
        </g>

        {/* 중앙 값 + 상태 라벨. */}
        <text
          className="trama-skin-oven-value"
          x={cx}
          y={cy + 34}
          textAnchor="middle"
        >
          {Math.round(value)}°
        </text>
        <text
          className="trama-skin-oven-state"
          x={cx}
          y={cy + 54}
          textAnchor="middle"
        >
          {stateLabel}
        </text>
      </g>

      {onLabelClick && (
        <InteractiveArea
          x={-halfW}
          y={-halfH}
          width={halfW * 2}
          height={labelSlotH}
          hitClassName="trama-skin-oven-name-hit"
          onClick={onLabelClick}
        />
      )}

      {/* 다이얼 내부가 핸들. */}
      <g
        className={wrapperClass}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: onScrub ? 'ns-resize' : 'default' }}
      >
        <circle cx={cx} cy={cy} r={outerR - 4} fill="transparent" />
      </g>
    </g>
  );
}
