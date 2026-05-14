import { describe, expect, it } from 'vitest';
import {
  addValueNode,
  applyFeedbackEdges,
  booleanValue,
  buildTopology,
  createDefaultCombinerRegistry,
  createEmptyModel,
  defaultNodeKindRegistry,
  getInputPortType,
  getOutputPortType,
  initializeFromInitialValues,
  isValueNode,
  propagateOneStep,
} from '../src/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

describe('Boolean ValueNode', () => {
  it('addValueNode accepts boolean initialValue and persists kind', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'flag', label: 'Flag', unitId: 'free', initialValue: booleanValue(true) },
      0,
    );
    const n = m.nodes['flag']!;
    expect(isValueNode(n)).toBe(true);
    expect(n.kind).toBe('value');
    if (isValueNode(n)) {
      expect(n.initialValue.kind).toBe('boolean');
      if (n.initialValue.kind === 'boolean') expect(n.initialValue.b).toBe(true);
    }
  });

  it('exposes boolean PortType through descriptor', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'flag', label: 'Flag', unitId: 'free', initialValue: booleanValue(false) },
      0,
    );
    expect(getInputPortType(m.nodes['flag']!)).toBe('boolean');
    expect(getOutputPortType(m.nodes['flag']!)).toBe('boolean');
  });

  it('boolean ValueNode without incoming preserves initial value through propagate', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'flag', label: 'Flag', unitId: 'free', initialValue: booleanValue(true) },
      0,
    );
    const state0 = initializeFromInitialValues(m);
    const next = propagateOneStep(state0, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      nodeKindRegistry: defaultNodeKindRegistry,
      topology: buildTopology(m),
    });
    const v = next.values['flag'];
    expect(v).toBeDefined();
    expect(v!.kind).toBe('boolean');
    if (v && v.kind === 'boolean') expect(v.b).toBe(true);
  });

  it('feedback edges with no boolean source contributions leave target untouched', () => {
    // boolean combiner는 6단계 등록 — 5단계엔 boolean target에 lag=1 입력이 모이면
    // MissingCombinerError가 발생한다(보호 동작).
    // 입력 자체가 없으면 feedback 적용이 일어나지 않아 initialValue 유지.
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'flag', label: 'Flag', unitId: 'free', initialValue: booleanValue(false) },
      0,
    );
    const state0 = initializeFromInitialValues(m);
    const after = applyFeedbackEdges(state0, m, { combinerRegistry: combiners });
    expect(after.values['flag']).toEqual(booleanValue(false));
  });
});
