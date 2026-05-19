import { memo, useCallback, type KeyboardEvent, type MouseEvent } from "react";
import {
  KNOB_DIAMETER,
  SELECTOR_MAX_STOPS,
  clamp,
  knobDialRadius,
  nearestStopIndex,
  pointOnArc,
  selectorStopAngles,
  steppedNeighbor,
  type KnobMode,
  type KnobSize,
} from "./knob-geometry.js";
import { useKnobDrag } from "./useKnobDrag.js";

/**
 * Selector Knob — 2~7개 stop 중 하나만 고르는 이산 선택 노브.
 *
 * Pointer/Bipolar Knob 과 달리 270° 호 트랙이 없다. 다이얼 본체 원이 정적으로
 * 그려지고, 그 안의 세로 캡슐(rounded rect) + 캡슐 위쪽 끝 마커 도트가 *함께*
 * 현재 stop 각도로 회전해 어느 방향이 선택되었는지를 가리킨다. stop 사이 간격은
 * 항상 45°, 12시(0°)를 축으로 짝수 n 은 왼쪽 한 칸 더 확장(왼쪽 우선) —
 * `selectorStopAngles` 참고.
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

/** 캡슐 절반 길이 비율 — 본체 원 반지름 대비. 1.0 보다 크면 외곽 원 바깥으로
 * 살짝 튀어나오는 시안 정합 모양. */
const CAPSULE_HALF_LENGTH_RATIO = 0.96;
/** 캡슐 길이에 더하는 절대 px(전체 기준). 시안 미세 조정용. */
const CAPSULE_EXTRA_LENGTH_PX = 4;
/** 캡슐 폭 비율 — 본체 원 반지름 대비. 시안의 두툼한 다이얼 무게감. */
const CAPSULE_WIDTH_RATIO = 0.7;
/** 캡슐 상단 끝(rounded cap 중심)에서 도트 중심까지 거리 — 캡슐 폭 대비. */
const DOT_OFFSET_FROM_TOP_RATIO = 0.6;
/** 마커 도트 반지름 — 캡슐 폭 대비. 캡슐 내부에 또렷이 보이는 강조점. */
const DOT_RADIUS_RATIO = 0.28;
/** stop tick 시작 반지름 — 본체 원(=다이얼) 바깥에서 gap 만큼 띄운다. */
const TICK_GAP: Record<KnobSize, number> = { standard: 5, compact: 4.5 };
const TICK_LEN: Record<KnobSize, number> = { standard: 1.5, compact: 1 };
/** 본체 하단을 위로 누르는 비율 — 상단 반지름 대비 하단 vertical 반지름.
 * centerLabel 이 들어갈 6시 영역을 확보. 1.0 이면 정원, 0 에 가까울수록 납작.
 * 시안 path(57/68.5) 기준. */
const BODY_BOTTOM_SQUASH_RATIO = 0.832;
/** centerLabel y offset — hit 원 하단(`cy + r`) 기준. size 별 시각 균형. */
const CENTER_LABEL_OFFSET: Record<KnobSize, number> = {
  standard: -3,
  compact: 0,
};

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
  const bodyR = knobDialRadius(size);
  const capsuleHalf =
    bodyR * CAPSULE_HALF_LENGTH_RATIO + CAPSULE_EXTRA_LENGTH_PX / 2;
  const capsuleW = bodyR * CAPSULE_WIDTH_RATIO;
  const capsuleRadius = capsuleW / 2;
  const dotR = capsuleW * DOT_RADIUS_RATIO;
  const dotY =
    cy - capsuleHalf + capsuleRadius * (2 * DOT_OFFSET_FROM_TOP_RATIO);
  const tickInner = bodyR + TICK_GAP[size];
  const tickOuter = tickInner + TICK_LEN[size];
  const ryBot = bodyR * BODY_BOTTOM_SQUASH_RATIO;
  // 상단은 정원, 하단은 squash 한 비대칭 캡슐. 두 절반을 elliptical arc 로 이어 붙인다.
  const bodyPath =
    `M ${cx} ${cy - bodyR} ` +
    `A ${bodyR} ${bodyR} 0 0 1 ${cx + bodyR} ${cy} ` +
    `A ${bodyR} ${ryBot} 0 0 1 ${cx} ${cy + ryBot} ` +
    `A ${bodyR} ${ryBot} 0 0 1 ${cx - bodyR} ${cy} ` +
    `A ${bodyR} ${bodyR} 0 0 1 ${cx} ${cy - bodyR} Z`;

  const idx = Math.max(0, nearestStopIndex(value, effectiveStops));
  const angle = angles[idx] ?? 0;

  const dragMode: KnobMode = { kind: "stepped", stops: effectiveStops };
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
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopPropagation();
      const dir: -1 | 1 = e.key === "ArrowLeft" ? -1 : 1;
      const next = steppedNeighbor(value, effectiveStops, dir);
      if (next !== value) onChange(next);
    },
    [disabled, effectiveStops, onChange, value],
  );

  const labelY = cy - r - 4;
  const centerLabelY = cy + r + CENTER_LABEL_OFFSET[size];

  return (
    <g
      className={`trama-knob trama-selector-knob${size === "compact" ? " is-compact" : ""}${disabled ? " is-disabled" : ""}`}
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
        <path className="trama-selector-knob-body" d={bodyPath} />
        {angles.map((a, i) => {
          const inner = pointOnArc(cx, cy, tickInner, a);
          const outer = pointOnArc(cx, cy, tickOuter, a);
          return (
            <line
              key={i}
              className={`trama-selector-knob-tick${i === idx ? " is-selected" : ""}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
            />
          );
        })}
        <g transform={`rotate(${angle} ${cx} ${cy})`}>
          <rect
            className="trama-selector-knob-capsule"
            x={cx - capsuleW / 2}
            y={cy - capsuleHalf}
            width={capsuleW}
            height={capsuleHalf * 2}
            rx={capsuleRadius}
            ry={capsuleRadius}
          />
          <circle
            className="trama-selector-knob-dot"
            cx={cx}
            cy={dotY}
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
