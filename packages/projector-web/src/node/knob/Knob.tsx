import { memo, useCallback, type KeyboardEvent, type MouseEvent } from "react";
import {
  KNOB_DIAMETER,
  KNOB_ROT_MAX_DEG,
  KNOB_ROT_MIN_DEG,
  arcPath,
  clamp,
  continuousStep,
  knobDialRadius,
  knobOuterRadius,
  nearestStopIndex,
  pointOnArc,
  steppedNeighbor,
  valueToAngleDeg,
  type KnobMode,
  type KnobSize,
} from "./knob-geometry.js";
import { useKnobDrag } from "./useKnobDrag.js";

/**
 * Pointer Knob — 시안 정합 형태. 3겹 구조로 표시한다:
 *
 * 1. 외곽 호 — 270° 트랙. 한 가지 톤(calm)으로 프레임 역할만. 값을 표현하지 않음.
 * 2. 내부 다이얼 본체 — 호 안쪽에 별도 `<circle>` (stroke only). 침이 회전하는 무대.
 * 3. 시계 침 — 다이얼 중심에서 바깥으로 뻗는 굵은 line. 현재 값의 각도를 가리키는
 *    유일한 표시. rounded cap.
 *
 * 중앙 텍스트(centerLabel)는 270° 호의 *하단 빈 영역*(6시 부근)에 작게 — 다이얼
 * 본체와 호 사이의 비어 있는 6시 호 영역. 정보는 침이 주역, 텍스트는 보조.
 *
 * 모드는 두 종류 — props `mode` 의 `kind` 로 분기:
 * - continuous: vertical drag (4*size px = 전 영역). shift+drag 미세 조정.
 * - stepped: drag 중 가장 가까운 stop 으로 round (인터랙션 그대로). 본 PR 범위에서는
 *   tick mark 등 stepped 시각화는 *생략* — 회전 위치만으로 stop 을 드러낸다.
 *
 * 노드 drag 와 충돌하지 않도록 hit `<circle fill="transparent">` 한 장이 pointer
 * 이벤트를 받고 visuals 는 `<g pointer-events="none">` 에 격리. dblclick 은 자기
 * hit 안에서 stopPropagation 후 defaultValue 로 복귀.
 */
interface Props {
  cx: number;
  cy: number;
  size: KnobSize;
  value: number;
  mode: KnobMode;
  defaultValue?: number;
  step?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  ariaLabel: string;
  /** Knob 위쪽 라벨 (예: "주기"). */
  label?: string;
  /** Knob 중앙 값 표시 텍스트 (예: "5s"). */
  centerLabel?: string;
}

/**
 * 침 끝과 다이얼 라인 사이 여유(px). needle 의 round cap·dial stroke 반쪽이
 * 좌표 너머로 튀어나가는 보정. compact 에서는 stroke 가 가늘어지므로 동일 비율로 축소.
 */
const NEEDLE_INSET: Record<KnobSize, number> = { standard: 5, compact: 3 };

function KnobImpl({
  cx,
  cy,
  size,
  value,
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
  const trackR = knobOuterRadius(size);
  const dialR = knobDialRadius(size);
  const needleLen = Math.max(0, dialR - NEEDLE_INSET[size]);
  const angleDeg = valueToAngleDeg(value, mode);

  const { onPointerDown } = useKnobDrag({
    value,
    mode,
    size: diameter,
    disabled,
    onChange,
  });

  const onDoubleClick = useCallback(
    (e: MouseEvent<SVGCircleElement>) => {
      e.stopPropagation();
      if (disabled || defaultValue === undefined) return;
      if (mode.kind === "continuous") {
        onChange(clamp(defaultValue, mode.min, mode.max));
      } else if (mode.stops.length > 0) {
        onChange(mode.stops[nearestStopIndex(defaultValue, mode.stops)]!);
      }
    },
    [defaultValue, disabled, mode, onChange],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<SVGGElement>) => {
      if (disabled) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopPropagation();
      const dir: -1 | 1 = e.key === "ArrowLeft" ? -1 : 1;
      const next =
        mode.kind === "continuous"
          ? continuousStep(value, mode.min, mode.max, step, dir)
          : steppedNeighbor(value, mode.stops, dir);
      if (next !== value) onChange(next);
    },
    [disabled, mode, onChange, step, value],
  );

  const trackPath = arcPath(cx, cy, trackR, KNOB_ROT_MIN_DEG, KNOB_ROT_MAX_DEG);
  const trackFillPath = arcPath(cx, cy, trackR, KNOB_ROT_MIN_DEG, angleDeg);
  const needleEnd = pointOnArc(cx, cy, needleLen, angleDeg);

  const labelY = cy - r - 4;
  // 270° 호의 하단 빈 영역(6시 방향) — 노드 본문 좌표 기준 고정 y.
  const centerLabelY = cy + dialR + 9;

  return (
    <g
      className={`trama-knob${size === "compact" ? " is-compact" : ""}${disabled ? " is-disabled" : ""}`}
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
          <text
            className="trama-knob-label"
            x={cx}
            y={labelY}
            textAnchor="middle"
          >
            {label}
          </text>
        )}
        <path className="trama-knob-track" d={trackPath} />
        <path className="trama-knob-track-fill" d={trackFillPath} />
        <circle className="trama-knob-dial" cx={cx} cy={cy} r={dialR} />
        <line
          className="trama-knob-needle"
          x1={cx}
          y1={cy}
          x2={needleEnd.x}
          y2={needleEnd.y}
        />
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

export const Knob = memo(KnobImpl);
