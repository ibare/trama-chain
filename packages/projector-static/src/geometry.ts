export interface Point {
  x: number;
  y: number;
}

/**
 * 두 *소켓 좌표* 사이를 잇는 큐빅 베지에. 핀이 카드 좌우(수평)에 있으므로
 * control point는 수평 방향으로 잡고, feedback이면 큰 곡률.
 */
export function staticEdgePath(
  start: Point,
  end: Point,
  options: { lag: 0 | 1 } = { lag: 0 },
): { d: string; tip: Point; mid: Point; tangent: Point } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  let p1: Point;
  let p2: Point;
  if (options.lag === 1) {
    const ax = Math.max(80, Math.abs(dx) * 0.5 + 60);
    const arcSign = dy >= 0 ? -1 : 1;
    const arcMag = Math.abs(dy) * 0.5 + 70;
    p1 = { x: start.x + ax, y: start.y + arcSign * arcMag };
    p2 = { x: end.x - ax, y: end.y + arcSign * arcMag };
  } else {
    const pull = Math.max(40, Math.abs(dx) * 0.45);
    p1 = { x: start.x + pull, y: start.y };
    p2 = { x: end.x - pull, y: end.y };
  }

  const d = `M ${start.x} ${start.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${end.x} ${end.y}`;

  const mt = 0.5;
  const inv = 1 - mt;
  const mid: Point = {
    x: inv ** 3 * start.x + 3 * inv ** 2 * mt * p1.x + 3 * inv * mt ** 2 * p2.x + mt ** 3 * end.x,
    y: inv ** 3 * start.y + 3 * inv ** 2 * mt * p1.y + 3 * inv * mt ** 2 * p2.y + mt ** 3 * end.y,
  };

  const tx = 3 * (end.x - p2.x);
  const ty = 3 * (end.y - p2.y);
  const tlen = Math.sqrt(tx * tx + ty * ty) || 1;
  const tangent: Point = { x: tx / tlen, y: ty / tlen };

  return { d, tip: end, mid, tangent };
}

export function computeBounds(
  positions: Point[],
  padding = 100,
): { minX: number; minY: number; width: number; height: number } {
  if (positions.length === 0) {
    return { minX: 0, minY: 0, width: 600, height: 400 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}
