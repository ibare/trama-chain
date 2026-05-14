import { describe, expect, it } from 'vitest';
import {
  addConditionNode,
  addConstantNode,
  addExpressionNode,
  addValueNode,
  booleanValue,
  checkEdgeCompatibility,
  createEmptyModel,
  getInputPortType,
  getOutputPortType,
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
