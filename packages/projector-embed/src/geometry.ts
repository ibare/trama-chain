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

function rectBoundaryHit(
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

export function staticEdgePath(
  from: Point,
  to: Point,
  options: { lag: 0 | 1; fromBox?: BoxSize; toBox?: BoxSize } = { lag: 0 },
): { d: string; tip: Point; mid: Point; tangent: Point } {
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

  const c1: Point = {
    x: start.x + (end.x - start.x) * 0.3 + nx * offset,
    y: start.y + (end.y - start.y) * 0.3 + ny * offset,
  };
  const c2: Point = {
    x: start.x + (end.x - start.x) * 0.7 + nx * offset,
    y: start.y + (end.y - start.y) * 0.7 + ny * offset,
  };

  const d = `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;

  const mt = 0.5;
  const inv = 1 - mt;
  const mid: Point = {
    x: inv ** 3 * start.x + 3 * inv ** 2 * mt * c1.x + 3 * inv * mt ** 2 * c2.x + mt ** 3 * end.x,
    y: inv ** 3 * start.y + 3 * inv ** 2 * mt * c1.y + 3 * inv * mt ** 2 * c2.y + mt ** 3 * end.y,
  };

  const tx = 3 * (end.x - c2.x);
  const ty = 3 * (end.y - c2.y);
  const tlen = Math.sqrt(tx * tx + ty * ty) || 1;
  const tangent: Point = { x: tx / tlen, y: ty / tlen };

  return { d, tip: end, mid, tangent };
}

export function computeBounds(
  positions: Point[],
  padding = 80,
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
