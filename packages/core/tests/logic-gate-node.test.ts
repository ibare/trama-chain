import { describe, expect, it } from 'vitest';
import {
  addConstantNode,
  addEdge,
  addLogicGateNode,
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
  isLogicGateNode,
  numericValue,
  propagateOneStep,
} from '../src/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

describe('LogicGateNode', () => {
  it('addLogicGateNode persists kind=logic-gate with default operator', () => {
    let m = createEmptyModel(0);
    m = addLogicGateNode(m, { id: 'g', label: 'AND' }, 0);
    const n = m.nodes['g']!;
    expect(isLogicGateNode(n)).toBe(true);
    if (isLogicGateNode(n)) {
      expect(n.operator).toBe('and');
    }
  });

  it('exposes boolean input + boolean output via descriptor', () => {
    let m = createEmptyModel(0);
    m = addLogicGateNode(m, { id: 'g', label: 'AND', operator: 'and' }, 0);
    expect(getInputPortType(m.nodes['g']!)).toBe('boolean');
    expect(getOutputPortType(m.nodes['g']!)).toBe('boolean');
  });

  it('AND combines two boolean sources', () => {
    const cases: Array<[boolean, boolean, boolean]> = [
      [true, true, true],
      [true, false, false],
      [false, true, false],
      [false, false, false],
    ];
    for (const [a, b, expected] of cases) {
      let m = createEmptyModel(0);
      m = addConstantNode(m, { id: 'a', label: 'A', value: booleanValue(a) }, 0);
      m = addConstantNode(m, { id: 'b', label: 'B', value: booleanValue(b) }, 0);
      m = addLogicGateNode(m, { id: 'g', label: 'AND', operator: 'and' }, 0);
      m = addEdge(m, { from: 'a', to: 'g', shape: { kind: 'none', params: {} } }, 0);
      m = addEdge(m, { from: 'b', to: 'g', shape: { kind: 'none', params: {} } }, 0);

      const state0 = initializeFromInitialValues(m);
      const next = propagateOneStep(state0, m, {
        shapeRegistry: shapes,
        combinerRegistry: combiners,
        nodeKindRegistry: defaultNodeKindRegistry,
        topology: buildTopology(m),
      });
      expect(next.values['g']).toEqual(booleanValue(expected));
    }
  });

  it('OR combines two boolean sources', () => {
    const cases: Array<[boolean, boolean, boolean]> = [
      [true, true, true],
      [true, false, true],
      [false, true, true],
      [false, false, false],
    ];
    for (const [a, b, expected] of cases) {
      let m = createEmptyModel(0);
      m = addConstantNode(m, { id: 'a', label: 'A', value: booleanValue(a) }, 0);
      m = addConstantNode(m, { id: 'b', label: 'B', value: booleanValue(b) }, 0);
      m = addLogicGateNode(m, { id: 'g', label: 'OR', operator: 'or' }, 0);
      m = addEdge(m, { from: 'a', to: 'g', shape: { kind: 'none', params: {} } }, 0);
      m = addEdge(m, { from: 'b', to: 'g', shape: { kind: 'none', params: {} } }, 0);

      const state0 = initializeFromInitialValues(m);
      const next = propagateOneStep(state0, m, {
        shapeRegistry: shapes,
        combinerRegistry: combiners,
        nodeKindRegistry: defaultNodeKindRegistry,
        topology: buildTopology(m),
      });
      expect(next.values['g']).toEqual(booleanValue(expected));
    }
  });

  it('XOR combines two boolean sources', () => {
    const cases: Array<[boolean, boolean, boolean]> = [
      [true, true, false],
      [true, false, true],
      [false, true, true],
      [false, false, false],
    ];
    for (const [a, b, expected] of cases) {
      let m = createEmptyModel(0);
      m = addConstantNode(m, { id: 'a', label: 'A', value: booleanValue(a) }, 0);
      m = addConstantNode(m, { id: 'b', label: 'B', value: booleanValue(b) }, 0);
      m = addLogicGateNode(m, { id: 'g', label: 'XOR', operator: 'xor' }, 0);
      m = addEdge(m, { from: 'a', to: 'g', shape: { kind: 'none', params: {} } }, 0);
      m = addEdge(m, { from: 'b', to: 'g', shape: { kind: 'none', params: {} } }, 0);

      const state0 = initializeFromInitialValues(m);
      const next = propagateOneStep(state0, m, {
        shapeRegistry: shapes,
        combinerRegistry: combiners,
        nodeKindRegistry: defaultNodeKindRegistry,
        topology: buildTopology(m),
      });
      expect(next.values['g']).toEqual(booleanValue(expected));
    }
  });

  it('output is invalid when no incoming source exists', () => {
    let m = createEmptyModel(0);
    m = addLogicGateNode(m, { id: 'g', label: 'AND', operator: 'and' }, 0);
    const state0 = initializeFromInitialValues(m);
    const next = propagateOneStep(state0, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      nodeKindRegistry: defaultNodeKindRegistry,
      topology: buildTopology(m),
    });
    expect(next.values['g']).toBeUndefined();
    expect(next.validOutputs.has('g:0')).toBe(false);
  });

  it('PortType compatibility: boolean→gate ok, numeric→gate rejected', () => {
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
    m = addLogicGateNode(m, { id: 'g', label: 'AND', operator: 'and' }, 0);

    expect(
      checkEdgeCompatibility(m.nodes['boolSrc']!, m.nodes['g']!).compatible,
    ).toBe(true);
    expect(
      checkEdgeCompatibility(m.nodes['numSrc']!, m.nodes['g']!).compatible,
    ).toBe(false);
  });

  it('NOT inverts a single boolean source', () => {
    const cases: Array<[boolean, boolean]> = [
      [true, false],
      [false, true],
    ];
    for (const [a, expected] of cases) {
      let m = createEmptyModel(0);
      m = addConstantNode(m, { id: 'a', label: 'A', value: booleanValue(a) }, 0);
      m = addLogicGateNode(m, { id: 'g', label: 'NOT', operator: 'not' }, 0);
      m = addEdge(m, { from: 'a', to: 'g', shape: { kind: 'none', params: {} } }, 0);

      const state0 = initializeFromInitialValues(m);
      const next = propagateOneStep(state0, m, {
        shapeRegistry: shapes,
        combinerRegistry: combiners,
        nodeKindRegistry: defaultNodeKindRegistry,
        topology: buildTopology(m),
      });
      expect(next.values['g']).toEqual(booleanValue(expected));
      expect(next.validOutputs.has('g:0')).toBe(true);
    }
  });

  it('NOT with no incoming source yields invalid output', () => {
    let m = createEmptyModel(0);
    m = addLogicGateNode(m, { id: 'g', label: 'NOT', operator: 'not' }, 0);
    const state0 = initializeFromInitialValues(m);
    const next = propagateOneStep(state0, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      nodeKindRegistry: defaultNodeKindRegistry,
      topology: buildTopology(m),
    });
    expect(next.values['g']).toBeUndefined();
    expect(next.validOutputs.has('g:0')).toBe(false);
  });

  it('NOT with two incoming sources is invalid (unary only)', () => {
    let m = createEmptyModel(0);
    m = addConstantNode(m, { id: 'a', label: 'A', value: booleanValue(true) }, 0);
    m = addConstantNode(m, { id: 'b', label: 'B', value: booleanValue(false) }, 0);
    m = addLogicGateNode(m, { id: 'g', label: 'NOT', operator: 'not' }, 0);
    m = addEdge(m, { from: 'a', to: 'g', shape: { kind: 'none', params: {} } }, 0);
    m = addEdge(m, { from: 'b', to: 'g', shape: { kind: 'none', params: {} } }, 0);

    const state0 = initializeFromInitialValues(m);
    const next = propagateOneStep(state0, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      nodeKindRegistry: defaultNodeKindRegistry,
      topology: buildTopology(m),
    });
    expect(next.validOutputs.has('g:0')).toBe(false);
  });

  it('NOT with inverted edge applies edge inversion before NOT', () => {
    let m = createEmptyModel(0);
    m = addConstantNode(m, { id: 'a', label: 'A', value: booleanValue(true) }, 0);
    m = addLogicGateNode(m, { id: 'g', label: 'NOT', operator: 'not' }, 0);
    m = addEdge(
      m,
      { from: 'a', to: 'g', shape: { kind: 'none', params: {} }, inverted: true },
      0,
    );

    const state0 = initializeFromInitialValues(m);
    const next = propagateOneStep(state0, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      nodeKindRegistry: defaultNodeKindRegistry,
      topology: buildTopology(m),
    });
    // a=true → inverted edge → false 기여 → NOT(false) = true
    expect(next.values['g']).toEqual(booleanValue(true));
  });

  it('inverted edge negates contribution', () => {
    let m = createEmptyModel(0);
    m = addConstantNode(m, { id: 'a', label: 'A', value: booleanValue(true) }, 0);
    m = addConstantNode(m, { id: 'b', label: 'B', value: booleanValue(true) }, 0);
    m = addLogicGateNode(m, { id: 'g', label: 'AND', operator: 'and' }, 0);
    m = addEdge(m, { from: 'a', to: 'g', shape: { kind: 'none', params: {} } }, 0);
    m = addEdge(
      m,
      { from: 'b', to: 'g', shape: { kind: 'none', params: {} }, inverted: true },
      0,
    );

    const state0 = initializeFromInitialValues(m);
    const next = propagateOneStep(state0, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      nodeKindRegistry: defaultNodeKindRegistry,
      topology: buildTopology(m),
    });
    // b가 invert되어 false로 기여 → AND(true, false) = false
    expect(next.values['g']).toEqual(booleanValue(false));
  });
});
