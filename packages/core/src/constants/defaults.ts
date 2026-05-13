import { ConstantRegistry } from './registry.js';
import type { ConstantDefinition } from './types.js';

const PI: ConstantDefinition = {
  key: 'pi',
  labels: { ko: '원주율', en: 'Pi' },
  symbol: 'π',
  value: Math.PI,
  description: {
    ko: '원의 둘레와 지름의 비',
    en: 'Ratio of a circle’s circumference to its diameter',
  },
  category: 'math',
  fizzexName: 'π',
};

const E: ConstantDefinition = {
  key: 'e',
  labels: { ko: '자연상수', en: 'Euler’s number' },
  symbol: 'e',
  value: Math.E,
  description: {
    ko: '자연로그의 밑',
    en: 'Base of the natural logarithm',
  },
  category: 'math',
  fizzexName: 'e',
};

const ONE_HALF: ConstantDefinition = {
  key: 'one-half',
  labels: { ko: '이분의 일', en: 'One half' },
  symbol: '½',
  value: 0.5,
  category: 'math',
};

const ONE_THIRD: ConstantDefinition = {
  key: 'one-third',
  labels: { ko: '삼분의 일', en: 'One third' },
  symbol: '⅓',
  value: 1 / 3,
  category: 'math',
};

const ONE_FOURTH: ConstantDefinition = {
  key: 'one-fourth',
  labels: { ko: '사분의 일', en: 'One fourth' },
  symbol: '¼',
  value: 0.25,
  category: 'math',
};

const GRAVITY: ConstantDefinition = {
  key: 'g',
  labels: { ko: '중력가속도', en: 'Gravity' },
  symbol: 'g',
  value: 9.80665,
  description: {
    ko: '지표면 표준 중력가속도 (m/s²)',
    en: 'Standard gravity at Earth’s surface (m/s²)',
  },
  category: 'physics',
};

const SPEED_OF_LIGHT: ConstantDefinition = {
  key: 'c',
  labels: { ko: '빛의 속도', en: 'Speed of light' },
  symbol: 'c',
  value: 299_792_458,
  description: {
    ko: '진공에서의 빛의 속도 (m/s)',
    en: 'Speed of light in vacuum (m/s)',
  },
  category: 'physics',
};

/** 카탈로그에 없는 임의 수 — UI에서 "직접 입력" 진입점이 사용. */
const CUSTOM_PLACEHOLDER: ConstantDefinition = {
  key: 'custom',
  labels: { ko: '임의 수', en: 'Custom number' },
  symbol: '?',
  value: 0,
  description: {
    ko: '사용자가 직접 수치를 입력',
    en: 'User-defined numeric value',
  },
  category: 'custom',
};

export const DEFAULT_CONSTANTS: readonly ConstantDefinition[] = [
  PI,
  E,
  ONE_HALF,
  ONE_THIRD,
  ONE_FOURTH,
  GRAVITY,
  SPEED_OF_LIGHT,
  CUSTOM_PLACEHOLDER,
];

export function createDefaultConstantRegistry(): ConstantRegistry {
  const reg = new ConstantRegistry();
  for (const d of DEFAULT_CONSTANTS) reg.register(d);
  return reg;
}
