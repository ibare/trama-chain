import { describe, expect, it } from 'vitest';
import {
  KNOB_ROT_MAX_DEG,
  KNOB_ROT_MIN_DEG,
  arcPath,
  clamp,
  clamp01,
  continuousStep,
  nearestStopIndex,
  pointOnArc,
  selectorStopAngles,
  steppedNeighbor,
  tToAngleDeg,
  tToValue,
  tickAngles,
  valueToAngleDeg,
  valueToT,
  type KnobMode,
} from '../src/node/knob/knob-geometry.js';

const CONT: KnobMode = { kind: 'continuous', min: 0, max: 100 };
const STEP: KnobMode = { kind: 'stepped', stops: [1, 2, 5, 10, 20, 60] };

describe('clamp / clamp01', () => {
  it('clamps to [lo, hi]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
  it('clamp01 narrows to [0,1]', () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(-0.1)).toBe(0);
    expect(clamp01(1.7)).toBe(1);
  });
});

describe('continuous valueToT / tToValue', () => {
  it('maps linearly', () => {
    expect(valueToT(0, CONT)).toBe(0);
    expect(valueToT(50, CONT)).toBe(0.5);
    expect(valueToT(100, CONT)).toBe(1);
    expect(tToValue(0, CONT)).toBe(0);
    expect(tToValue(0.25, CONT)).toBe(25);
    expect(tToValue(1, CONT)).toBe(100);
  });
  it('clamps t outside [0,1]', () => {
    expect(tToValue(-0.5, CONT)).toBe(0);
    expect(tToValue(1.5, CONT)).toBe(100);
    expect(valueToT(-10, CONT)).toBe(0);
    expect(valueToT(200, CONT)).toBe(1);
  });
  it('degenerate min===max returns 0', () => {
    const d: KnobMode = { kind: 'continuous', min: 7, max: 7 };
    expect(valueToT(7, d)).toBe(0);
  });
});

describe('stepped valueToT / tToValue', () => {
  it('snaps value to nearest stop index', () => {
    expect(valueToT(1, STEP)).toBeCloseTo(0);
    expect(valueToT(60, STEP)).toBeCloseTo(1);
    // n=6 stops → indices 0..5, idx/5
    expect(valueToT(5, STEP)).toBeCloseTo(2 / 5);
    // 3 is between 2 and 5 → nearest is 2 (idx 1)
    expect(valueToT(3, STEP)).toBeCloseTo(1 / 5);
    // 3.5 is equidistant from 2 and 5 → nearestStopIndex picks earlier (idx 1)
    expect(valueToT(3.5, STEP)).toBeCloseTo(1 / 5);
    // 4 is closer to 5 than 2 → nearest is 5 (idx 2)
    expect(valueToT(4, STEP)).toBeCloseTo(2 / 5);
  });
  it('tToValue rounds to stop', () => {
    expect(tToValue(0, STEP)).toBe(1);
    expect(tToValue(1, STEP)).toBe(60);
    expect(tToValue(2 / 5, STEP)).toBe(5);
    // mid-bucket rounds up
    expect(tToValue(0.5 / 5 + 0.001, STEP)).toBe(2);
  });
  it('single-stop returns center', () => {
    const s: KnobMode = { kind: 'stepped', stops: [42] };
    expect(valueToT(0, s)).toBe(0.5);
    expect(tToValue(0.1, s)).toBe(42);
    expect(tToValue(0.9, s)).toBe(42);
  });
});

describe('angles', () => {
  it('tToAngleDeg spans [-135, 135]', () => {
    expect(tToAngleDeg(0)).toBe(KNOB_ROT_MIN_DEG);
    expect(tToAngleDeg(1)).toBe(KNOB_ROT_MAX_DEG);
    expect(tToAngleDeg(0.5)).toBe(0);
  });
  it('valueToAngleDeg composes valueToT', () => {
    expect(valueToAngleDeg(50, CONT)).toBe(0);
    expect(valueToAngleDeg(60, STEP)).toBe(KNOB_ROT_MAX_DEG);
  });
});

describe('tickAngles', () => {
  it('continuous has no ticks', () => {
    expect(tickAngles(CONT)).toEqual([]);
  });
  it('stepped distributes evenly', () => {
    const ticks = tickAngles(STEP);
    expect(ticks).toHaveLength(6);
    expect(ticks[0]!.value).toBe(1);
    expect(ticks[0]!.angleDeg).toBe(KNOB_ROT_MIN_DEG);
    expect(ticks[5]!.value).toBe(60);
    expect(ticks[5]!.angleDeg).toBe(KNOB_ROT_MAX_DEG);
    // evenly spaced
    const d = ticks[1]!.angleDeg - ticks[0]!.angleDeg;
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!.angleDeg - ticks[i - 1]!.angleDeg).toBeCloseTo(d);
    }
  });
});

