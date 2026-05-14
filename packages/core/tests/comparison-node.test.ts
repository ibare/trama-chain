import { describe, expect, it } from 'vitest';
import {
  addComparisonNode,
  addConstantNode,
  addEdge,
  addValueNode,
  booleanValue,
  buildTopology,
  checkEdgeCompatibility,
  createDefaultCombinerRegistry,
  createEmptyModel,
  defaultNodeKindRegistry,
  getInputPortType,
  getOutputPortType,
  initializeFromInitialValues,
  isComparisonNode,
  numericValue,
  propagateOneStep,
} from '../src/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

describe('ComparisonNode', () => {
  it('addComparisonNode persists kind=comparison with default operator/threshold', () => {
    let m = createEmptyModel(0);
    m = addComparisonNode(m, { id: 'cmp', label: 'Hot?' }, 0);
    const n = m.nodes['cmp']!;
    expect(isComparisonNode(n)).toBe(true);
    if (isComparisonNode(n)) {
      expect(n.operator).toBe('>');
      expect(n.threshold).toBe(0);
    }
  });

  it('exposes numeric input + boolean output via descriptor', () => {
    let m = createEmptyModel(0);
    m = addComparisonNode(m, { id: 'cmp', label: 'Hot?', operator: '>', threshold: 30 }, 0);
    expect(getInputPortType(m.nodes['cmp']!)).toBe('numeric');
    expect(getOutputPortType(m.nodes['cmp']!)).toBe('boolean');
  });

  it('produces boolean true when comparison passes', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'temp', label: 'Temp', unitId: 'free', initialValue: numericValue(45, 'free') },
      0,
    );
    m = addComparisonNode(m, { id: 'cmp', label: 'Hot?', operator: '>', threshold: 30 }, 0);
    m = addEdge(m, { from: 'temp', to: 'cmp', shape: { kind: 'none', params: {} } }, 0);

    const state0 = initializeFromInitialValues(m);
    const next = propagateOneStep(state0, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      nodeKindRegistry: defaultNodeKindRegistry,
      topology: buildTopology(m),
    });
    expect(next.values['cmp']).toEqual(booleanValue(true));
  });

  it('produces boolean false when comparison fails', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'temp', label: 'Temp', unitId: 'free', initialValue: numericValue(10, 'free') },
      0,
    );
    m = addComparisonNode(m, { id: 'cmp', label: 'Hot?', operator: '>', threshold: 30 }, 0);
    m = addEdge(m, { from: 'temp', to: 'cmp', shape: { kind: 'none', params: {} } }, 0);

    const state0 = initializeFromInitialValues(m);
    const next = propagateOneStep(state0, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      nodeKindRegistry: defaultNodeKindRegistry,
      topology: buildTopology(m),
    });
    expect(next.values['cmp']).toEqual(booleanValue(false));
  });

  it('output is invalid when no incoming source is valid', () => {
    let m = createEmptyModel(0);
    m = addComparisonNode(m, { id: 'cmp', label: 'Hot?', operator: '>', threshold: 0 }, 0);
    const state0 = initializeFromInitialValues(m);
    const next = propagateOneStep(state0, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      nodeKindRegistry: defaultNodeKindRegistry,
      topology: buildTopology(m),
    });
    expect(next.values['cmp']).toBeUndefined();
    expect(next.validOutputs.has('cmp#0')).toBe(false);
  });

  it('output can drive a boolean ValueNode through addEdge', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'temp', label: 'Temp', unitId: 'free', initialValue: numericValue(45, 'free') },
      0,
    );
    m = addComparisonNode(m, { id: 'cmp', label: 'Hot?', operator: '>', threshold: 30 }, 0);
    m = addValueNode(
      m,
      {
        id: 'alarm',
        label: 'Alarm',
        unitId: 'free',
        initialValue: booleanValue(false),
        combiner: 'or',
      },
      0,
    );
    m = addEdge(m, { from: 'temp', to: 'cmp', shape: { kind: 'none', params: {} } }, 0);
    m = addEdge(m, { from: 'cmp', to: 'alarm', shape: { kind: 'none', params: {} } }, 0);

    const state0 = initializeFromInitialValues(m);
    const next = propagateOneStep(state0, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      nodeKindRegistry: defaultNodeKindRegistry,
      topology: buildTopology(m),
    });
    expect(next.values['alarm']).toEqual(booleanValue(true));
  });

  it('PortType compatibility: numeric→cmp ok, boolean→cmp rejected, cmp→boolean ValueNode ok', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'numSrc', label: 'N', unitId: 'free', initialValue: numericValue(0, 'free') },
      0,
    );
    m = addValueNode(
      m,
      { id: 'boolSrc', label: 'B', unitId: 'free', initialValue: booleanValue(false) },
      0,
    );
    m = addComparisonNode(m, { id: 'cmp', label: 'C', operator: '>', threshold: 0 }, 0);
    m = addValueNode(
      m,
      { id: 'sink', label: 'S', unitId: 'free', initialValue: booleanValue(false), combiner: 'or' },
      0,
    );

    expect(
      checkEdgeCompatibility(m.nodes['numSrc']!, m.nodes['cmp']!).compatible,
    ).toBe(true);
    expect(
      checkEdgeCompatibility(m.nodes['boolSrc']!, m.nodes['cmp']!).compatible,
    ).toBe(false);
    expect(
      checkEdgeCompatibility(m.nodes['cmp']!, m.nodes['sink']!).compatible,
    ).toBe(true);
  });

  it('supports all six comparison operators', () => {
    const ops: Array<[string, number, number, boolean]> = [
      ['>', 5, 3, true],
      ['<', 1, 3, true],
      ['>=', 3, 3, true],
      ['<=', 3, 3, true],
      ['==', 3, 3, true],
      ['!=', 4, 3, true],
    ];
    for (const [op, val, thr, expected] of ops) {
      let m = createEmptyModel(0);
      m = addConstantNode(m, { id: 'src', label: 'C', value: numericValue(val, 'free') }, 0);
      m = addComparisonNode(
        m,
        { id: 'cmp', label: op, operator: op as '>' | '<' | '>=' | '<=' | '==' | '!=', threshold: thr },
        0,
      );
      m = addEdge(m, { from: 'src', to: 'cmp', shape: { kind: 'none', params: {} } }, 0);

      const state0 = initializeFromInitialValues(m);
      const next = propagateOneStep(state0, m, {
        shapeRegistry: shapes,
        combinerRegistry: combiners,
        nodeKindRegistry: defaultNodeKindRegistry,
        topology: buildTopology(m),
      });
      expect(next.values['cmp']).toEqual(booleanValue(expected));
    }
  });
});
