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
  normalParadigm,
  numericValue,
  propagateOneStep,
  sineParadigm,
  TramaDocumentSchema,
  uniformParadigm,
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

describe('GeneratorNode — uniform paradigm', () => {
  it('same seed produces same sequence (deterministic)', () => {
    const params = { kind: 'uniform' as const, min: 0, max: 100, integer: false, seed: 42 };
    const a: number[] = [];
    const b: number[] = [];
    let ca = uniformParadigm.initCursor(params);
    let cb = uniformParadigm.initCursor(params);
    for (let i = 0; i < 5; i++) {
      const ra = uniformParadigm.emit(params, ca);
      const rb = uniformParadigm.emit(params, cb);
      if (ra.value.kind === 'numeric') a.push(ra.value.n);
      if (rb.value.kind === 'numeric') b.push(rb.value.n);
      ca = ra.nextCursor;
      cb = rb.nextCursor;
    }
    expect(a).toEqual(b);
  });

  it('values stay within [min, max]', () => {
    const params = { kind: 'uniform' as const, min: 10, max: 20, integer: false, seed: 7 };
    let cursor = uniformParadigm.initCursor(params);
    for (let i = 0; i < 100; i++) {
      const r = uniformParadigm.emit(params, cursor);
      if (r.value.kind === 'numeric') {
        expect(r.value.n).toBeGreaterThanOrEqual(10);
        expect(r.value.n).toBeLessThanOrEqual(20);
      }
      cursor = r.nextCursor;
    }
  });

  it('integer mode produces only integers', () => {
    const params = { kind: 'uniform' as const, min: 1, max: 6, integer: true, seed: 99 };
    let cursor = uniformParadigm.initCursor(params);
    for (let i = 0; i < 50; i++) {
      const r = uniformParadigm.emit(params, cursor);
      if (r.value.kind === 'numeric') {
        expect(Number.isInteger(r.value.n)).toBe(true);
        expect(r.value.n).toBeGreaterThanOrEqual(1);
        expect(r.value.n).toBeLessThanOrEqual(6);
      }
      cursor = r.nextCursor;
    }
  });
});

