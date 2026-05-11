import { tokens } from '@trama/tokens';

export interface Point {
  x: number;
  y: number;
}

export interface BoxSize {
  width: number;
  height: number;
}

const DEFAULT_BOX: BoxSize = {
  width: parseFloat(tokens.spacing.cardMinWidth),
  height: parseFloat(tokens.spacing.cardMinHeight),
};

const EDGE_GAP = 4;

interface EdgePathOptions {
  lag: 0 | 1;
  fromBox?: BoxSize;
  toBox?: BoxSize;
}

/**
 * 카드 중심에서 단위벡터 방향으로 진행할 때 사각형 경계와 만나는 점.
 * halfW, halfH는 사각형의 절반 폭/높이. 결과는 *center로부터의 오프셋*이 아니라 absolute point.
 */
export function rectBoundaryHit(
  center: Point,
  halfW: number,
  halfH: number,
  dirX: number,
  dirY: number,
): Point {
  const tx = dirX === 0 ? Infinity : halfW / Math.abs(dirX);
  const ty = dirY === 0 ? Infinity : halfH / Math.abs(dirY);
  const t = Math.min(tx, ty);
  return { x: center.x + dirX * t, y: center.y + dirY * t };
}

/**
 * 두 노드 중심 사이를 잇는 큐빅 베지에. 경계 사각형에서 시작·종료하도록 보정.
 * feedback이면 곡률을 크게.
 */
export function edgePath(
  from: Point,
  to: Point,
  options: EdgePathOptions = { lag: 0 },
): { d: string; tip: Point; mid: Point; tangent: Point } {
  const fromBox = options.fromBox ?? DEFAULT_BOX;
  const toBox = options.toBox ?? DEFAULT_BOX;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;

  // 각 박스의 boundary에서 시작/종료, 거기서 EDGE_GAP만큼 더 후진.
  const startHit = rectBoundaryHit(from, fromBox.width / 2, fromBox.height / 2, ux, uy);
  const endHit = rectBoundaryHit(to, toBox.width / 2, toBox.height / 2, -ux, -uy);
  const start: Point = { x: startHit.x + ux * EDGE_GAP, y: startHit.y + uy * EDGE_GAP };
  const end: Point = { x: endHit.x - ux * EDGE_GAP, y: endHit.y - uy * EDGE_GAP };

  // 곡률
  const curl = options.lag === 1 ? 0.6 : 0.18;
  const nx = -uy;
  const ny = ux;
  const offset = dist * curl;

  const c1: Point = {
    x: start.x + (end.x - start.x) * 0.3 + nx * offset,
    y: start.y + (end.y - start.y) * 0.3 + ny * offset,
  };
  const c2: Point = {
    x: start.x + (end.x - start.x) * 0.7 + nx * offset,
    y: start.y + (end.y - start.y) * 0.7 + ny * offset,
  };

  const d = `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;

  const mid = bezierAt(start, c1, c2, end, 0.5);
  const tangent = bezierTangent(start, c1, c2, end, 1.0);

  return { d, tip: end, mid, tangent };
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

/** 클릭 포인트와 베지어 경로 사이의 최단 거리(근사). */
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

/** edgePath와 동일한 control point 추출. 내부 재사용. */
export function edgeControls(
  from: Point,
  to: Point,
  options: EdgePathOptions = { lag: 0 },
): { p0: Point; p1: Point; p2: Point; p3: Point } {
  const fromBox = options.fromBox ?? DEFAULT_BOX;
  const toBox = options.toBox ?? DEFAULT_BOX;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const startHit = rectBoundaryHit(from, fromBox.width / 2, fromBox.height / 2, ux, uy);
  const endHit = rectBoundaryHit(to, toBox.width / 2, toBox.height / 2, -ux, -uy);
  const start: Point = { x: startHit.x + ux * EDGE_GAP, y: startHit.y + uy * EDGE_GAP };
  const end: Point = { x: endHit.x - ux * EDGE_GAP, y: endHit.y - uy * EDGE_GAP };
  const curl = options.lag === 1 ? 0.6 : 0.18;
  const nx = -uy;
  const ny = ux;
  const offset = dist * curl;
  const p1: Point = {
    x: start.x + (end.x - start.x) * 0.3 + nx * offset,
    y: start.y + (end.y - start.y) * 0.3 + ny * offset,
  };
  const p2: Point = {
    x: start.x + (end.x - start.x) * 0.7 + nx * offset,
    y: start.y + (end.y - start.y) * 0.7 + ny * offset,
  };
  return { p0: start, p1, p2, p3: end };
}
