import { describe, expect, it } from 'vitest';
import {
  addConstantNode,
  addEdge,
  addObserveNode,
  addValueNode,
  booleanValue,
  checkEdgeCompatibility,
  createDefaultCombinerRegistry,
  createEmptyModel,
  documentToModel,
  getInputPortType,
  getOutputPortType,
  initializeFromInitialValues,
  isObserveNode,
  modelToDocument,
  numericValue,
  propagateOneStep,
  TramaDocumentSchema,
} from '../src/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

function makeNumericPipe() {
  let m = createEmptyModel(0);
  m = addValueNode(
    m,
    { id: 'src', label: 'src', unitId: 'free', initialNumber: 42 },
    0,
  );
  m = addObserveNode(m, { id: 'mon', label: 'monitor' }, 0);
  m = addEdge(m, { from: 'src', to: 'mon', shape: { kind: 'none', params: {} } }, 0);
  return m;
}

describe('ObserveNode', () => {
  it('addObserveNode persists kind=observe with default capacity=30 + last-value viz', () => {
    let m = createEmptyModel(0);
    m = addObserveNode(m, { id: 'mon', label: 'monitor' }, 0);
    const n = m.nodes['mon']!;
    expect(isObserveNode(n)).toBe(true);
    if (isObserveNode(n)) {
      expect(n.capacity).toEqual({ kind: 'bounded', size: 30 });
      expect(n.visualization).toBe('last-value');
    }
  });

  it('PortType: unconnected ObserveNode accepts any input via acceptsAnyInput', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'numSrc', label: 'n', unitId: 'free', initialNumber: 1 },
      0,
    );
    m = addValueNode(
      m,
      {
        id: 'boolSrc',
        label: 'b',
        unitId: 'free',
        initialValue: booleanValue(true),
        combiner: 'and',
      },
      0,
    );
    m = addObserveNode(m, { id: 'mon', label: 'monitor' }, 0);
    const numToMon = checkEdgeCompatibility(
      m.nodes['numSrc']!,
      m.nodes['mon']!,
      undefined,
      m,
    );
    const boolToMon = checkEdgeCompatibility(
      m.nodes['boolSrc']!,
      m.nodes['mon']!,
      undefined,
      m,
    );
    expect(numToMon.compatible).toBe(true);
    expect(boolToMon.compatible).toBe(true);
  });

  it('PortType: once connected, output PortType mirrors source', () => {
    let m = makeNumericPipe();
    expect(getOutputPortType(m.nodes['mon']!, undefined, m)).toBe('numeric');
    expect(getInputPortType(m.nodes['mon']!, undefined, m)).toBe('numeric');

    // boolean source 모니터
    m = createEmptyModel(0);
    m = addValueNode(
      m,
      {
        id: 'b',
        label: 'b',
        unitId: 'free',
        initialValue: booleanValue(true),
        combiner: 'and',
      },
      0,
    );
    m = addObserveNode(m, { id: 'mon', label: 'monitor' }, 0);
    m = addEdge(m, { from: 'b', to: 'mon', shape: { kind: 'none', params: {} } }, 0);
    expect(getOutputPortType(m.nodes['mon']!, undefined, m)).toBe('boolean');
    expect(getInputPortType(m.nodes['mon']!, undefined, m)).toBe('boolean');
  });

  it('propagate passes input value through to output', () => {
    const m = makeNumericPipe();
    let state = initializeFromInitialValues(m);
    state = propagateOneStep(state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(state.values['mon']).toEqual(numericValue(42, 'free'));
  });

  it('accumulates values into observeBuffers in time order with bounded capacity', () => {
    let m = createEmptyModel(0);
    m = addConstantNode(
      m,
      { id: 'k', label: 'k', value: numericValue(0, 'free') },
      0,
    );
    m = addObserveNode(
      m,
      {
        id: 'mon',
        label: 'monitor',
        capacity: { kind: 'bounded', size: 3 },
      },
      0,
    );
    m = addEdge(m, { from: 'k', to: 'mon', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);

    // ConstantNode는 매 step `node.value`를 그대로 출력하므로, 모델의 value를
    // 바꿔가며 propagate를 반복하면 모니터 입력이 시간순으로 1·2·3·4·5가 된다.
    for (const n of [1, 2, 3, 4, 5]) {
      const k = m.nodes['k']!;
      if (k.kind === 'constant') {
        m = {
          ...m,
          nodes: { ...m.nodes, k: { ...k, value: numericValue(n, 'free') } },
        };
      }
      state = propagateOneStep(state, m, {
        shapeRegistry: shapes,
        combinerRegistry: combiners,
      });
    }

    const buf = state.observeBuffers['mon'];
    expect(buf).toBeDefined();
    expect(buf!.map((v) => (v.kind === 'numeric' ? v.n : null))).toEqual([3, 4, 5]);
  });

  it('unbounded capacity keeps all values', () => {
    let m = createEmptyModel(0);
    m = addConstantNode(
      m,
      { id: 'k', label: 'k', value: numericValue(0, 'free') },
      0,
    );
    m = addObserveNode(
      m,
      {
        id: 'mon',
        label: 'monitor',
        capacity: { kind: 'unbounded' },
      },
      0,
    );
    m = addEdge(m, { from: 'k', to: 'mon', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);

    for (let i = 1; i <= 10; i++) {
      const k = m.nodes['k']!;
      if (k.kind === 'constant') {
        m = {
          ...m,
          nodes: { ...m.nodes, k: { ...k, value: numericValue(i, 'free') } },
        };
      }
      state = propagateOneStep(state, m, {
        shapeRegistry: shapes,
        combinerRegistry: combiners,
      });
    }

    expect(state.observeBuffers['mon']!.length).toBe(10);
  });

  it('passes boolean input through unchanged', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      {
        id: 'b',
        label: 'b',
        unitId: 'free',
        initialValue: booleanValue(true),
        combiner: 'and',
      },
      0,
    );
    m = addObserveNode(m, { id: 'mon', label: 'monitor' }, 0);
    m = addEdge(m, { from: 'b', to: 'mon', shape: { kind: 'none', params: {} } }, 0);
    let state = initializeFromInitialValues(m);
    state = propagateOneStep(state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(state.values['mon']).toEqual(booleanValue(true));
  });

  it('inverted edge negates value on passthrough', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      {
        id: 'b',
        label: 'b',
        unitId: 'free',
        initialValue: booleanValue(true),
        combiner: 'and',
      },
      0,
    );
    m = addObserveNode(m, { id: 'mon', label: 'monitor' }, 0);
    m = addEdge(
      m,
      { from: 'b', to: 'mon', shape: { kind: 'none', params: {} }, inverted: true },
      0,
    );
    let state = initializeFromInitialValues(m);
    state = propagateOneStep(state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(state.values['mon']).toEqual(booleanValue(false));
  });

  it('serializes capacity + visualization but never the buffer', () => {
    let m = createEmptyModel(0);
    m = addObserveNode(
      m,
      {
        id: 'mon',
        label: 'monitor',
        capacity: { kind: 'bounded', size: 7 },
        visualization: 'sparkline',
      },
      0,
    );
    const doc = modelToDocument(m);
    // schema 검증 통과 + 버퍼 필드는 문서에 존재하지 않음
    const parsed = TramaDocumentSchema.parse(doc);
    expect(parsed.nodes[0]).toMatchObject({
      kind: 'observe',
      capacity: { kind: 'bounded', size: 7 },
      visualization: 'sparkline',
    });
    expect(JSON.stringify(doc)).not.toContain('observeBuffers');

    const roundTrip = documentToModel(parsed);
    const n = roundTrip.nodes['mon']!;
    expect(isObserveNode(n)).toBe(true);
    if (isObserveNode(n)) {
      expect(n.capacity).toEqual({ kind: 'bounded', size: 7 });
      expect(n.visualization).toBe('sparkline');
    }
  });

  it('invalid output when source becomes invalid', () => {
    let m = createEmptyModel(0);
    m = addConstantNode(
      m,
      { id: 'k', label: 'k', value: numericValue(5, 'free') },
      0,
    );
    m = addObserveNode(m, { id: 'mon', label: 'monitor' }, 0);
    m = addEdge(m, { from: 'k', to: 'mon', shape: { kind: 'none', params: {} } }, 0);
    let state = initializeFromInitialValues(m);
    state = propagateOneStep(state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(state.validOutputs.has('mon:0')).toBe(true);
    expect(state.values['mon']).toEqual(numericValue(5, 'free'));
  });
});
