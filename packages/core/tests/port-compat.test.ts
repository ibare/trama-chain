import { describe, expect, it } from 'vitest';
import {
  addConditionNode,
  addConstantNode,
  addExpressionNode,
  addGeneratorNode,
  addValueNode,
  booleanValue,
  checkEdgeCompatibility,
  createEmptyModel,
  getInputAccepts,
  getInputPortType,
  getOutputPortType,
  getOutputSlotAt,
  getOutputSlots,
  numericValue,
} from '../src/index.js';

function setup(now = 0) {
  let m = createEmptyModel(now);
  m = addValueNode(m, { id: 'num', label: 'Num', unitId: 'free', initialNumber: 0.5 }, now);
  m = addValueNode(
    m,
    { id: 'bool', label: 'Bool', unitId: 'free', initialValue: booleanValue(true) },
    now,
  );
  m = addConstantNode(m, { id: 'k', label: 'k', value: numericValue(3.14, 'free') }, now);
  m = addConditionNode(m, { id: 'cond', label: 'cond' }, now);
  m = addExpressionNode(m, { id: 'expr', label: 'e', latex: 'x', variables: ['x'] }, now);
  m = addGeneratorNode(m, { id: 'gen', label: 'g' }, now);
  return m;
}

describe('PortType + edge compatibility', () => {
  it('descriptor PortType getters reflect node kind', () => {
    const m = setup();
    expect(getOutputPortType(m.nodes['num']!)).toBe('numeric');
    expect(getOutputPortType(m.nodes['bool']!)).toBe('boolean');
    expect(getOutputPortType(m.nodes['k']!)).toBe('numeric');
    expect(getInputPortType(m.nodes['k']!)).toBeNull(); // 상수는 입력 없음
    expect(getInputPortType(m.nodes['num']!)).toBe('numeric');
    expect(getInputPortType(m.nodes['bool']!)).toBe('boolean');
    expect(getInputPortType(m.nodes['cond']!)).toBe('numeric');
    expect(getInputPortType(m.nodes['expr']!)).toBe('numeric');
  });

  it('rejects target nodes that take no input', () => {
    const m = setup();
    const r = checkEdgeCompatibility(m.nodes['num']!, m.nodes['k']!);
    expect(r.compatible).toBe(false);
    if (!r.compatible) expect(r.reason).toMatch(/does not accept inputs/);
  });

  it('rejects numeric → boolean and boolean → numeric', () => {
    const m = setup();
    const a = checkEdgeCompatibility(m.nodes['num']!, m.nodes['bool']!);
    expect(a.compatible).toBe(false);
    if (!a.compatible) expect(a.reason).toMatch(/port type mismatch/);
    const b = checkEdgeCompatibility(m.nodes['bool']!, m.nodes['num']!);
    expect(b.compatible).toBe(false);
  });

  it('accepts numeric → numeric and boolean → boolean', () => {
    const m = setup();
    expect(checkEdgeCompatibility(m.nodes['num']!, m.nodes['num']!).compatible).toBe(true);
    expect(checkEdgeCompatibility(m.nodes['k']!, m.nodes['cond']!).compatible).toBe(true);
    expect(checkEdgeCompatibility(m.nodes['num']!, m.nodes['expr']!).compatible).toBe(true);
    // boolean → boolean: 5단계 BooleanValueNode propagate가 들어와야 의미가 살지만
    // 호환성 자체는 PortType만으로 결정된다.
    expect(checkEdgeCompatibility(m.nodes['bool']!, m.nodes['bool']!).compatible).toBe(true);
  });
});

describe('ConditionNode 두 슬롯 명세', () => {
  it('slot 0 = true 슬롯, slot 1 = false 슬롯 — 둘 다 numeric+meta:boolean', () => {
    const m = setup();
    const cond = m.nodes['cond']!;
    const slots = getOutputSlots(cond);
    expect(slots).toHaveLength(2);
    expect(getOutputSlotAt(cond, 0)).toEqual({
      index: 0,
      value: 'numeric',
      meta: 'boolean',
      label: 'true',
      branching: true,
    });
    expect(getOutputSlotAt(cond, 1)).toEqual({
      index: 1,
      value: 'numeric',
      meta: 'boolean',
      label: 'false',
      branching: true,
    });
  });

  it('두 슬롯 모두 ValueNode(numeric) 입력으로 호환 — sourceSlotIndex 0/1 별 검사', () => {
    const m = setup();
    const cond = m.nodes['cond']!;
    const num = m.nodes['num']!;
    // 두 슬롯 모두 numeric 알맹이라 ValueNode 입력으로 호환 (target.meta 미지정).
    const fromTrue = checkEdgeCompatibility(cond, num, undefined, undefined, 0);
    const fromFalse = checkEdgeCompatibility(cond, num, undefined, undefined, 1);
    expect(fromTrue.compatible).toBe(true);
    expect(fromFalse.compatible).toBe(true);
  });

  it('존재하지 않는 슬롯 인덱스는 reason 에 슬롯 번호 명시', () => {
    const m = setup();
    const cond = m.nodes['cond']!;
    const num = m.nodes['num']!;
    const r = checkEdgeCompatibility(cond, num, undefined, undefined, 2);
    expect(r.compatible).toBe(false);
    if (!r.compatible) expect(r.reason).toMatch(/no output slot 2/);
  });
});

describe('GeneratorNode 메타 인식 입력', () => {
  it('inputAccepts: plain boolean OR numeric+meta:boolean 두 spec', () => {
    const m = setup();
    const gen = m.nodes['gen']!;
    const accepts = getInputAccepts(gen);
    expect(accepts).toEqual([
      { value: 'boolean' },
      { value: 'numeric', meta: 'boolean' },
    ]);
  });

  it('plain boolean source 수용 (boolean ValueNode → Generator)', () => {
    const m = setup();
    const r = checkEdgeCompatibility(m.nodes['bool']!, m.nodes['gen']!);
    expect(r.compatible).toBe(true);
  });

  it('plain numeric source 거절 (numeric ValueNode → Generator)', () => {
    const m = setup();
    const r = checkEdgeCompatibility(m.nodes['num']!, m.nodes['gen']!);
    expect(r.compatible).toBe(false);
    if (!r.compatible) expect(r.reason).toMatch(/port type mismatch/);
  });

  it('Condition slot 0(true) 수용 — numeric+meta:boolean 가 두 번째 spec 과 매칭', () => {
    const m = setup();
    const r = checkEdgeCompatibility(
      m.nodes['cond']!,
      m.nodes['gen']!,
      undefined,
      undefined,
      0,
    );
    expect(r.compatible).toBe(true);
  });

  it('Condition slot 1(false) 도 동일하게 수용', () => {
    const m = setup();
    const r = checkEdgeCompatibility(
      m.nodes['cond']!,
      m.nodes['gen']!,
      undefined,
      undefined,
      1,
    );
    expect(r.compatible).toBe(true);
  });
});
