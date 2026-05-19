import { memo, useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import {
  KNOB_DIAMETER,
  KNOB_ROT_MAX_DEG,
  KNOB_ROT_MIN_DEG,
  arcPath,
  clamp,
  continuousStep,
  pointOnArc,
  steppedNeighbor,
  tickAngles,
  valueToAngleDeg,
  type KnobMode,
  type KnobSize,
} from './knob-geometry.js';
import { useKnobDrag } from './useKnobDrag.js';

/**
 * Bipolar Knob — 중심값 기준 ±. fill 호가 center 각도 ↔ 현재값 각도 사이만
 * 채워지고, center 위치에 강조 tick. ±/중립을 직관적으로 드러내고 싶을 때 쓴다.
 *
 * Pointer Knob 과 같은 두 모드(continuous · stepped) 와 같은 인터랙션 규칙을
 * 공유. 본 PR 범위에서는 컴포넌트만 제공 — 실제 적용 노드는 후속 작업.
 */
interface Props {
  cx: number;
  cy: number;
  size: KnobSize;
  value: number;
  /** 중심값 — fill 호의 anchor (보통 0). */
  center: number;
  mode: KnobMode;
  defaultValue?: number;
  step?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  ariaLabel: string;
  label?: string;
  centerLabel?: string;
}

const TICK_LEN = 4;
const INDICATOR_INSET = 6;
const INDICATOR_LEN = 10;

function BipolarKnobImpl({
  cx,
  cy,
  size,
  value,
  center,
  mode,
  defaultValue,
  step = 1,
  disabled,
  onChange,
  ariaLabel,
  label,
  centerLabel,
}: Props): JSX.Element {
  const diameter = KNOB_DIAMETER[size];
  const r = diameter / 2;
  const trackR = r - 2;
  const centerAngle = valueToAngleDeg(center, mode);
  const valueAngle = valueToAngleDeg(value, mode);

  const { onPointerDown } = useKnobDrag({ value, mode, size: diameter, disabled, onChange });

  const onDoubleClick = useCallback(
    (e: MouseEvent<SVGCircleElement>) => {
      e.stopPropagation();
      if (disabled) return;
      const target = defaultValue ?? center;
      if (mode.kind === 'continuous') {
        onChange(clamp(target, mode.min, mode.max));
      } else if (mode.stops.length > 0) {
        onChange(mode.stops[0]!);
      }
    },
    [center, defaultValue, disabled, mode, onChange],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<SVGGElement>) => {
      if (disabled) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      const dir: -1 | 1 = e.key === 'ArrowLeft' ? -1 : 1;
      const next =
        mode.kind === 'continuous'
          ? continuousStep(value, mode.min, mode.max, step, dir)
          : steppedNeighbor(value, mode.stops, dir);
      if (next !== value) onChange(next);
    },
    [disabled, mode, onChange, step, value],
  );

  const trackBg = arcPath(cx, cy, trackR, KNOB_ROT_MIN_DEG, KNOB_ROT_MAX_DEG);
  const fillStart = Math.min(centerAngle, valueAngle);
  const fillEnd = Math.max(centerAngle, valueAngle);
  const trackFill = arcPath(cx, cy, trackR, fillStart, fillEnd);
  const ticks = tickAngles(mode);
  const indStart = pointOnArc(cx, cy, trackR - INDICATOR_INSET - INDICATOR_LEN, valueAngle);
  const indEnd = pointOnArc(cx, cy, trackR - INDICATOR_INSET, valueAngle);
  const centerOuter = pointOnArc(cx, cy, trackR - 1, centerAngle);
  const centerInner = pointOnArc(cx, cy, trackR - 1 - TICK_LEN * 1.5, centerAngle);

  const labelY = cy - r - 4;
  const valueY = cy + 4;

  return (
    <g
      className={`trama-knob trama-knob-bipolar${disabled ? ' is-disabled' : ''}`}
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
        <path className="trama-knob-track" d={trackBg} />
        <path className="trama-knob-track-fill" d={trackFill} />
        {ticks.map((t) => {
          const a = pointOnArc(cx, cy, trackR - 1, t.angleDeg);
          const b = pointOnArc(cx, cy, trackR - 1 - TICK_LEN, t.angleDeg);
          return (
            <line
              key={t.index}
              className="trama-knob-tick"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        })}
        <line
          className="trama-knob-tick is-center"
          x1={centerOuter.x}
          y1={centerOuter.y}
          x2={centerInner.x}
          y2={centerInner.y}
        />
        <line
          className="trama-knob-indicator"
          x1={indStart.x}
          y1={indStart.y}
          x2={indEnd.x}
          y2={indEnd.y}
        />
        {centerLabel !== undefined && (
          <text className="trama-knob-center" x={cx} y={valueY} textAnchor="middle">
            {centerLabel}
          </text>
        )}
      </g>
    </g>
  );
}

export const BipolarKnob = memo(BipolarKnobImpl);