describe('GeneratorNode — normal paradigm', () => {
  it('same seed produces same sequence (deterministic)', () => {
    const params = { kind: 'normal' as const, mean: 0, stdev: 1, seed: 42 };
    const a: number[] = [];
    const b: number[] = [];
    let ca = normalParadigm.initCursor(params);
    let cb = normalParadigm.initCursor(params);
    for (let i = 0; i < 5; i++) {
      const ra = normalParadigm.emit(params, ca);
      const rb = normalParadigm.emit(params, cb);
      if (ra.value.kind === 'numeric') a.push(ra.value.n);
      if (rb.value.kind === 'numeric') b.push(rb.value.n);
      ca = ra.nextCursor;
      cb = rb.nextCursor;
    }
    expect(a).toEqual(b);
  });

  it('large sample: mean·stdev approximate target within tolerance', () => {
    // N=2000 표본의 표본평균·표본표준편차가 모수 근처에 떨어지는지 검사.
    // 단순 검증 — 정밀 통계 테스트가 아니라 변환이 깨졌을 때 잡는 가드.
    const params = { kind: 'normal' as const, mean: 5, stdev: 2, seed: 12345 };
    let cursor = normalParadigm.initCursor(params);
    const samples: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const r = normalParadigm.emit(params, cursor);
      if (r.value.kind === 'numeric') samples.push(r.value.n);
      cursor = r.nextCursor;
    }
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const variance =
      samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
    const stdev = Math.sqrt(variance);
    // 모표준편차 2, N=2000 → 평균 SE ≈ 0.045. 0.3 허용은 매우 넉넉.
    expect(Math.abs(mean - 5)).toBeLessThan(0.3);
    expect(Math.abs(stdev - 2)).toBeLessThan(0.3);
  });

  it('stdev=0 collapses to dirac at mean (no noise)', () => {
    const params = { kind: 'normal' as const, mean: 7, stdev: 0, seed: 1 };
    let cursor = normalParadigm.initCursor(params);
    for (let i = 0; i < 20; i++) {
      const r = normalParadigm.emit(params, cursor);
      if (r.value.kind === 'numeric') expect(r.value.n).toBe(7);
      cursor = r.nextCursor;
    }
  });

  it('peek matches the next emit (cursor preserved)', () => {
    const params = { kind: 'normal' as const, mean: 0, stdev: 1, seed: 77 };
    const cursor = normalParadigm.initCursor(params);
    const peeked = normalParadigm.peek(params, cursor);
    const emitted = normalParadigm.emit(params, cursor);
    expect(peeked).toEqual(emitted.value);
    expect(normalParadigm.peek(params, cursor)).toEqual(peeked);
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

  it('uniform peek matches the next emit for the same cursor', () => {
    const params = { kind: 'uniform' as const, min: 0, max: 1, integer: false, seed: 123 };
    const cursor = uniformParadigm.initCursor(params);
    const peeked = uniformParadigm.peek(params, cursor);
    const emitted = uniformParadigm.emit(params, cursor);
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
        params: { kind: 'uniform', min: -5, max: 5, integer: true, seed: 13 },
      },
      0,
    );
    const doc = modelToDocument(m);
    const parsed = TramaDocumentSchema.parse(doc);
    expect(parsed.nodes[0]).toMatchObject({
      kind: 'generator',
      params: { kind: 'uniform', min: -5, max: 5, integer: true, seed: 13 },
    });
    expect(JSON.stringify(doc)).not.toContain('generatorRuntime');
    expect(JSON.stringify(doc)).not.toContain('cursor');

    const round = documentToModel(parsed);
    const n = round.nodes['g']!;
    expect(isGeneratorNode(n)).toBe(true);
    if (isGeneratorNode(n)) {
      expect(n.params).toEqual({ kind: 'uniform', min: -5, max: 5, integer: true, seed: 13 });
    }
  });
});

