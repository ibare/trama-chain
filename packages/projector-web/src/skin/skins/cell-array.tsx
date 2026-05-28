import { useId } from 'react';
import { tokens } from '@trama-chain/tokens';
import { InteractiveArea } from '../../node/InteractiveArea.js';
import {
  PRIMITIVES,
  SHADES,
  dim as dimSwatch,
  resolveSwatch,
  type PrimitiveKey,
  type ShadeKey,
  type SwatchRef,
} from '../palette.js';
import type { NumericSkinRenderProps } from '../types.js';

/**
 * Cell Array 스킨 — Range 도메인의 단위 무관 표현 도구.
 *
 * 한 가지 데이터 모델(셀 배열)로 시안의 다양한 표현을 모두 만든다:
 *   - cells=[{range,0,100}] capsule vertical    → 긴 게이지 바
 *   - cells=[{range,0,30},{range,31,60},...]    → 세그먼트 게이지
 *   - cells=[{point,0},{point,1},{point,2}]     → 단계 인디케이터
 *   - cells=[{point,1}]                          → 라이트 (값이 1일 때만 켜짐)
 *
 * 매칭 의미:
 *   - range 셀: 값이 [lo, hi] 안에서 채워지는 정도(0..1). 셀이 여러 개면
 *     각 셀이 자기 구간을 부분 채움 — 인접 구간이면 게이지처럼 흐른다.
 *   - point 셀: 값이 at과 일치(unit.step의 절반 이내)할 때 켜진다. 아니면 dim.
 *
 * 시각: 활성 색은 사용자가 셀별로 지정한 SwatchRef. 비활성 톤은 같은 hue를
 * 유지하며 더 옅은 shade로 시프트한 dim 색 — OKLCH 축에서 자연스럽게 나온다.
 *
 * 이번 단계는 디스플레이 전용 — scrub 인터랙션 없음. 라벨 슬롯만 인스펙터
 * 진입을 위한 InteractiveArea로 노출.
 */
export function CellArray({
  node,
  value,
  unit,
  halfW,
  halfH,
  onLabelClick,
}: NumericSkinRenderProps): JSX.Element {
  const params = normalizeParams(node.skin?.params);

  const labelSlotH = 24;
  const labelCenterY = -halfH + labelSlotH / 2;
  const labelHitW = Math.min(halfW * 1.6, 140);

  const cellAreaTop = -halfH + labelSlotH + 8;
  const cellAreaBottom = halfH - 12;
  const cellAreaH = Math.max(8, cellAreaBottom - cellAreaTop);
  const cellAreaW = halfW * 1.7;
  const cellAreaLeft = -cellAreaW / 2;

  const cellTolerance = Math.max(unit.step / 2, 1e-9);
  const slots = layoutCells(params, {
    left: cellAreaLeft,
    top: cellAreaTop,
    width: cellAreaW,
    height: cellAreaH,
  });

  return (
    <g aria-label={node.label}>
      <g pointerEvents="none">
        <text
          x={0}
          y={labelCenterY + 5}
          textAnchor="middle"
          style={{
            fill: tokens.color.nodeTextPrimary,
            fontSize: tokens.typography.textNodeName,
            fontFamily: tokens.typography.fontSansDefault,
          }}
        >
          {node.label}
        </text>

        {slots.map((slot, i) => {
          const cell = params.cells[i]!;
          const fill = computeFill(cell, value, cellTolerance);
          const active = resolveSwatch(cell.color);
          const inactive = dimSwatch(cell.color, INACTIVE_DIM);
          return (
            <CellShape
              key={i}
              x={slot.x}
              y={slot.y}
              w={slot.w}
              h={slot.h}
              shape={params.shape}
              direction={params.direction}
              fill={fill}
              activeColor={active}
              inactiveColor={inactive}
            />
          );
        })}
      </g>

      {onLabelClick && (
        <InteractiveArea
          x={-labelHitW / 2}
          y={-halfH}
          width={labelHitW}
          height={labelSlotH}
          hitClassName="trama-skin-cell-array-label-hit"
          onClick={onLabelClick}
        />
      )}
    </g>
  );
}

// ─────────────────────────────────────────────────────────
// Params 정규화
// ─────────────────────────────────────────────────────────

export type Cell = RangeCell | PointCell;

export interface RangeCell {
  kind: 'range';
  lo: number;
  hi: number;
  color: SwatchRef;
}

export interface PointCell {
  kind: 'point';
  at: number;
  color: SwatchRef;
}

export type CellShapeKind = 'capsule' | 'circle';
export type CellDirection = 'vertical' | 'horizontal';

export interface CellArrayParams {
  cells: Cell[];
  shape: CellShapeKind;
  direction: CellDirection;
}

/**
 * 비활성 셀의 옅은 정도(0..1, 클수록 옅음).
 * 사용자 노출 옵션이 아닌 내부 상수 — 셀이 "거의 꺼진 듯" 보이도록 고정.
 */
const INACTIVE_DIM = 0.9;

export function defaultCellArrayParams(): CellArrayParams {
  return {
    cells: [{ kind: 'range', lo: 0, hi: 100, color: { primitive: 'green', shade: '500' } }],
    shape: 'capsule',
    direction: 'vertical',
  };
}

export function normalizeCellArrayParams(raw: unknown): CellArrayParams {
  return normalizeParams(raw);
}

