import { useCallback, useId, useRef } from 'react';
import { useTrama } from '../../store/index.js';
import { formatNodeValue } from '../../util/format.js';
import { InteractiveArea } from '../../node/InteractiveArea.js';
import type { SkinRenderProps } from '../types.js';

/**
 * 극저온 영역 전문 온도계 (−273..−100 °C).
 *
 * 액체질소(−196), 액체헬륨(−269), 절대영도(−273.15) 같은 과학 임계점을
 * 트랙 위 가로선으로 각인한다. 상온 온도계와 같은 캡슐 메타포지만 팔레트가
 * 짙은 청보라~검정 — 차가움의 권위.
 *
 * 캡슐 주변에 작은 frost 점들을 흩뿌려 결빙 분위기. 좌측 말풍선은 자체가
 * 슬라이더 핸들 (드래그로 값 변경).
 */
export function ThermometerCryogenic({
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

  const capsuleW = 64;
  const capsuleH = halfH * 2 - labelSlotH;
  const capsuleHalfW = capsuleW / 2;
  const capsuleTop = -halfH + labelSlotH;
  const tubeX = -capsuleHalfW + 8;
  const tubeW = capsuleW - 16;
  const tubeY = capsuleTop + 6;
  const tubeH = capsuleH - 12;
  const tubeR = tubeW / 2;

  const innerTop = tubeY + tubeR;
  const innerH = tubeH - tubeR * 2;
  const range = unit.max - unit.min || 1;
  const ratio = Math.max(0, Math.min(1, (value - unit.min) / range));
  const surfaceY = innerTop + (1 - ratio) * innerH;

  // 극저온 팔레트 — 위쪽(−100 °C)이 밝은 청, 아래쪽(−273 °C)이 거의 검정.
  const colorStops: ReadonlyArray<{ v: number; c: string }> = [
    { v: -273, c: '#0a0e1f' },
    { v: -250, c: '#141b3a' },
    { v: -200, c: '#1f2a55' },
    { v: -150, c: '#324275' },
    { v: -100, c: '#5b7ab3' },
  ];
  const offsetOf = (v: number): number =>
    Math.max(0, Math.min(1, (v - unit.min) / range));

  // 도메인 임계선들 — 트랙 위 가로 마커.
  const criticalLines: ReadonlyArray<{ v: number; label: string }> = [
    { v: -196, label: 'LN₂' },
    { v: -269, label: 'LHe' },
    { v: -273.15, label: '0K' },
  ].filter((l) => l.v >= unit.min && l.v <= unit.max);
  const yOfValue = (v: number): number =>
    innerTop + (1 - (v - unit.min) / range) * innerH;

  // frost 점들 — 캡슐 양옆에 결정형 흩뿌림. seed-determinisitic (uid 기반은 아니지만
  // useId가 컴포넌트 인스턴스당 stable이라 같은 노드는 같은 패턴).
  const frostCount = 18;
  const frostSeed = uid
    .split('')
    .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 7);
  const frostParticles = Array.from({ length: frostCount }, (_, i) => {
    const a = ((frostSeed >>> i) ^ (i * 73)) & 0xff;
    const b = ((frostSeed >>> (i + 3)) ^ (i * 131)) & 0xff;
    const c = ((frostSeed >>> (i + 7)) ^ (i * 17)) & 0xff;
    const side = i % 2 === 0 ? -1 : 1;
    const dx = side * (capsuleHalfW + 6 + (a / 255) * 28);
    const dy = capsuleTop + 12 + (b / 255) * (capsuleH - 24);
    const r = 0.8 + (c / 255) * 1.4;
    return { dx, dy, r };
  });

  const f = formatNodeValue(value, unit);
  const valueLabel = `${f.primary}°`;

  const bubbleW = 64;
  const bubbleH = 30;
  const bubbleRightX = tubeX - 6;
  const bubbleCx = bubbleRightX - bubbleW / 2;

  const dragRef = useRef<{
    startClientY: number;
    startRatio: number;
    zoom: number;
  } | null>(null);

  const applyDelta = useCallback(
    (clientY: number) => {
      const d = dragRef.current;
      if (!d || !onScrub || innerH <= 0) return;
      const dyCanvas = (clientY - d.startClientY) / d.zoom;
      const dNorm = -dyCanvas / innerH;
      const rawRatio = Math.max(0, Math.min(1, d.startRatio + dNorm));
      const raw = unit.min + rawRatio * range;
      const step = unit.step > 0 ? unit.step : 0;
      const snapped = step > 0 ? Math.round(raw / step) * step : raw;
      const clamped = Math.max(unit.min, Math.min(unit.max, snapped));
      onScrub(clamped);
    },
    [innerH, onScrub, range, unit.max, unit.min, unit.step],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!onScrub) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
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
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  }, []);

  const bubbleClass =
    'trama-skin-cryo-bubble' +
    (onScrub ? ' is-handle' : '') +
    (disabled ? ' is-disabled' : '');

  return (
    <g className="trama-skin-cryo" aria-label={node.label}>
      <g pointerEvents="none">
        <defs>
          <linearGradient
            id={`cryo-${uid}`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={innerTop + innerH}
            x2={0}
            y2={innerTop}
          >
            {colorStops.map((s) => (
              <stop key={s.v} offset={offsetOf(s.v)} stopColor={s.c} />
            ))}
          </linearGradient>
          <clipPath id={`cryo-tube-${uid}`}>
            <rect
              x={tubeX}
              y={tubeY}
              width={tubeW}
              height={tubeH}
              rx={tubeR}
              ry={tubeR}
            />
          </clipPath>
        </defs>

        <text
          className="trama-skin-cryo-name"
          x={0}
          y={labelCenterY + 5}
          textAnchor="middle"
        >
          {node.label}
        </text>

        {/* 캡슐 — 한기를 머금은 짙은 베이스. */}
        <rect
          className="trama-skin-cryo-tube"
          x={tubeX}
          y={tubeY}
          width={tubeW}
          height={tubeH}
          rx={tubeR}
          ry={tubeR}
        />

        <g clipPath={`url(#cryo-tube-${uid})`}>
          <rect
            x={tubeX - 2}
            y={surfaceY}
            width={tubeW + 4}
            height={tubeY + tubeH - surfaceY + 4}
            fill={`url(#cryo-${uid})`}
          />
        </g>

        {/* 도메인 임계선 — LN₂/LHe/0K. */}
        <g className="trama-skin-cryo-critical">
          {criticalLines.map((l) => {
            const y = yOfValue(l.v);
            return (
              <g key={l.label}>
                <line
                  className="trama-skin-cryo-critical-line"
                  x1={tubeX - 2}
                  x2={tubeX + tubeW + 2}
                  y1={y}
                  y2={y}
                />
                <text
                  className="trama-skin-cryo-critical-label"
                  x={tubeX + tubeW + 6}
                  y={y + 3}
                >
                  {l.label}
                </text>
              </g>
            );
          })}
        </g>

        {/* 서리 입자 — 캡슐 양옆. */}
        <g className="trama-skin-cryo-frost">
          {frostParticles.map((p, i) => (
            <circle key={i} cx={p.dx} cy={p.dy} r={p.r} />
          ))}
        </g>
      </g>

      {onLabelClick && (
        <InteractiveArea
          x={-capsuleHalfW}
          y={-halfH}
          width={capsuleW}
          height={labelSlotH}
          hitClassName="trama-skin-cryo-name-hit"
          onClick={onLabelClick}
        />
      )}

      <g
        className={bubbleClass}
        transform={`translate(${bubbleCx},${surfaceY})`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: onScrub ? 'ns-resize' : 'default' }}
      >
        <path
          className="trama-skin-cryo-bubble-bg"
          d={`M ${-bubbleW / 2 + 10} ${-bubbleH / 2}
              L ${bubbleW / 2 - 8} ${-bubbleH / 2}
              Q ${bubbleW / 2} ${-bubbleH / 2} ${bubbleW / 2} ${-bubbleH / 2 + 8}
              L ${bubbleW / 2} ${-6}
              L ${bubbleW / 2 + 10} ${0}
              L ${bubbleW / 2} ${6}
              L ${bubbleW / 2} ${bubbleH / 2 - 8}
              Q ${bubbleW / 2} ${bubbleH / 2} ${bubbleW / 2 - 8} ${bubbleH / 2}
              L ${-bubbleW / 2 + 10} ${bubbleH / 2}
              Q ${-bubbleW / 2} ${bubbleH / 2} ${-bubbleW / 2} ${bubbleH / 2 - 8}
              L ${-bubbleW / 2} ${-bubbleH / 2 + 8}
              Q ${-bubbleW / 2} ${-bubbleH / 2} ${-bubbleW / 2 + 10} ${-bubbleH / 2} Z`}
        />
        <text
          className="trama-skin-cryo-bubble-text"
          x={0}
          y={5}
          textAnchor="middle"
        >
          {valueLabel}
        </text>
      </g>
    </g>
  );
}