describe('GeneratorNode — sine paradigm', () => {
  it('emit at step=0 equals offset + amplitude * sin(phase)', () => {
    const params = {
      kind: 'sine' as const,
      amplitude: 2,
      omega: (2 * Math.PI) / 20,
      phase: Math.PI / 6,
      offset: 5,
    };
    const cursor = sineParadigm.initCursor(params);
    expect(cursor.step).toBe(0);
    const r = sineParadigm.emit(params, cursor);
    expect(r.value).toEqual(numericValue(5 + 2 * Math.sin(Math.PI / 6), 'free'));
    expect(r.nextCursor).toEqual({ kind: 'sine', step: 1 });
  });

  it('one full period returns to start value (period = 2π/omega)', () => {
    const period = 20;
    const params = {
      kind: 'sine' as const,
      amplitude: 1,
      omega: (2 * Math.PI) / period,
      phase: 0,
      offset: 0,
    };
    let cursor = sineParadigm.initCursor(params);
    const first = sineParadigm.emit(params, cursor).value;
    for (let i = 0; i < period - 1; i++) {
      cursor = sineParadigm.emit(params, cursor).nextCursor;
    }
    // step=20 일 때 sin(2π) = sin(0) — 부동소수 오차 ε 이내.
    const afterCycle = sineParadigm.peek(params, sineParadigm.emit(params, cursor).nextCursor);
    expect(afterCycle.kind).toBe('numeric');
    if (afterCycle.kind === 'numeric' && first.kind === 'numeric') {
      expect(Math.abs(afterCycle.n - first.n)).toBeLessThan(1e-10);
    }
  });

  it('values stay within [offset - amplitude, offset + amplitude]', () => {
    const params = {
      kind: 'sine' as const,
      amplitude: 3,
      omega: 0.37,
      phase: 1.2,
      offset: 10,
    };
    let cursor = sineParadigm.initCursor(params);
    for (let i = 0; i < 200; i++) {
      const r = sineParadigm.emit(params, cursor);
      cursor = r.nextCursor;
      expect(r.value.kind).toBe('numeric');
      if (r.value.kind === 'numeric') {
        expect(r.value.n).toBeGreaterThanOrEqual(10 - 3 - 1e-12);
        expect(r.value.n).toBeLessThanOrEqual(10 + 3 + 1e-12);
      }
    }
  });

  it('peek returns the value that next emit would produce, without advancing', () => {
    const params = {
      kind: 'sine' as const,
      amplitude: 1,
      omega: 0.5,
      phase: 0,
      offset: 0,
    };
    let cursor = sineParadigm.initCursor(params);
    cursor = sineParadigm.emit(params, cursor).nextCursor;
    cursor = sineParadigm.emit(params, cursor).nextCursor;
    const peeked = sineParadigm.peek(params, cursor);
    const peekedAgain = sineParadigm.peek(params, cursor);
    expect(peeked).toEqual(peekedAgain);
    const emitted = sineParadigm.emit(params, cursor).value;
    expect(emitted).toEqual(peeked);
  });

  it('same params produce identical sequences (deterministic, no seed)', () => {
    const params = {
      kind: 'sine' as const,
      amplitude: 1.5,
      omega: 0.21,
      phase: 0.7,
      offset: -2,
    };
    let a = sineParadigm.initCursor(params);
    let b = sineParadigm.initCursor(params);
    for (let i = 0; i < 30; i++) {
      const ra = sineParadigm.emit(params, a);
      const rb = sineParadigm.emit(params, b);
      expect(ra.value).toEqual(rb.value);
      a = ra.nextCursor;
      b = rb.nextCursor;
    }
  });

  it('round-trip: serialize·parse preserves sine params', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      {
        id: 'g',
        label: '사인파',
        params: { kind: 'sine', amplitude: 2, omega: 0.314, phase: 1, offset: -1 },
      },
      0,
    );
    const doc = modelToDocument(m);
    const parsed = TramaDocumentSchema.parse(JSON.parse(JSON.stringify(doc)));
    const m2 = documentToModel(parsed);
    const n = m2.nodes['g']!;
    expect(isGeneratorNode(n)).toBe(true);
    if (isGeneratorNode(n)) {
      expect(n.params).toEqual({
        kind: 'sine',
        amplitude: 2,
        omega: 0.314,
        phase: 1,
        offset: -1,
      });
    }
  });
});

describe('GeneratorRegistry', () => {
  it('routes by kind, throws on unknown', () => {
    const reg = createDefaultGeneratorRegistry();
    const c = reg.initCursor({ kind: 'counter', start: 0, step: 1 });
    expect(c.kind).toBe('counter');
    const u = reg.initCursor({ kind: 'uniform', min: 0, max: 1, integer: false, seed: 1 });
    expect(u.kind).toBe('uniform');
    const n = reg.initCursor({ kind: 'normal', mean: 0, stdev: 1, seed: 1 });
    expect(n.kind).toBe('normal');
    const s = reg.initCursor({ kind: 'sine', amplitude: 1, omega: 0.1, phase: 0, offset: 0 });
    expect(s.kind).toBe('sine');
    expect(() => reg.initCursor({ kind: 'bogus' as never, start: 0, step: 1 } as never)).toThrow();
  });

  it('reinitializes cursor when paradigm kind mismatches', () => {
    const reg = createDefaultGeneratorRegistry();
    // counter params + uniform cursor → cursor 재초기화.
    const out = reg.emit(
      { kind: 'counter', start: 100, step: 0 },
      { kind: 'uniform', prngState: 12345 },
    );
    expect(out.value).toEqual(numericValue(100, 'free'));
  });
});
