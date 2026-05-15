import { describe, expect, it } from 'vitest';
import {
  addEdge,
  addGeneratorNode,
  addValueNode,
  counterParadigm,
  createDefaultCombinerRegistry,
  createDefaultGeneratorRegistry,
  createEmptyModel,
  documentToModel,
  initializeFromInitialValues,
  isGeneratorNode,
  modelToDocument,
  numericValue,
  propagateOneStep,
  randomParadigm,
  TramaDocumentSchema,
} from '../src/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

function step(state: ReturnType<typeof initializeFromInitialValues>, model: Parameters<typeof propagateOneStep>[1]) {
  return propagateOneStep(state, model, {
    shapeRegistry: shapes,
    combinerRegistry: combiners,
  });
}

describe('GeneratorNode — counter paradigm', () => {
  it('addGeneratorNode persists kind=generator with default counter(1, 1)', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(m, { id: 'g', label: 'gen' }, 0);
    const n = m.nodes['g']!;
    expect(isGeneratorNode(n)).toBe(true);
    if (isGeneratorNode(n)) {
      expect(n.params).toEqual({ kind: 'counter', start: 1, step: 1 });
    }
  });

  it('cursor initializes to start, emit sequence is 1,2,3...', () => {
    const params = { kind: 'counter' as const, start: 1, step: 1 };
    let cursor = counterParadigm.initCursor(params);
    expect(cursor.nextValue).toBe(1);
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = counterParadigm.emit(params, cursor);
      if (r.value.kind === 'numeric') out.push(r.value.n);
      cursor = r.nextCursor;
    }
    expect(out).toEqual([1, 2, 3, 4]);
  });

  it('counter with step=2.5 produces fractional sequence', () => {
    const params = { kind: 'counter' as const, start: 0, step: 2.5 };
    let cursor = counterParadigm.initCursor(params);
    const out: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = counterParadigm.emit(params, cursor);
      if (r.value.kind === 'numeric') out.push(r.value.n);
      cursor = r.nextCursor;
    }
    expect(out).toEqual([0, 2.5, 5]);
  });
});

describe('GeneratorNode — random paradigm', () => {
  it('same seed produces same sequence (deterministic)', () => {
    const params = { kind: 'random' as const, min: 0, max: 100, integer: false, seed: 42 };
    const a: number[] = [];
    const b: number[] = [];
    let ca = randomParadigm.initCursor(params);
    let cb = randomParadigm.initCursor(params);
    for (let i = 0; i < 5; i++) {
      const ra = randomParadigm.emit(params, ca);
      const rb = randomParadigm.emit(params, cb);
      if (ra.value.kind === 'numeric') a.push(ra.value.n);
      if (rb.value.kind === 'numeric') b.push(rb.value.n);
      ca = ra.nextCursor;
      cb = rb.nextCursor;
    }
    expect(a).toEqual(b);
  });

  it('values stay within [min, max]', () => {
    const params = { kind: 'random' as const, min: 10, max: 20, integer: false, seed: 7 };
    let cursor = randomParadigm.initCursor(params);
    for (let i = 0; i < 100; i++) {
      const r = randomParadigm.emit(params, cursor);
      if (r.value.kind === 'numeric') {
        expect(r.value.n).toBeGreaterThanOrEqual(10);
        expect(r.value.n).toBeLessThanOrEqual(20);
      }
      cursor = r.nextCursor;
    }
  });

  it('integer mode produces only integers', () => {
    const params = { kind: 'random' as const, min: 1, max: 6, integer: true, seed: 99 };
    let cursor = randomParadigm.initCursor(params);
    for (let i = 0; i < 50; i++) {
      const r = randomParadigm.emit(params, cursor);
      if (r.value.kind === 'numeric') {
        expect(Number.isInteger(r.value.n)).toBe(true);
        expect(r.value.n).toBeGreaterThanOrEqual(1);
        expect(r.value.n).toBeLessThanOrEqual(6);
      }
      cursor = r.nextCursor;
    }
  });
});