function normalizeParams(raw: unknown): CellArrayParams {
  const fallback = defaultCellArrayParams();
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  const cells = normalizeCells(r.cells);
  return {
    cells: cells.length > 0 ? cells : fallback.cells,
    shape: r.shape === 'circle' ? 'circle' : 'capsule',
    direction: r.direction === 'horizontal' ? 'horizontal' : 'vertical',
  };
}

function normalizeCells(raw: unknown): Cell[] {
  if (!Array.isArray(raw)) return [];
  const out: Cell[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const color = normalizeSwatch(it.color);
    if (it.kind === 'range' && typeof it.lo === 'number' && typeof it.hi === 'number') {
      out.push({ kind: 'range', lo: it.lo, hi: it.hi, color });
    } else if (it.kind === 'point' && typeof it.at === 'number') {
      out.push({ kind: 'point', at: it.at, color });
    }
  }
  return out;
}

function normalizeSwatch(raw: unknown): SwatchRef {
  const fallback: SwatchRef = { primitive: 'green', shade: '500' };
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  const primitive = PRIMITIVES.includes(r.primitive as PrimitiveKey)
    ? (r.primitive as PrimitiveKey)
    : fallback.primitive;
  const shade = SHADES.includes(r.shade as ShadeKey)
    ? (r.shade as ShadeKey)
    : fallback.shade;
  return { primitive, shade };
}

// ─────────────────────────────────────────────────────────
// Fill 계산
// ─────────────────────────────────────────────────────────

function computeFill(cell: Cell, value: number, tolerance: number): number {
  if (cell.kind === 'range') {
    const span = cell.hi - cell.lo;
    if (span <= 0) return value >= cell.hi ? 1 : 0;
    if (value <= cell.lo) return 0;
    if (value >= cell.hi) return 1;
    return (value - cell.lo) / span;
  }
  return Math.abs(value - cell.at) <= tolerance ? 1 : 0;
}

// ─────────────────────────────────────────────────────────
// 레이아웃
// ─────────────────────────────────────────────────────────

interface Box { x: number; y: number; w: number; h: number }
interface Area { left: number; top: number; width: number; height: number }

function layoutCells(params: CellArrayParams, area: Area): Box[] {
  const n = params.cells.length;
  if (n === 0) return [];
  const gap = 6;
  if (params.direction === 'vertical') {
    const totalGap = gap * (n - 1);
    const cellH = Math.max(6, (area.height - totalGap) / n);
    const cellW = clampCellExtent(params.shape, area.width, cellH);
    const left = -cellW / 2;
    return params.cells.map((_, i) => ({
      x: left,
      y: area.top + i * (cellH + gap),
      w: cellW,
      h: cellH,
    }));
  }
  const totalGap = gap * (n - 1);
  const cellW = Math.max(6, (area.width - totalGap) / n);
  const cellH = clampCellExtent(params.shape, area.height, cellW);
  const top = area.top + (area.height - cellH) / 2;
  return params.cells.map((_, i) => ({
    x: area.left + i * (cellW + gap),
    y: top,
    w: cellW,
    h: cellH,
  }));
}

/**
 * 원 모양은 정사각으로 묶고, 캡슐은 보조 축이 너무 크면 트랙처럼 보이지 않도록
 * 일정 비율로 제한한다.
 */
function clampCellExtent(shape: CellShapeKind, available: number, primary: number): number {
  if (shape === 'circle') return Math.min(available, primary);
  return Math.min(available, primary * 4);
}

// ─────────────────────────────────────────────────────────
// 셀 렌더
// ─────────────────────────────────────────────────────────

interface CellShapeProps {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: CellShapeKind;
  direction: CellDirection;
  fill: number;
  activeColor: string;
  inactiveColor: string;
}

function CellShape(props: CellShapeProps): JSX.Element {
  const { x, y, w, h, shape, direction, fill, activeColor, inactiveColor } = props;
  const clipId = useId();
  const borderColor = tokens.color.nodeStrokeCalm;
  const borderWidth = parseFloat(tokens.spacing.strokeNodeDefault);

  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill >= 1 ? activeColor : inactiveColor}
        stroke={borderColor}
        strokeWidth={borderWidth}
      />
    );
  }

  const rx = Math.min(w, h) / 2;
  const fillBox = computeCapsuleFillBox({ x, y, w, h, direction, fill });

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={w} height={h} rx={rx} ry={rx} />
        </clipPath>
      </defs>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={rx}
        ry={rx}
        fill={inactiveColor}
      />
      {fillBox && (
        <rect
          x={fillBox.x}
          y={fillBox.y}
          width={fillBox.w}
          height={fillBox.h}
          fill={activeColor}
          clipPath={`url(#${clipId})`}
        />
      )}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={rx}
        ry={rx}
        fill="none"
        stroke={borderColor}
        strokeWidth={borderWidth}
      />
    </g>
  );
}

function computeCapsuleFillBox(args: {
  x: number;
  y: number;
  w: number;
  h: number;
  direction: CellDirection;
  fill: number;
}): Box | null {
  const { x, y, w, h, direction, fill } = args;
  if (fill <= 0) return null;
  const f = Math.min(1, fill);
  if (direction === 'vertical') {
    // 아래에서 위로 채움.
    const fh = h * f;
    return { x, y: y + h - fh, w, h: fh };
  }
  const fw = w * f;
  return { x, y, w: fw, h };
}
