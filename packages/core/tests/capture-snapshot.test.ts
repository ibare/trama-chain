import { describe, expect, it } from 'vitest';
import {
  addConditionNode,
  addEdge,
  addGeneratorNode,
  addObserveNode,
  addStockNode,
  addValueNode,
  booleanValue,
  captureSnapshot,
  createDefaultCombinerRegistry,
  createEmptyModel,
  functionHandle,
  initializeFromInitialValues,
  isFunctionHandle,
  isSequence,
  NodeSnapshotSchema,
  numericValue,
  propagateOneStep,
  pushSample,
  wrap,
} from '../src/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();
const STEP_MS = 1000 / 6;

function step(
  state: ReturnType<typeof initializeFromInitialValues>,
  model: Parameters<typeof propagateOneStep>[1],
) {
  return propagateOneStep(state, model, {
    shapeRegistry: shapes,
    combinerRegistry: combiners,
    stepIntervalMs: STEP_MS,
  });
}

describe('captureSnapshot', () => {
  it('linear chain → schema-valid snapshot, round-trip through JSON', () => {
    let m = createEmptyModel(0);
    m = addValueNode(m, { id: 'a', label: 'A', unitId: 'count', initialNumber: 7 }, 0);
    m = addValueNode(m, { id: 'b', label: 'B', unitId: 'count', initialNumber: 0 }, 0);
    m = addEdge(
      m,
      { from: 'a', to: 'b', shape: { kind: 'linear', params: { slope: 1, offset: 0 } } },
      0,
    );

    let s = initializeFromInitialValues(m);
    s = step(s, m);

    const snap = captureSnapshot(s);
    expect(NodeSnapshotSchema.safeParse(snap).success).toBe(true);

    const roundTrip = JSON.parse(JSON.stringify(snap));
    expect(NodeSnapshotSchema.safeParse(roundTrip).success).toBe(true);

    expect(snap.simulationTimeMs).toBe(s.simulationTimeMs);
    const a = snap.values['a']!;
    const b = snap.values['b']!;
    expect(a.kind).toBe('numeric');
    expect(b.kind).toBe('numeric');
    if (a.kind === 'numeric') expect(a.n).toBeCloseTo(7, 6);
    if (b.kind === 'numeric') expect(b.n).toBeCloseTo(7, 6);
    expect(snap.validSlots).toContain('a:0');
    expect(snap.validSlots).toContain('b:0');
  });

  it('FunctionHandle 단독 → peek(t) Value 로 환원', () => {
    const ev = functionHandle((t) => numericValue(Math.sin(t / 1000), 'free'));
    const fakeState = baseState({ values: { gen: ev }, simulationTimeMs: 500 });
    const snap = captureSnapshot(fakeState);
    const captured = snap.values['gen']!;
    expect(captured.kind).toBe('numeric');
    if (captured.kind === 'numeric') {
      expect(captured.n).toBeCloseTo(Math.sin(0.5), 6);
    }
    expect(NodeSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it('Wrapped(value=FunctionHandle) → wrapped+plain Value 로 환원, meta 보존', () => {
    const inner = functionHandle((t) =>
      numericValue(t / 100, 'free'),
    );
    const wrapped = wrap(inner, booleanValue(true));
    const fakeState = baseState({
      values: { passthrough: wrapped },
      simulationTimeMs: 250,
    });
    const snap = captureSnapshot(fakeState);
    const captured = snap.values['passthrough']!;
    expect(captured.kind).toBe('wrapped');
    if (captured.kind === 'wrapped') {
      expect(captured.value).toEqual({ kind: 'numeric', n: 2.5, unitId: 'free' });
      expect(captured.meta).toEqual({ kind: 'boolean', b: true });
    }
    expect(NodeSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it('Wrapped(value=Value) → 그대로 wrapped scalar 박제', () => {
    const wrapped = wrap(numericValue(3, 'free'), booleanValue(false));
    const fakeState = baseState({ values: { cond: wrapped } });
    const snap = captureSnapshot(fakeState);
    expect(snap.values['cond']).toEqual({
      kind: 'wrapped',
      value: { kind: 'numeric', n: 3, unitId: 'free' },
      meta: { kind: 'boolean', b: false },
    });
  });

  it('ObserveBuffer → observeSeries sample 배열', () => {
    let m = createEmptyModel(0);
    m = addValueNode(m, { id: 'src', label: 'S', unitId: 'free', initialNumber: 5 }, 0);
    m = addObserveNode(m, { id: 'obs', label: 'O' }, 0);
    m = addEdge(m, { from: 'src', to: 'obs', shape: { kind: 'none', params: {} } }, 0);

    let s = initializeFromInitialValues(m);
    s = step(s, m);
    s = step(s, m);

    const snap = captureSnapshot(s);
    expect(snap.observeSeries['obs']).toBeDefined();
    expect(snap.observeSeries['obs']!.length).toBeGreaterThan(0);
    for (const sample of snap.observeSeries['obs']!) {
      expect(sample.value.kind).toBe('numeric');
    }
    expect(NodeSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it('StockRuntime → stockWindows 의 (t, delta) 배열', () => {
    let m = createEmptyModel(0);
    m = addStockNode(m, { id: 'stk', label: 'S', unitId: 'count' }, 0);

    const s = initializeFromInitialValues(m);
    s.stockRuntime['stk'] = {
      window: [
        { ts: 100, delta: 1 },
        { ts: 200, delta: -0.5 },
      ],
    };
    const snap = captureSnapshot(s);
    expect(snap.stockWindows['stk']).toEqual({
      window: [
        { t: 100, delta: 1 },
        { t: 200, delta: -0.5 },
      ],
    });
    expect(NodeSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it('maxSamplesPerSeries → 균등 stride 다운샘플, 앞·뒤 보존', () => {
    const samples = Array.from({ length: 20 }, (_, i) => ({
      value: numericValue(i, 'free'),
      t: i * 10,
    }));
    const sequenceEv = { kind: 'sequence' as const, samples };
    const fakeState = baseState({ values: { agg: sequenceEv } });
    const snap = captureSnapshot(fakeState, { maxSamplesPerSeries: 5 });
    const captured = snap.values['agg']!;
    expect(captured.kind).toBe('sequence');
    if (captured.kind === 'sequence') {
      expect(captured.samples.length).toBe(5);
      expect(captured.samples[0]!.t).toBe(0);
      expect(captured.samples[captured.samples.length - 1]!.t).toBe(190);
      for (let i = 1; i < captured.samples.length; i++) {
        expect(captured.samples[i]!.t).toBeGreaterThan(captured.samples[i - 1]!.t);
      }
    }
  });

  it('maxSamplesPerSeries 미지정 → 원본 그대로', () => {
    const samples = Array.from({ length: 50 }, (_, i) => ({
      value: numericValue(i, 'free'),
      t: i * 5,
    }));
    const fakeState = baseState({
      values: { agg: { kind: 'sequence', samples } },
    });
    const snap = captureSnapshot(fakeState);
    const captured = snap.values['agg']!;
    if (captured.kind === 'sequence') {
      expect(captured.samples.length).toBe(50);
    }
  });

  it('Sine generator end-to-end → FunctionHandle 환원 후 schema 통과', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      {
        id: 'sin',
        label: 'sin',
        params: { kind: 'sine', amplitude: 1, omega: Math.PI },
      },
      0,
    );

    let s = initializeFromInitialValues(m);
    s = step(s, m);

    const stored = s.values['sin'];
    expect(stored).toBeDefined();
    expect(stored && isFunctionHandle(stored)).toBe(true);

    const snap = captureSnapshot(s);
    expect(NodeSnapshotSchema.safeParse(snap).success).toBe(true);
    expect(snap.values['sin']!.kind).toBe('numeric');
  });
});

function baseState(
  patch: Partial<ReturnType<typeof initializeFromInitialValues>>,
): ReturnType<typeof initializeFromInitialValues> {
  return {
    values: {},
    sequenceOutputs: {},
    validOutputs: new Set(),
    pendingOutputs: new Set(),
    invalidReasons: {},
    observeBuffers: {},
    observeExtractionRuntime: {},
    generatorRuntime: {},
    stockRuntime: {},
    simulationTimeMs: 0,
    ...patch,
  };
}

// 사용하지 않는 import 정리용 — 시그니처 유지
void addConditionNode;
void isSequence;
void pushSample;
