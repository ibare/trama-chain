import { useCallback, useId, useRef } from 'react';
import { useTrama } from '../../store/index.js';
import { formatNodeValue } from '../../util/format.js';
import { InteractiveArea } from '../../node/InteractiveArea.js';
import type { NumericSkinRenderProps } from '../types.js';

/**
 * 아날로그 수은 온도계 스킨.
 *
 * 레이아웃 (노드 사각 bbox 220×244 기준, box.ts SKIN_LAYOUTS와 일치):
 *   - 상단 24px        : 노드 타이틀 슬롯 (라벨 + InteractiveArea로 단위 인스펙터 진입)
 *   - 그 아래 영역      : 공통 원형 보더(r=110, cy=12)가 ValueNodeView에서 외부에 렌더됨
 *   - 캡슐 visual       : 64×220, 원 안 정중앙 — 노드 폭(220)과 무관하게 self-define
 *   - 엣지 앵커         : 원 좌·우 끝(±110, 12) — box.ts가 책임. 스킨 시각과는 분리.
 *
 * SVG 구조는 drag-hit 공통 패턴을 따른다.
 *   1. visuals wrapper `<g pointerEvents="none">` 안에 모든 장식 (라벨·캡슐·수은·tick·shine)
 *      → NodeFrame이 깐 drag-hit rect가 모든 빈 영역 hit를 그대로 받음.
 *   2. 그 밖에 interactive children — 라벨 InteractiveArea, 말풍선 핸들 group.
 *      자체 hit-area로 z-order 위에 올라가 drag-hit를 가린다.
 *
 * 말풍선은 캡슐 좌측 바깥에 부착되고, 위·아래 드래그로 값을 갱신한다 — 자체가 슬라이더 핸들.
 */
export function ThermometerMercury({
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
  const uid = useId().replace(/[:#]/g, '');

  // 상단 라벨 슬롯
  const labelSlotH = 24;
  const labelCenterY = -halfH + labelSlotH / 2;

  // 캡슐 visual — 노드 폭과 무관하게 64×220 고정. 노드 영역(220×244) 안 정중앙(x=0)에,
  // 라벨 슬롯 아래에 위치. 좌·우 8px 인셋·위·아래 6px 인셋.
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

  const tickCount = 11;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const t = i / (tickCount - 1);
    const ty = innerTop + t * innerH;
    const isMajor = i % 2 === 0;
    return { ty, len: isMajor ? 9 : 5 };
  });

  const f = formatNodeValue(value, unit);
  const valueLabel = `${f.primary}${unit.kind === 'number' ? '°' : ''}`;

  // 값 기반 색 매핑. ratio가 아니라 *온도 절댓값*이 색을 결정한다 — surfaceY와 무관하게
  // 0°C는 항상 흰에 가까운 옅은 청, 30°C 이상은 점점 붉은색. 캡슐 inner 영역에 절대
  // 좌표(userSpaceOnUse)로 그라데이션을 깔고, mercury rect는 그 위 일부만 차지하므로
  // 값에 해당하는 색이 그 y에 그대로 보인다.
  // 상온 온도계 도메인 (−50..50 °C)에 맞춘 stop. 다른 도메인의 thermometer 스킨은
  // 자기 영역에 맞춰 색 매핑을 따로 정의.
  const colorStops: ReadonlyArray<{ v: number; c: string }> = [
    { v: -50, c: '#234d9a' },
    { v: -30, c: '#4f81c9' },
    { v: -10, c: '#9ec3e6' },
    { v: 0, c: '#e9f0f5' },
    { v: 15, c: '#ead09a' },
    { v: 25, c: '#e69869' },
    { v: 30, c: '#df6e3f' },
    { v: 40, c: '#c84830' },
    { v: 50, c: '#962a1d' },
  ];
  const offsetOf = (v: number): number =>
    Math.max(0, Math.min(1, (v - unit.min) / range));

  // 말풍선 — 캡슐 좌측 *바깥*, 수은 표면 높이에 정렬. 자체가 슬라이더 핸들.
  const bubbleW = 60;
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

  const bubbleClass =
    'trama-skin-thermometer-bubble' +
    (onScrub ? ' is-handle' : '') +
    (disabled ? ' is-disabled' : '');

  return (
    <g className="trama-skin-thermometer" aria-label={node.label}>
      {/* visuals — drag-hit이 통과하도록 wrapper 전체 pointer-events 차단 */}
      <g pointerEvents="none">
        <defs>
          {/* userSpaceOnUse — 그라데이션이 캡슐 inner 영역의 절대 y 좌표에 묶인다.
              y1=bottom(=unit.min), y2=top(=unit.max). stop offset은 0..1로 정규화된
              값 위치라서 mercury rect의 크기와 무관하게 같은 온도값은 같은 색. */}
          <linearGradient
            id={`merc-${uid}`}
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
          <clipPath id={`tube-${uid}`}>
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
          className="trama-skin-thermometer-name"
          x={0}
          y={labelCenterY + 5}
          textAnchor="middle"
        >
          {node.label}
        </text>

        <rect
          className="trama-skin-thermometer-tube"
          x={tubeX}
          y={tubeY}
          width={tubeW}
          height={tubeH}
          rx={tubeR}
          ry={tubeR}
        />

        <g clipPath={`url(#tube-${uid})`}>
          <rect
            x={tubeX - 2}
            y={surfaceY}
            width={tubeW + 4}
            height={tubeY + tubeH - surfaceY + 4}
            fill={`url(#merc-${uid})`}
          />
          <path
            className="trama-skin-thermometer-surface"
            d={`M ${tubeX - 2} ${surfaceY + 2}
                Q ${tubeX + tubeW * 0.3} ${surfaceY - 3}
                  ${tubeX + tubeW * 0.55} ${surfaceY + 2}
                T ${tubeX + tubeW + 2} ${surfaceY + 2}`}
            fill="none"
          />
        </g>

        <g className="trama-skin-thermometer-ticks">
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={tubeX + 4}
              x2={tubeX + 4 + t.len}
              y1={t.ty}
              y2={t.ty}
            />
          ))}
        </g>

        <rect
          className="trama-skin-thermometer-shine"
          x={tubeX + tubeR - 2}
          y={innerTop + 4}
          width={3}
          height={Math.max(0, innerH - 8)}
          rx={1.5}
        />
      </g>

      {/* interactive: 라벨 영역 — 단위/스킨 인스펙터 진입. 캡슐 폭 위쪽에만 hit,
          노드 bbox의 빈 좌·우 영역은 drag-hit으로 통과시킨다. */}
      {onLabelClick && (
        <InteractiveArea
          x={-capsuleHalfW}
          y={-halfH}
          width={capsuleW}
          height={labelSlotH}
          hitClassName="trama-skin-thermometer-name-hit"
          onClick={onLabelClick}
        />
      )}

      {/* interactive: 말풍선 자체가 슬라이더 핸들 */}
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
          className="trama-skin-thermometer-bubble-bg"
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
          className="trama-skin-thermometer-bubble-text"
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
