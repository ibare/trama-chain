export interface Point {
  x: number;
  y: number;
}

export interface EdgePathOptions {
  lag: 0 | 1;
}

/**
 * 두 *소켓 좌표* 사이를 잇는 큐빅 베지에.
 * 소켓은 항상 카드 좌우(수평) 방향이므로 control point는 수평 방향으로 잡아 자연스럽게 흐른다.
 * feedback(lag=1)이면 수직 방향으로 큰 곡률을 더해 루프 형태로.
 */
export function edgePath(
  start: Point,
  end: Point,
  options: EdgePathOptions = { lag: 0 },
): { d: string; tip: Point; mid: Point; tangent: Point } {
  const { p0, p1, p2, p3 } = edgeControls(start, end, options);
  const d = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
  const mid = bezierAt(p0, p1, p2, p3, 0.5);
  const tangent = bezierTangent(p0, p1, p2, p3, 1.0);
  return { d, tip: p3, mid, tangent };
}

export function edgeControls(
  start: Point,
  end: Point,
  options: EdgePathOptions = { lag: 0 },
): { p0: Point; p1: Point; p2: Point; p3: Point } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (options.lag === 1) {
    const ax = Math.max(80, Math.abs(dx) * 0.5 + 60);
    const arcSign = dy >= 0 ? -1 : 1;
    const arcMag = Math.abs(dy) * 0.5 + 70;
    const p1: Point = { x: start.x + ax, y: start.y + arcSign * arcMag };
    const p2: Point = { x: end.x - ax, y: end.y + arcSign * arcMag };
    return { p0: start, p1, p2, p3: end };
  }

  const pull = Math.max(40, Math.abs(dx) * 0.45);
  const p1: Point = { x: start.x + pull, y: start.y };
  const p2: Point = { x: end.x - pull, y: end.y };
  return { p0: start, p1, p2, p3: end };
}

export function bezierAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
  const y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;
  return { x, y };
}

export function bezierTangent(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const x =
    3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const y =
    3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  const len = Math.sqrt(x * x + y * y) || 1;
  return { x: x / len, y: y / len };
}

export function bezierDistanceTo(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  pt: Point,
  samples = 24,
): { dist: number; t: number; point: Point } {
  let bestDist = Infinity;
  let bestT = 0;
  let best: Point = p0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = bezierAt(p0, p1, p2, p3, t);
    const dx = p.x - pt.x;
    const dy = p.y - pt.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
      best = p;
    }
  }
  return { dist: bestDist, t: bestT, point: best };
}
