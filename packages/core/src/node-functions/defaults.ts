import type { ResolvedUnit } from '../units/index.js';
import { FunctionRegistry } from './registry.js';
import type { FunctionDefinition } from './types.js';

/** slot이 ref한 슬롯의 unitId를 그대로 출력으로. 합·차·min·max에 쓰임. */
function passthroughSlotUnit(
  slot: number,
): (inputUnits: readonly ResolvedUnit[]) => string | null {
  return (inputUnits) => inputUnits[slot]?.id ?? null;
}

const multiply: FunctionDefinition = {
  key: 'multiply',
  labels: { ko: '곱셈', en: 'Multiply' },
  symbol: '×',
  slots: [
    { label: { ko: 'a', en: 'a' }, constraint: { kind: 'number' } },
    { label: { ko: 'b', en: 'b' }, constraint: { kind: 'number' } },
  ],
  compute: ([a, b]) => (a ?? 0) * (b ?? 0),
  // 곱셈의 출력 단위는 합성 단위(예: m × m = m²)이지만 v1에선 단위 합성을 하지
  // 않으므로 사용자가 outputUnitId를 지정하도록 둔다. 자동 도출 안 함.
};

const add: FunctionDefinition = {
  key: 'add',
  labels: { ko: '덧셈', en: 'Add' },
  symbol: '+',
  slots: [
    { label: { ko: 'a', en: 'a' }, constraint: { kind: 'number' } },
    { label: { ko: 'b', en: 'b' }, constraint: { kind: 'sameAsSlot', ref: 0 } },
  ],
  compute: ([a, b]) => (a ?? 0) + (b ?? 0),
  deriveOutputUnit: passthroughSlotUnit(0),
};

const subtract: FunctionDefinition = {
  key: 'subtract',
  labels: { ko: '뺄셈', en: 'Subtract' },
  symbol: '−',
  slots: [
    { label: { ko: '피감수', en: 'minuend' }, constraint: { kind: 'number' } },
    { label: { ko: '감수', en: 'subtrahend' }, constraint: { kind: 'sameAsSlot', ref: 0 } },
  ],
  compute: ([a, b]) => (a ?? 0) - (b ?? 0),
  deriveOutputUnit: passthroughSlotUnit(0),
};

const divide: FunctionDefinition = {
  key: 'divide',
  labels: { ko: '나눗셈', en: 'Divide' },
  symbol: '÷',
  slots: [
    { label: { ko: '분자', en: 'numerator' }, constraint: { kind: 'number' } },
    { label: { ko: '분모', en: 'denominator' }, constraint: { kind: 'number' } },
  ],
  compute: ([a, b]) => {
    if (b === 0 || b === undefined) return Number.NaN;
    return (a ?? 0) / b;
  },
  // 비율·역수 단위로 결과가 나오므로 자동 도출 없이 사용자 지정. (m / s = m·s⁻¹ 등)
};

const min: FunctionDefinition = {
  key: 'min',
  labels: { ko: '최솟값', en: 'Min' },
  symbol: 'min',
  slots: [
    { label: { ko: 'a', en: 'a' }, constraint: { kind: 'number' } },
    { label: { ko: 'b', en: 'b' }, constraint: { kind: 'sameAsSlot', ref: 0 } },
  ],
  compute: ([a, b]) => Math.min(a ?? 0, b ?? 0),
  deriveOutputUnit: passthroughSlotUnit(0),
};

const max: FunctionDefinition = {
  key: 'max',
  labels: { ko: '최댓값', en: 'Max' },
  symbol: 'max',
  slots: [
    { label: { ko: 'a', en: 'a' }, constraint: { kind: 'number' } },
    { label: { ko: 'b', en: 'b' }, constraint: { kind: 'sameAsSlot', ref: 0 } },
  ],
  compute: ([a, b]) => Math.max(a ?? 0, b ?? 0),
  deriveOutputUnit: passthroughSlotUnit(0),
};

/**
 * 기본 함수 레지스트리. v1 시작 팔레트 — 산술 연산 + min/max.
 * 외부 도메인 패키지가 추가로 register하여 확장 가능.
 */
export function createDefaultFunctionRegistry(): FunctionRegistry {
  const reg = new FunctionRegistry();
  reg.register(multiply);
  reg.register(add);
  reg.register(subtract);
  reg.register(divide);
  reg.register(min);
  reg.register(max);
  return reg;
}
