/**
 * Knob 컴포넌트 공용 geometry — value ↔ 각도 매핑·호 path·stop snap.
 *
 * 활성 호는 12시(0°)를 정북으로 두고 시계방향 +. 호 양 끝은 [-135°, +135°] —
 * 7시에서 5시까지 270°. 매핑 단위 t∈[0,1]를 두 모드가 공유한다:
 *
 * - continuous: t = (value - min) / (max - min)
 * - stepped: t = idx / (stops.length - 1) ── 값 간격 무시, 인덱스 균등 분포.
 *   사용자 표현 "탁탁탁" — drag 중 t 가 stop boundary 를 넘으면 인접 인덱스로
 *   round 되어 즉시 스냅.
 *
 * 모두 순수 함수 — DOM·React 의존 없음. UI 컴포넌트와 인터랙션 hook 양쪽이 이
 * 모듈만 import 한다.
 */

export type KnobMode =
  | { kind: 'continuous'; min: number; max: number }
  | { kind: 'stepped'; stops: readonly number[] };

/**
 * Knob 의 표준 사이즈 토큰 — 노드의 standard / compact 디스플레이 모드와 같은
 * 어휘를 공유한다. 호출 측은 픽셀이 아니라 의미 키로 사이즈를 지정하고,
 * 픽셀 수치는 [[KNOB_DIAMETER]] 한 곳에서 결정한다.
 *
 * 모양 자체(다이얼 본체·침 길이·트랙 인셋)는 비율 상수로 컴포넌트 내부에 두고
 * 사이즈에 비례. 폰트는 CSS 에서 결정.
 */
export type KnobSize = 'standard' | 'compact';

export const KNOB_DIAMETER: Record<KnobSize, number> = {
  standard: 56,
  compact: 40,
};

export const KNOB_ROT_MIN_DEG = -135;
export const KNOB_ROT_MAX_DEG = 135;
export const KNOB_ROT_SPAN_DEG = KNOB_ROT_MAX_DEG - KNOB_ROT_MIN_DEG;

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** value → t∈[0,1]. stepped 모드는 가장 가까운 stop 의 인덱스로 매핑. */
export function valueToT(value: number, mode: KnobMode): number {
  if (mode.kind === 'continuous') {
    if (mode.max === mode.min) return 0;
    return clamp01((value - mode.min) / (mode.max - mode.min));
  }
  const n = mode.stops.length;
  if (n === 0) return 0;
  if (n === 1) return 0.5;
  return nearestStopIndex(value, mode.stops) / (n - 1);
}

/** t → value. continuous 는 선형, stepped 는 round-to-stop. */
export function tToValue(t: number, mode: KnobMode): number {
  const c = clamp01(t);
  if (mode.kind === 'continuous') {
    return mode.min + c * (mode.max - mode.min);
  }
  const n = mode.stops.length;
  if (n === 0) return 0;
  if (n === 1) return mode.stops[0]!;
  return mode.stops[Math.round(c * (n - 1))]!;
}

export function tToAngleDeg(t: number): number {
  return KNOB_ROT_MIN_DEG + clamp01(t) * KNOB_ROT_SPAN_DEG;
}

export function valueToAngleDeg(value: number, mode: KnobMode): number {
  return tToAngleDeg(valueToT(value, mode));
}

/** stepped 모드 tick 좌표. continuous 면 빈 배열. */
export function tickAngles(
  mode: KnobMode,
): Array<{ angleDeg: number; value: number; index: number }> {
  if (mode.kind === 'continuous') return [];
  const n = mode.stops.length;
  if (n <= 1) return [];
  const out: Array<{ angleDeg: number; value: number; index: number }> = [];
  for (let i = 0; i < n; i++) {
    out.push({
      angleDeg: tToAngleDeg(i / (n - 1)),
      value: mode.stops[i]!,
      index: i,
    });
  }
  return out;
}

export function nearestStopIndex(value: number, stops: readonly number[]): number {
  if (stops.length === 0) return -1;
  let best = 0;
  let bestDist = Math.abs(value - stops[0]!);
  for (let i = 1; i < stops.length; i++) {
    const d = Math.abs(value - stops[i]!);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** stepped 모드 키보드 이동 — 인접 stop 으로 ±1 (양 끝 clamp). */
export function steppedNeighbor(
  value: number,
  stops: readonly number[],
  dir: -1 | 1,
): number {
  if (stops.length === 0) return value;
  const idx = nearestStopIndex(value, stops);
  return stops[clamp(idx + dir, 0, stops.length - 1)]!;
}

/** continuous 모드 키보드 이동 — value ± step, clamp. */
export function continuousStep(
  value: number,
  min: number,
  max: number,
  step: number,
  dir: -1 | 1,
): number {
  return clamp(value + dir * step, min, max);
}

/**
 * Selector Knob — 이산 선택 전용 변형. 인접 stop 사이 항상 45°,
 * 12시(0°)를 축으로 짝수 n 은 왼쪽 한 칸 더 확장한다 (왼쪽 우선).
 *
 * 공식: leftCount = ceil((n-1)/2), angles[i] = (i - leftCount) * 45°.
 *
 * - n=2 → [-45, 0]              (10:30, 12)
 * - n=3 → [-45, 0, +45]         (10:30, 12, 1:30)  대칭
 * - n=4 → [-90, -45, 0, +45]    (9, 10:30, 12, 1:30)
 * - n=5 → [-90, -45, 0, +45, +90] 대칭
 * - n=6 → [-135, -90, -45, 0, +45, +90]
 * - n=7 → [-135, -90, -45, 0, +45, +90, +135] 270° 풀 점유, 대칭
 *
 * n<2 / n>SELECTOR_MAX_STOPS 는 호출자가 검증한다. 공식은 그대로 적용.
 */
export const SELECTOR_STEP_DEG = 45;
export const SELECTOR_MAX_STOPS = 7;

export function selectorStopAngles(n: number): number[] {
  if (n <= 0) return [];
  const leftCount = Math.ceil((n - 1) / 2);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push((i - leftCount) * SELECTOR_STEP_DEG);
  }
  return out;
}

/** 우리 각도(12시=0°, 시계+) → SVG 표준(3시=0°, 시계+) 라디안 변환. */
function degToScreenRad(deg: number): number {
  return ((deg - 90) * Math.PI) / 180;
}

export function pointOnArc(
  cx: number,
  cy: number,
  r: number,
  deg: number,
): { x: number; y: number } {
  const a = degToScreenRad(deg);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/**
 * 호 SVG path. startDeg → endDeg (시계방향). startDeg > endDeg 면 빈 path.
 * 같은 각도면 한 점(시각 무효)이라 "M only" path 반환 — 호 없음.
 */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  if (endDeg <= startDeg) {
    const s = pointOnArc(cx, cy, r, startDeg);
    return `M ${s.x} ${s.y}`;
  }
  const s = pointOnArc(cx, cy, r, startDeg);
  const e = pointOnArc(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}
