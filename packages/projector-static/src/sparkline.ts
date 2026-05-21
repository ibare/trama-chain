/**
 * (t, value) 시계열을 bbox 안에 채우는 단순 polyline path d 문자열을 만든다.
 * - 샘플 2 개 미만이면 빈 문자열.
 * - t 는 가로축, accessor(sample) 는 세로축.
 * - 시계열 범위 [tMin, tMax], [vMin, vMax] 가 박스 안 비율로 매핑된다.
 * - 값 범위가 0 이면 세로 중앙선으로 평탄화.
 *
 * Projector-static 전용 zero-compute 헬퍼 — RAF·tween 없음. 입력 배열을 한 번
 * 훑어 path d 만 반환한다.
 */
export interface SparklineSample {
  t: number;
}

export interface SparklineBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function sparklinePath<T extends SparklineSample>(
  samples: readonly T[],
  bbox: SparklineBox,
  accessor: (s: T) => number,
): string {
  if (samples.length < 2) return '';
  let tMin = Infinity;
  let tMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const s of samples) {
    const v = accessor(s);
    if (!Number.isFinite(v) || !Number.isFinite(s.t)) continue;
    if (s.t < tMin) tMin = s.t;
    if (s.t > tMax) tMax = s.t;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  if (!Number.isFinite(tMin) || !Number.isFinite(vMin)) return '';
  const tSpan = tMax - tMin || 1;
  const vSpan = vMax - vMin;
  const midY = bbox.y + bbox.h / 2;
  let d = '';
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const v = accessor(s);
    if (!Number.isFinite(v) || !Number.isFinite(s.t)) continue;
    const px = bbox.x + ((s.t - tMin) / tSpan) * bbox.w;
    const py =
      vSpan === 0
        ? midY
        : bbox.y + bbox.h - ((v - vMin) / vSpan) * bbox.h;
    d += d === '' ? `M ${px} ${py}` : ` L ${px} ${py}`;
  }
  return d;
}