describe('nearestStopIndex', () => {
  it('returns index of closest stop', () => {
    expect(nearestStopIndex(1, [1, 2, 5])).toBe(0);
    expect(nearestStopIndex(2, [1, 2, 5])).toBe(1);
    expect(nearestStopIndex(4, [1, 2, 5])).toBe(2);
    // tie → earlier wins (current scan order)
    expect(nearestStopIndex(3.5, [1, 2, 5])).toBe(1);
  });
  it('empty stops → -1', () => {
    expect(nearestStopIndex(0, [])).toBe(-1);
  });
});

describe('keyboard helpers', () => {
  it('steppedNeighbor moves ±1 then clamps', () => {
    expect(steppedNeighbor(5, [1, 2, 5, 10], 1)).toBe(10);
    expect(steppedNeighbor(5, [1, 2, 5, 10], -1)).toBe(2);
    expect(steppedNeighbor(10, [1, 2, 5, 10], 1)).toBe(10);
    expect(steppedNeighbor(1, [1, 2, 5, 10], -1)).toBe(1);
  });
  it('continuousStep adds step and clamps', () => {
    expect(continuousStep(5, 0, 10, 1, 1)).toBe(6);
    expect(continuousStep(5, 0, 10, 1, -1)).toBe(4);
    expect(continuousStep(10, 0, 10, 5, 1)).toBe(10);
    expect(continuousStep(0, 0, 10, 5, -1)).toBe(0);
  });
});

describe('selectorStopAngles — n 별 각도 배열', () => {
  it('n=2 → 왼쪽 우선 비대칭 [-45, 0]', () => {
    expect(selectorStopAngles(2)).toEqual([-45, 0]);
  });
  it('n=3 → 12시 중심 대칭 [-45, 0, +45]', () => {
    expect(selectorStopAngles(3)).toEqual([-45, 0, 45]);
  });
  it('n=4 → 왼쪽 우선 [-90, -45, 0, +45]', () => {
    expect(selectorStopAngles(4)).toEqual([-90, -45, 0, 45]);
  });
  it('n=5 → 대칭 [-90, -45, 0, +45, +90]', () => {
    expect(selectorStopAngles(5)).toEqual([-90, -45, 0, 45, 90]);
  });
  it('n=6 → 왼쪽 우선 [-135, -90, -45, 0, +45, +90]', () => {
    expect(selectorStopAngles(6)).toEqual([-135, -90, -45, 0, 45, 90]);
  });
  it('n=7 → 270° 풀 점유 대칭 [-135 … +135]', () => {
    expect(selectorStopAngles(7)).toEqual([-135, -90, -45, 0, 45, 90, 135]);
  });
  it('각 stop 사이 간격은 항상 45°', () => {
    for (let n = 2; n <= 7; n++) {
      const a = selectorStopAngles(n);
      for (let i = 1; i < a.length; i++) {
        expect(a[i]! - a[i - 1]!).toBe(45);
      }
    }
  });
  it('n<=0 → 빈 배열', () => {
    expect(selectorStopAngles(0)).toEqual([]);
    expect(selectorStopAngles(-1)).toEqual([]);
  });
});

describe('pointOnArc / arcPath', () => {
  it('places points correctly on cardinal angles', () => {
    // 12시 = 0° → (cx, cy - r)
    const p0 = pointOnArc(0, 0, 10, 0);
    expect(p0.x).toBeCloseTo(0);
    expect(p0.y).toBeCloseTo(-10);
    // 3시 = 90° → (cx + r, cy)
    const p90 = pointOnArc(0, 0, 10, 90);
    expect(p90.x).toBeCloseTo(10);
    expect(p90.y).toBeCloseTo(0);
    // 6시 = 180° → (cx, cy + r)
    const p180 = pointOnArc(0, 0, 10, 180);
    expect(p180.x).toBeCloseTo(0);
    expect(p180.y).toBeCloseTo(10);
  });
  it('arcPath: end <= start collapses to M-only path', () => {
    expect(arcPath(0, 0, 10, 0, 0)).toMatch(/^M /);
    expect(arcPath(0, 0, 10, 90, 30)).toMatch(/^M /);
    // no "A" command
    expect(arcPath(0, 0, 10, 90, 30)).not.toMatch(/A/);
  });
  it('arcPath: forward arc has A command and large-arc flag set correctly', () => {
    const small = arcPath(0, 0, 10, 0, 90);
    expect(small).toMatch(/A 10 10 0 0 1 /);
    const large = arcPath(0, 0, 10, -135, 135);
    expect(large).toMatch(/A 10 10 0 1 1 /);
  });
});
