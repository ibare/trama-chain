/**
 * 떠 있는 패널(인스펙터·picker)을 anchor 옆에 배치하되 화면 경계를 넘지
 * 않도록 좌표를 보정한다.
 *
 * - 기본: anchor 우측 + 오프셋 위치
 * - 우측 공간 부족 시: anchor 좌측으로 flip
 * - 양쪽 모두 부족(좁은 화면)하면 가능한 한 안에 들어오도록 클램프
 * - y는 항상 [minY, maxY - h] 범위로 클램프
 */
export interface PlaceInput {
  anchor: { x: number; y: number };
  panel: { w: number; h: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** anchor에서 패널까지의 우측/하단 여백 (좌측으로 flip 시에도 같은 간격 적용) */
  gap?: { x: number; y: number };
}

export interface PlaceResult {
  x: number;
  y: number;
  /** flip 여부 — 화살표/말풍선 방향 표시 등에 활용 */
  side: 'right' | 'left';
}

export function placePanel({ anchor, panel, bounds, gap = { x: 14, y: 0 } }: PlaceInput): PlaceResult {
  const rightX = anchor.x + gap.x;
  const leftX = anchor.x - gap.x - panel.w;
  const fitsRight = rightX + panel.w <= bounds.maxX;
  const fitsLeft = leftX >= bounds.minX;

  let x: number;
  let side: 'right' | 'left';
  if (fitsRight) {
    x = rightX;
    side = 'right';
  } else if (fitsLeft) {
    x = leftX;
    side = 'left';
  } else {
    // 양쪽 다 안 됨 — 더 여유 있는 쪽에 두고 클램프
    const rightOverflow = rightX + panel.w - bounds.maxX;
    const leftOverflow = bounds.minX - leftX;
    if (rightOverflow <= leftOverflow) {
      x = Math.min(rightX, bounds.maxX - panel.w);
      side = 'right';
    } else {
      x = Math.max(leftX, bounds.minX);
      side = 'left';
    }
  }
  x = Math.max(bounds.minX, Math.min(x, bounds.maxX - panel.w));

  let y = anchor.y + gap.y;
  y = Math.max(bounds.minY, Math.min(y, bounds.maxY - panel.h));

  return { x, y, side };
}
