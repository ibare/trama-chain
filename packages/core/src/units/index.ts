export type Unit =
  | { kind: 'number'; suffix: string; min: number; max: number }
  | { kind: 'scale'; min: number; max: number }
  | { kind: 'label'; values: string[] }
  | { kind: 'free' };

/**
 * 노드의 실제 값을 [0, 1]로 정규화한다. 함수 형태가 항상 [0,1]→[0,1]을
 * 입출력하기 때문에 propagation 직전에 호출된다.
 */
export function normalize(value: number, unit: Unit): number {
  switch (unit.kind) {
    case 'number':
    case 'scale': {
      const range = unit.max - unit.min;
      if (range === 0) return 0;
      const t = (value - unit.min) / range;
      return clamp01(t);
    }
    case 'label': {
      const n = unit.values.length;
      if (n <= 1) return 0;
      const idx = Math.round(value);
      return clamp01(idx / (n - 1));
    }
    case 'free':
      return clamp01(value);
  }
}

/** 함수가 낸 [0,1] 출력을 실제 단위로 환원한다. */
export function denormalize(t: number, unit: Unit): number {
  const clamped = clamp01(t);
  switch (unit.kind) {
    case 'number':
    case 'scale':
      return unit.min + clamped * (unit.max - unit.min);
    case 'label': {
      const n = unit.values.length;
      if (n <= 1) return 0;
      return Math.round(clamped * (n - 1));
    }
    case 'free':
      return clamped;
  }
}

/** 단위의 자연스러운 범위로 실제 값을 강제 한정한다. */
export function clampToUnit(value: number, unit: Unit): number {
  switch (unit.kind) {
    case 'number':
    case 'scale':
      return Math.min(unit.max, Math.max(unit.min, value));
    case 'label': {
      const n = unit.values.length;
      if (n === 0) return 0;
      const idx = Math.round(value);
      return Math.min(n - 1, Math.max(0, idx));
    }
    case 'free':
      return value;
  }
}

export function clamp01(t: number): number {
  if (Number.isNaN(t)) return 0;
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}
