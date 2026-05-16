import { ConstantRegistry } from './registry.js';
import type {
  BooleanConstantDefinition,
  ConstantDefinition,
  NumericConstantDefinition,
} from './types.js';

const PI: NumericConstantDefinition = {
  key: 'pi',
  valueKind: 'numeric',
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

const E: NumericConstantDefinition = {
  key: 'e',
  valueKind: 'numeric',
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

const GRAVITY: NumericConstantDefinition = {
  key: 'g',
  valueKind: 'numeric',
  labels: { ko: '중력가속도', en: 'Gravity' },
  symbol: 'g',
  value: 9.80665,
  description: {
    ko: '지표면 표준 중력가속도 (m/s²)',
    en: 'Standard gravity at Earth’s surface (m/s²)',
  },
  category: 'physics',
};

const SPEED_OF_LIGHT: NumericConstantDefinition = {
  key: 'c',
  valueKind: 'numeric',
  labels: { ko: '빛의 속도', en: 'Speed of light' },
  symbol: 'c',
  value: 299_792_458,
  description: {
    ko: '진공에서의 빛의 속도 (m/s)',
    en: 'Speed of light in vacuum (m/s)',
  },
  category: 'physics',
};

/** 카탈로그에 없는 단일 값 — UI에서 "직접 입력" 진입점이 사용. */
const CUSTOM_PLACEHOLDER: NumericConstantDefinition = {
  key: 'custom',
  valueKind: 'numeric',
  labels: { ko: '단일 값', en: 'Single value' },
  symbol: '?',
  value: 0,
  description: {
    ko: '사용자가 직접 수치를 입력',
    en: 'User-defined numeric value',
  },
  category: 'custom',
};

const TRUE_CONSTANT: BooleanConstantDefinition = {
  key: 'true',
  valueKind: 'boolean',
  labels: { ko: '참', en: 'True' },
  symbol: '⊤',
  value: true,
  description: {
    ko: '논리값 참',
    en: 'Logical true',
  },
  category: 'logic',
};

const FALSE_CONSTANT: BooleanConstantDefinition = {
  key: 'false',
  valueKind: 'boolean',
  labels: { ko: '거짓', en: 'False' },
  symbol: '⊥',
  value: false,
  description: {
    ko: '논리값 거짓',
    en: 'Logical false',
  },
  category: 'logic',
};

export const DEFAULT_CONSTANTS: readonly ConstantDefinition[] = [
  PI,
  E,
  GRAVITY,
  SPEED_OF_LIGHT,
  CUSTOM_PLACEHOLDER,
  TRUE_CONSTANT,
  FALSE_CONSTANT,
];

export function createDefaultConstantRegistry(): ConstantRegistry {
  const reg = new ConstantRegistry();
  for (const d of DEFAULT_CONSTANTS) reg.register(d);
  return reg;
}