describe('GeneratorNode — propagate integration', () => {
  it('enabled=false (idle): exposes peek value so downstream wiring stays attached', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      { id: 'g', label: 'gen', params: { kind: 'counter', start: 10, step: 1 } },
      0,
    );
    let state = initializeFromInitialValues(m);
    expect(state.values['g']).toEqual(numericValue(10, 'free'));
    expect(state.validOutputs.has('g:0')).toBe(true);
    expect(state.generatorRuntime['g']?.enabled).toBe(false);
    // cursor는 아직 진행되지 않았다 — 다음 emit이 그대로 10을 낸다.
    expect(state.generatorRuntime['g']?.cursor).toEqual({ kind: 'counter', nextValue: 10 });
    // step을 돌려도 idle 상태면 cursor·값 그대로.
    state = step(state, m);
    expect(state.values['g']).toEqual(numericValue(10, 'free'));
    expect(state.validOutputs.has('g:0')).toBe(true);
    expect(state.generatorRuntime['g']?.cursor).toEqual({ kind: 'counter', nextValue: 10 });
  });

  it('enabled=true: emits per step, cursor advances', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      { id: 'g', label: 'gen', params: { kind: 'counter', start: 1, step: 1 } },
      0,
    );
    let state = initializeFromInitialValues(m);
    state = {
      ...state,
      generatorRuntime: { ...state.generatorRuntime, g: { ...state.generatorRuntime['g']!, enabled: true } },
    };
    const out: number[] = [];
    for (let i = 0; i < 3; i++) {
      state = step(state, m);
      const v = state.values['g'];
      if (v && v.kind === 'numeric') out.push(v.n);
    }
    expect(out).toEqual([1, 2, 3]);
  });

  it('paused after running: last value retained', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      { id: 'g', label: 'gen', params: { kind: 'counter', start: 1, step: 1 } },
      0,
    );
    let state = initializeFromInitialValues(m);
    state = {
      ...state,
      generatorRuntime: { ...state.generatorRuntime, g: { ...state.generatorRuntime['g']!, enabled: true } },
    };
    state = step(state, m);
    state = step(state, m);
    expect(state.values['g']).toEqual(numericValue(2, 'free'));

    // 정지 — 값 유지.
    state = {
      ...state,
      generatorRuntime: {
        ...state.generatorRuntime,
        g: { ...state.generatorRuntime['g']!, enabled: false },
      },
    };
    state = step(state, m);
    expect(state.values['g']).toEqual(numericValue(2, 'free'));
    expect(state.validOutputs.has('g:0')).toBe(true);

    // 재시작 — cursor 이어짐, 다음 값 = 3.
    state = {
      ...state,
      generatorRuntime: {
        ...state.generatorRuntime,
        g: { ...state.generatorRuntime['g']!, enabled: true },
      },
    };
    state = step(state, m);
    expect(state.values['g']).toEqual(numericValue(3, 'free'));
  });

  it('downstream ValueNode receives idle peek value (no emit yet)', () => {
    // ▶ 누르기 전에도 generator output이 valid라 케이블이 자연스레 붙고 값이 전파된다.
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      { id: 'g', label: 'gen', params: { kind: 'counter', start: 7, step: 3 } },
      0,
    );
    m = addValueNode(m, { id: 'v', label: 'v', unitId: 'free', initialNumber: 0 }, 0);
    m = addEdge(m, { from: 'g', to: 'v', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);
    // idle 상태에서 peek가 다운스트림으로 자연 전파.
    state = step(state, m);
    expect(state.values['v']).toEqual(numericValue(7, 'free'));
    // cursor는 advance하지 않음 — 다시 step 돌려도 동일.
    state = step(state, m);
    expect(state.values['v']).toEqual(numericValue(7, 'free'));
  });

  it('peek and emit agree on the next value (cursor advances only on emit)', () => {
    const params = { kind: 'counter' as const, start: 42, step: 7 };
    const cursor = counterParadigm.initCursor(params);
    const peeked = counterParadigm.peek(params, cursor);
    const emitted = counterParadigm.emit(params, cursor);
    expect(peeked).toEqual(emitted.value);
    // peek는 cursor를 진행하지 않음.
    expect(counterParadigm.peek(params, cursor)).toEqual(peeked);
    // emit은 진행.
    expect(emitted.nextCursor.nextValue).toBe(49);
  });

  it('random peek matches the next emit for the same cursor', () => {
    const params = { kind: 'random' as const, min: 0, max: 1, integer: false, seed: 123 };
    const cursor = randomParadigm.initCursor(params);
    const peeked = randomParadigm.peek(params, cursor);
    const emitted = randomParadigm.emit(params, cursor);
    expect(peeked).toEqual(emitted.value);
  });

  it('downstream ValueNode receives generator output', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      { id: 'g', label: 'gen', params: { kind: 'counter', start: 10, step: 5 } },
      0,
    );
    m = addValueNode(m, { id: 'v', label: 'v', unitId: 'free', initialNumber: 0 }, 0);
    m = addEdge(m, { from: 'g', to: 'v', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);
    state = {
      ...state,
      generatorRuntime: { ...state.generatorRuntime, g: { ...state.generatorRuntime['g']!, enabled: true } },
    };
    state = step(state, m);
    expect(state.values['v']).toEqual(numericValue(10, 'free'));
    state = step(state, m);
    expect(state.values['v']).toEqual(numericValue(15, 'free'));
  });
});

describe('GeneratorNode — schema / serialization', () => {
  it('serializes params but never runtime', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      {
        id: 'g',
        label: 'gen',
        params: { kind: 'random', min: -5, max: 5, integer: true, seed: 13 },
      },
      0,
    );
    const doc = modelToDocument(m);
    const parsed = TramaDocumentSchema.parse(doc);
    expect(parsed.nodes[0]).toMatchObject({
      kind: 'generator',
      params: { kind: 'random', min: -5, max: 5, integer: true, seed: 13 },
    });
    expect(JSON.stringify(doc)).not.toContain('generatorRuntime');
    expect(JSON.stringify(doc)).not.toContain('cursor');

    const round = documentToModel(parsed);
    const n = round.nodes['g']!;
    expect(isGeneratorNode(n)).toBe(true);
    if (isGeneratorNode(n)) {
      expect(n.params).toEqual({ kind: 'random', min: -5, max: 5, integer: true, seed: 13 });
    }
  });
});

describe('GeneratorRegistry', () => {
  it('routes by kind, throws on unknown', () => {
    const reg = createDefaultGeneratorRegistry();
    const c = reg.initCursor({ kind: 'counter', start: 0, step: 1 });
    expect(c.kind).toBe('counter');
    const r = reg.initCursor({ kind: 'random', min: 0, max: 1, integer: false, seed: 1 });
    expect(r.kind).toBe('random');
    expect(() => reg.initCursor({ kind: 'bogus' as never, start: 0, step: 1 } as never)).toThrow();
  });

  it('reinitializes cursor when paradigm kind mismatches', () => {
    const reg = createDefaultGeneratorRegistry();
    // counter params + random cursor → cursor 재초기화.
    const out = reg.emit(
      { kind: 'counter', start: 100, step: 0 },
      { kind: 'random', prngState: 12345 },
    );
    expect(out.value).toEqual(numericValue(100, 'free'));
  });
});
