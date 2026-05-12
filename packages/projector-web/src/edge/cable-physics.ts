/**
 * 엣지를 케이블처럼 매달리게 보여주는 Verlet integration + distance constraint
 * 시뮬레이션. patchbay-js의 코어 알고리즘을 그대로 TS로 옮기되, 렌더링·드래그·snap은
 * 우리 흐름을 그대로 두고 "점 배열"만 다룬다.
 *
 * 책임 경계
 * ---------
 * - 입력: 두 끝점(start/end). 호출자가 매 프레임 갱신한다.
 * - 출력: points 배열. 호출자가 polyline 등으로 그린다.
 * - 부수효과 없음. DOM/React/store 의존 없음.
 *
 * 끝점은 stepCable이 강제로 points[0]·points[N-1]에 대입하므로 노드 이동에
 * 즉시 따라붙는다. 중간 점들은 Verlet 적분 + 5회 반복 거리 제약 해소로 자연스러운
 * sag를 만든다.
 */

export interface CablePoint {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
}

export interface CableConfig {
  /** 매 프레임 y에 더할 가속도(px). 0이면 sag 없음. */
  gravity: number;
  /** 거리 제약 완화 반복 횟수. 많을수록 강체에 가깝다. */
  iterations: number;
  /** 총 점 수(양 끝 포함). 많을수록 부드럽지만 비용 증가. */
  segments: number;
  /** 케이블 길이 배율. 1.0 = taut, 1.05 = 5% 처짐. */
  slack: number;
}

export const DEFAULT_CABLE_CONFIG: CableConfig = {
  gravity: 0.55,
  iterations: 5,
  segments: 16,
  slack: 1.04,
};

/** 모듈 전역 on/off 플래그 — 회귀 시 false로 두면 기존 베지어 경로로 폴백. */
export const EDGE_PHYSICS_ENABLED = true;

export interface Cable {
  config: CableConfig;
  points: CablePoint[];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export function createCable(
  start: { x: number; y: number },
  end: { x: number; y: number },
  config: CableConfig = DEFAULT_CABLE_CONFIG,
): Cable {
  const points: CablePoint[] = [];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const totalLength = Math.hypot(dx, dy) * config.slack;
  const segmentLength = totalLength / (config.segments - 1);

  points.push({ x: start.x, y: start.y, oldX: start.x, oldY: start.y });
  // 작은 지터 — 첫 프레임부터 균등 직선이 아닌 곡선으로 풀리게.
  for (let i = 1; i < config.segments - 1; i++) {
    const t = i / (config.segments - 1);
    const x = start.x + dx * t + (Math.random() - 0.5) * segmentLength;
    const y = start.y + dy * t + (Math.random() - 0.5) * segmentLength;
    points.push({ x, y, oldX: x, oldY: y });
  }
  points.push({ x: end.x, y: end.y, oldX: end.x, oldY: end.y });

  return { config, points, start: { ...start }, end: { ...end } };
}

export function setCableEndpoints(
  cable: Cable,
  start: { x: number; y: number },
  end: { x: number; y: number },
): void {
  cable.start.x = start.x;
  cable.start.y = start.y;
  cable.end.x = end.x;
  cable.end.y = end.y;
}

export function stepCable(cable: Cable): void {
  const { points, config, start, end } = cable;
  const n = points.length;

  // 끝점 강제. 노드가 움직이면 즉시 따라붙음.
  points[0]!.x = start.x;
  points[0]!.y = start.y;
  points[n - 1]!.x = end.x;
  points[n - 1]!.y = end.y;

  // Verlet 적분 — 중간 점만.
  for (let i = 1; i < n - 1; i++) {
    const p = points[i]!;
    const vx = p.x - p.oldX;
    const vy = p.y - p.oldY + config.gravity;
    p.oldX = p.x;
    p.oldY = p.y;
    p.x += vx;
    p.y += vy;
  }

  // 거리 제약 완화. 양 끝점은 push 적용 제외(이미 pin).
  const segmentLength = (Math.hypot(end.x - start.x, end.y - start.y) * config.slack) / (n - 1);
  for (let it = 0; it < config.iterations; it++) {
    for (let i = 0; i < n - 1; i++) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const d = Math.hypot(dx, dy);
      if (d === 0) continue;
      const diff = (segmentLength - d) / d;
      const ox = dx * 0.5 * diff;
      const oy = dy * 0.5 * diff;
      if (i > 0) {
        p1.x -= ox;
        p1.y -= oy;
      }
      if (i < n - 2) {
        p2.x += ox;
        p2.y += oy;
      }
    }
  }
}

/** polyline points 속성용 문자열. */
export function cableToPoints(cable: Cable): string {
  let s = '';
  for (let i = 0; i < cable.points.length; i++) {
    const p = cable.points[i]!;
    if (i > 0) s += ' ';
    s += `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }
  return s;
}

/** 화살촉 위치·방향 — 마지막 점과 직전 점으로 계산. */
export function cableEndTangent(cable: Cable): {
  tip: { x: number; y: number };
  tangent: { x: number; y: number };
} {
  const n = cable.points.length;
  const tip = cable.points[n - 1]!;
  const prev = cable.points[n - 2] ?? cable.points[0]!;
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  return { tip: { x: tip.x, y: tip.y }, tangent: { x: dx / len, y: dy / len } };
}

/** 중간 affordance(엣지에 함수 끼우기 핀) 위치 — 가장 처진 지점에 가까움. */
export function cableMidpoint(cable: Cable): { x: number; y: number } {
  const n = cable.points.length;
  const p = cable.points[Math.floor(n / 2)]!;
  return { x: p.x, y: p.y };
}
