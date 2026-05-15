/**
 * OKLCH primitive 팔레트 — 셀 스킨 전용 인라인 모듈.
 *
 * 토큰 시스템(@trama/tokens)이 OKLCH로 전환되면 이 모듈은 토큰으로 승격되고
 * 여기서는 단순 re-export만 남게 된다. 그 전까지는 셀 스킨·컬러 피커가
 * 공유하는 단일 출처.
 *
 * 설계:
 *   - hue는 primitive별 고정 (red=29°, blue=240° 등 OKLCH 각도).
 *   - shade 11단계 (50~950)는 lightness(L)와 chroma 스케일을 함께 변화.
 *   - dim은 별도 함수가 아니라 "shade를 옅은 쪽으로 시프트"하는 같은 축의 연산.
 *     같은 hue를 유지하며 자연스러운 비활성 톤이 나온다.
 *
 * 저장 형식은 SwatchRef ({ primitive, shade }) — round-trip 결정성을 위해
 * 계산된 OKLCH 문자열이 아니라 토큰 키를 직렬화.
 */

export type ShadeKey =
  | '50' | '100' | '200' | '300' | '400'
  | '500' | '600' | '700' | '800' | '900' | '950';

export type PrimitiveKey =
  | 'red' | 'orange' | 'amber' | 'green' | 'teal'
  | 'blue' | 'violet' | 'pink' | 'gray';

export interface SwatchRef {
  primitive: PrimitiveKey;
  shade: ShadeKey;
}

export const SHADES: readonly ShadeKey[] = [
  '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950',
] as const;

export const PRIMITIVES: readonly PrimitiveKey[] = [
  'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink', 'gray',
] as const;

/** primitive의 OKLCH hue 각도와 500-shade 기준 peak chroma. */
const PRIMITIVE_AXIS: Record<PrimitiveKey, { hue: number; peakChroma: number }> = {
  red:    { hue: 27,  peakChroma: 0.20 },
  orange: { hue: 55,  peakChroma: 0.18 },
  amber:  { hue: 80,  peakChroma: 0.17 },
  green:  { hue: 145, peakChroma: 0.18 },
  teal:   { hue: 185, peakChroma: 0.13 },
  blue:   { hue: 240, peakChroma: 0.17 },
  violet: { hue: 298, peakChroma: 0.19 },
  pink:   { hue: 350, peakChroma: 0.18 },
  gray:   { hue: 240, peakChroma: 0.01 },
};

/** shade별 OKLCH lightness와 chroma 스케일 (peak chroma에 곱해진다). */
const SHADE_AXIS: Record<ShadeKey, { L: number; cScale: number }> = {
  '50':  { L: 0.975, cScale: 0.18 },
  '100': { L: 0.940, cScale: 0.35 },
  '200': { L: 0.880, cScale: 0.60 },
  '300': { L: 0.800, cScale: 0.85 },
  '400': { L: 0.700, cScale: 0.95 },
  '500': { L: 0.595, cScale: 1.00 },
  '600': { L: 0.510, cScale: 0.95 },
  '700': { L: 0.425, cScale: 0.85 },
  '800': { L: 0.340, cScale: 0.70 },
  '900': { L: 0.255, cScale: 0.50 },
  '950': { L: 0.180, cScale: 0.32 },
};

/** OKLCH 색 문자열을 생성. CSS color value로 그대로 사용 가능. */
export function swatch(primitive: PrimitiveKey, shade: ShadeKey): string {
  const p = PRIMITIVE_AXIS[primitive];
  const s = SHADE_AXIS[shade];
  return `oklch(${s.L.toFixed(3)} ${(p.peakChroma * s.cScale).toFixed(3)} ${p.hue})`;
}

export function resolveSwatch(ref: SwatchRef): string {
  return swatch(ref.primitive, ref.shade);
}

/**
 * 같은 hue를 유지하며 더 옅은 shade로 시프트한 색.
 *
 * amount 0..1: 0이면 그대로, 1이면 가장 옅은 50까지. 기본 0.6은 약 6단계 위로
 * 이동해 "은은한 같은 계열"의 느낌이 나오는 지점.
 */
export function dim(ref: SwatchRef, amount: number = 0.6): string {
  const clamped = Math.max(0, Math.min(1, amount));
  if (clamped <= 0) return resolveSwatch(ref);
  const i = SHADES.indexOf(ref.shade);
  if (i < 0) return resolveSwatch(ref);
  const target = Math.max(0, Math.round(i * (1 - clamped)));
  return swatch(ref.primitive, SHADES[target]!);
}

/** 컬러 피커에서 한 primitive의 11 shade를 한 줄로 노출할 때 사용. */
export function shadeRow(primitive: PrimitiveKey): ReadonlyArray<{ shade: ShadeKey; color: string }> {
  return SHADES.map((shade) => ({ shade, color: swatch(primitive, shade) }));
}
