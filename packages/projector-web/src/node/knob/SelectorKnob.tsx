import { memo, useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import {
  KNOB_DIAMETER,
  SELECTOR_MAX_STOPS,
  clamp,
  nearestStopIndex,
  pointOnArc,
  selectorStopAngles,
  steppedNeighbor,
  type KnobMode,
  type KnobSize,
} from './knob-geometry.js';
import { useKnobDrag } from './useKnobDrag.js';

/**
 * Selector Knob — 2~7개 stop 중 하나만 고르는 이산 선택 노브.
 *
 * Pointer/Bipolar Knob 과 달리 270° 호 트랙이 없다. 다이얼 본체 원이 정적으로
 * 그려지고, 그 안의 세로 line + 끝 마커 도트가 *함께* 현재 stop 각도로 회전해
 * 어느 방향이 선택되었는지를 가리킨다. stop 사이 간격은 항상 45°, 12시(0°)를
 * 축으로 짝수 n 은 왼쪽 한 칸 더 확장(왼쪽 우선) — `selectorStopAngles` 참고.
 *
 * 각 stop 위치에는 본체 외곽 바깥쪽에 짧은 방사 tick 만 그려진다. 시안의
 * "위쪽에 더 많은 빗살" 같은 장식 tick 은 *없다* — 정보 = 실제 선택지.
 *
 * 인터랙션은 기존 stepped Knob 과 동일: vertical drag 중 가장 가까운 stop 으로
 * 스냅("탁탁탁"), dblclick → defaultValue 또는 stops[0] 복귀, ArrowLeft/Right →
 * 인접 stop. drag/hit 패턴(노드 drag 충돌 회피)도 같다.
 */
interface Props {
  cx: number;
  cy: number;
  size: KnobSize;
  value: number;
  /** 2 ~ SELECTOR_MAX_STOPS(7) 개. 범위 밖이면 양 끝으로 클램프. */
  stops: readonly number[];
  defaultValue?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  ariaLabel: string;
  label?: string;
  centerLabel?: string;
}

/** 다이얼 본체 원 반지름 비율 — knob diameter 대비. 외곽보다 약간 안쪽. */
const BODY_RADIUS_RATIO = 0.42;
/** 회전 line 길이의 절반 비율 — 본체 반지름 대비. 본체 안에서 살짝 여백. */
const LINE_HALF_RATIO = 0.82;
/** 마커 도트가 line 끝에서 안쪽으로 들어간 비율. */
const DOT_POSITION_RATIO = 0.78;
/** 마커 도트 반지름(px) — size 별. */
const DOT_RADIUS: Record<KnobSize, number> = { standard: 2.2, compact: 1.6 };
/** stop tick 시작·끝 반지름 offset(px) — 본체 외곽 바깥쪽. */
const TICK_GAP: Record<KnobSize, number> = { standard: 2, compact: 1.5 };
const TICK_LEN: Record<KnobSize, number> = { standard: 6, compact: 4 };

function SelectorKnobImpl({
  cx,
  cy,
  size,
  value,
  stops,
  defaultValue,
  disabled,
  onChange,
  ariaLabel,
  label,
  centerLabel,
}: Props): JSX.Element {
  const diameter = KNOB_DIAMETER[size];
  const r = diameter / 2;
  const n = clamp(stops.length, 2, SELECTOR_MAX_STOPS);
  const effectiveStops = stops.slice(0, n);
  const angles = selectorStopAngles(n);
  const bodyR = diameter * BODY_RADIUS_RATIO;
  const lineHalf = bodyR * LINE_HALF_RATIO;
  const dotR = DOT_RADIUS[size];
  const tickInner = r + TICK_GAP[size];
  const tickOuter = tickInner + TICK_LEN[size];

  const idx = Math.max(0, nearestStopIndex(value, effectiveStops));
  const angle = angles[idx] ?? 0;

  const dragMode: KnobMode = { kind: 'stepped', stops: effectiveStops };
  const { onPointerDown } = useKnobDrag({
    value,
    mode: dragMode,
    size: diameter,
    disabled,
    onChange,
  });

  const onDoubleClick = useCallback(
    (e: MouseEvent<SVGCircleElement>) => {
      e.stopPropagation();
      if (disabled || effectiveStops.length === 0) return;
      const target =
        defaultValue !== undefined
          ? effectiveStops[nearestStopIndex(defaultValue, effectiveStops)]!
          : effectiveStops[0]!;
      if (target !== value) onChange(target);
    },
    [defaultValue, disabled, effectiveStops, onChange, value],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<SVGGElement>) => {
      if (disabled) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      const dir: -1 | 1 = e.key === 'ArrowLeft' ? -1 : 1;
      const next = steppedNeighbor(value, effectiveStops, dir);
      if (next !== value) onChange(next);
    },
    [disabled, effectiveStops, onChange, value],
  );

  const labelY = cy - r - 4;
  const centerLabelY = cy + r + 12;

  return (
    <g
      className={`trama-knob trama-selector-knob${size === 'compact' ? ' is-compact' : ''}${disabled ? ' is-disabled' : ''}`}
      tabIndex={disabled ? -1 : 0}
      role="slider"
      aria-label={ariaLabel}
      aria-valuenow={value}
      onKeyDown={onKeyDown}
    >
      <circle
        className="trama-knob-hit"
        cx={cx}
        cy={cy}
        r={r}
        fill="transparent"
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      />
      <g pointerEvents="none">
        {label !== undefined && (
          <text className="trama-knob-label" x={cx} y={labelY} textAnchor="middle">
            {label}
          </text>
        )}
        <circle className="trama-selector-knob-body" cx={cx} cy={cy} r={bodyR} />
        {angles.map((a, i) => {
          const inner = pointOnArc(cx, cy, tickInner, a);
          const outer = pointOnArc(cx, cy, tickOuter, a);
          return (
            <line
              key={i}
              className="trama-selector-knob-tick"
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
            />
          );
        })}
        <g transform={`rotate(${angle} ${cx} ${cy})`}>
          <line
            className="trama-selector-knob-line"
            x1={cx}
            y1={cy + lineHalf}
            x2={cx}
            y2={cy - lineHalf}
          />
          <circle
            className="trama-selector-knob-dot"
            cx={cx}
            cy={cy - lineHalf * DOT_POSITION_RATIO}
            r={dotR}
          />
        </g>
        {centerLabel !== undefined && (
          <text
            className="trama-knob-center"
            x={cx}
            y={centerLabelY}
            textAnchor="middle"
          >
            {centerLabel}
          </text>
        )}
      </g>
    </g>
  );
}

export const SelectorKnob = memo(SelectorKnobImpl);
