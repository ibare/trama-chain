import { describe, expect, it } from 'vitest';
import {
  addConditionNode,
  addConstantNode,
  addEdge,
  addGeneratorNode,
  addValueNode,
  booleanValue,
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
    let cursor = counterParadigm.initCursor(params, 0);
    expect(cursor.nextValue).toBe(1);
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = counterParadigm.emit(params, cursor, 0);
      if (r.value?.kind === 'numeric') out.push(r.value.n);
      cursor = r.nextCursor;
    }
    expect(out).toEqual([1, 2, 3, 4]);
  });

  it('counter with step=2.5 produces fractional sequence', () => {
    const params = { kind: 'counter' as const, start: 0, step: 2.5 };
    let cursor = counterParadigm.initCursor(params, 0);
    const out: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = counterParadigm.emit(params, cursor, 0);
      if (r.value?.kind === 'numeric') out.push(r.value.n);
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
    let ca = uniformParadigm.initCursor(params, 0);
    let cb = uniformParadigm.initCursor(params, 0);
    for (let i = 0; i < 5; i++) {
      const ra = uniformParadigm.emit(params, ca, 0);
      const rb = uniformParadigm.emit(params, cb, 0);
      if (ra.value?.kind === 'numeric') a.push(ra.value.n);
      if (rb.value?.kind === 'numeric') b.push(rb.value.n);
      ca = ra.nextCursor;
      cb = rb.nextCursor;
    }
    expect(a).toEqual(b);
  });

  it('values stay within [min, max]', () => {
    const params = { kind: 'uniform' as const, min: 10, max: 20, integer: false, seed: 7 };
    let cursor = uniformParadigm.initCursor(params, 0);
    for (let i = 0; i < 100; i++) {
      const r = uniformParadigm.emit(params, cursor, 0);
      if (r.value?.kind === 'numeric') {
        expect(r.value.n).toBeGreaterThanOrEqual(10);
        expect(r.value.n).toBeLessThanOrEqual(20);
      }
      cursor = r.nextCursor;
    }
  });

  it('integer mode produces only integers', () => {
    const params = { kind: 'uniform' as const, min: 1, max: 6, integer: true, seed: 99 };
    let cursor = uniformParadigm.initCursor(params, 0);
    for (let i = 0; i < 50; i++) {
      const r = uniformParadigm.emit(params, cursor, 0);
      if (r.value?.kind === 'numeric') {
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
    let ca = normalParadigm.initCursor(params, 0);
    let cb = normalParadigm.initCursor(params, 0);
    for (let i = 0; i < 5; i++) {
      const ra = normalParadigm.emit(params, ca, 0);
      const rb = normalParadigm.emit(params, cb, 0);
      if (ra.value?.kind === 'numeric') a.push(ra.value.n);
      if (rb.value?.kind === 'numeric') b.push(rb.value.n);
      ca = ra.nextCursor;
      cb = rb.nextCursor;
    }
    expect(a).toEqual(b);
  });

  it('large sample: mean·stdev approximate target within tolerance', () => {
    // N=2000 표본의 표본평균·표본표준편차가 모수 근처에 떨어지는지 검사.
    // 단순 검증 — 정밀 통계 테스트가 아니라 변환이 깨졌을 때 잡는 가드.
    const params = { kind: 'normal' as const, mean: 5, stdev: 2, seed: 12345 };
    let cursor = normalParadigm.initCursor(params, 0);
    const samples: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const r = normalParadigm.emit(params, cursor, 0);
      if (r.value?.kind === 'numeric') samples.push(r.value.n);
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
    let cursor = normalParadigm.initCursor(params, 0);
    for (let i = 0; i < 20; i++) {
      const r = normalParadigm.emit(params, cursor, 0);
      if (r.value?.kind === 'numeric') expect(r.value.n).toBe(7);
      cursor = r.nextCursor;
    }
  });

  it('peek matches the next emit (cursor preserved)', () => {
    const params = { kind: 'normal' as const, mean: 0, stdev: 1, seed: 77 };
    const cursor = normalParadigm.initCursor(params, 0);
    const peeked = normalParadigm.peek(params, cursor, 0);
    const emitted = normalParadigm.emit(params, cursor, 0);
    expect(peeked).toEqual(emitted.value);
    expect(normalParadigm.peek(params, cursor, 0)).toEqual(peeked);
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
    const cursor = counterParadigm.initCursor(params, 0);
    const peeked = counterParadigm.peek(params, cursor, 0);
    const emitted = counterParadigm.emit(params, cursor, 0);
    expect(peeked).toEqual(emitted.value);
    // peek는 cursor를 진행하지 않음.
    expect(counterParadigm.peek(params, cursor, 0)).toEqual(peeked);
    // emit은 진행.
    expect(emitted.nextCursor.nextValue).toBe(49);
  });

  it('uniform peek matches the next emit for the same cursor', () => {
    const params = { kind: 'uniform' as const, min: 0, max: 1, integer: false, seed: 123 };
    const cursor = uniformParadigm.initCursor(params, 0);
    const peeked = uniformParadigm.peek(params, cursor, 0);
    const emitted = uniformParadigm.emit(params, cursor, 0);
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

describe('GeneratorNode — boolean gate input', () => {
  // 입력이 연결되면 generator는 boolean gate가 emit을 결정 — runtime.enabled를 덮어쓴다.
  // true=emit / false=freeze / source invalid=freeze. 미연결이면 기존 runtime.enabled 경로.
  it('input=true → emit advances cursor (overrides runtime.enabled=false)', () => {
    let m = createEmptyModel(0);
    m = addConstantNode(m, { id: 'gate', label: 'on', value: booleanValue(true) }, 0);
    m = addGeneratorNode(
      m,
      { id: 'g', label: 'gen', params: { kind: 'counter', start: 1, step: 1 } },
      0,
    );
    m = addEdge(m, { from: 'gate', to: 'g', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);
    // runtime.enabled를 명시적으로 false로 둬도 입력 true가 우선.
    state = {
      ...state,
      generatorRuntime: {
        ...state.generatorRuntime,
        g: { ...state.generatorRuntime['g']!, enabled: false },
      },
    };
    state = step(state, m);
    expect(state.values['g']).toEqual(numericValue(1, 'free'));
    state = step(state, m);
    expect(state.values['g']).toEqual(numericValue(2, 'free'));
  });

  it('input=false → freeze (last value preserved, runtime.enabled ignored)', () => {
    let m = createEmptyModel(0);
    m = addConstantNode(m, { id: 'gate', label: 'off', value: booleanValue(false) }, 0);
    m = addGeneratorNode(
      m,
      { id: 'g', label: 'gen', params: { kind: 'counter', start: 5, step: 5 } },
      0,
    );
    m = addEdge(m, { from: 'gate', to: 'g', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);
    // runtime.enabled=true여도 입력 false가 우선 — freeze.
    state = {
      ...state,
      generatorRuntime: {
        ...state.generatorRuntime,
        g: { ...state.generatorRuntime['g']!, enabled: true },
      },
    };
    const beforeValue = state.values['g'];
    state = step(state, m);
    expect(state.values['g']).toEqual(beforeValue);
    state = step(state, m);
    expect(state.values['g']).toEqual(beforeValue);
  });

  it('no incoming edge → runtime.enabled path preserved', () => {
    // 입력 미연결 — 기존처럼 사용자 ▶ 토글이 emit을 결정.
    let m = createEmptyModel(0);
    m = addGeneratorNode(m, { id: 'g', label: 'gen' }, 0);

    let state = initializeFromInitialValues(m);
    // enabled=false → freeze
    const before = state.values['g'];
    state = step(state, m);
    expect(state.values['g']).toEqual(before);

    // enabled=true → emit
    state = {
      ...state,
      generatorRuntime: {
        ...state.generatorRuntime,
        g: { ...state.generatorRuntime['g']!, enabled: true },
      },
    };
    state = step(state, m);
    expect(state.values['g']).toEqual(numericValue(1, 'free'));
    state = step(state, m);
    expect(state.values['g']).toEqual(numericValue(2, 'free'));
  });

  it('toggle false→true keeps cursor — freeze 구간이 cursor를 진행시키지 않음', () => {
    // gate를 인위적으로 토글하는 시나리오. boolean ValueNode를 통해 source를 바꿔본다.
    // 모델은 동일하고 propagate를 두 번 돌리되 사이에 source value를 뒤집는다.
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'gate', label: 'gate', unitId: 'free', initialValue: booleanValue(true), combiner: 'or' },
      0,
    );
    m = addGeneratorNode(
      m,
      { id: 'g', label: 'gen', params: { kind: 'counter', start: 10, step: 1 } },
      0,
    );
    m = addEdge(m, { from: 'gate', to: 'g', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);
    // gate=true → emit
    state = step(state, m);
    expect(state.values['g']).toEqual(numericValue(10, 'free'));

    // gate=false로 전환 (직접 state 갱신)
    state = { ...state, values: { ...state.values, gate: booleanValue(false) } };
    state = step(state, m);
    // freeze — 값 그대로
    expect(state.values['g']).toEqual(numericValue(10, 'free'));

    // 다시 true → 다음 cursor 값 (11) 진행
    state = { ...state, values: { ...state.values, gate: booleanValue(true) } };
    state = step(state, m);
    expect(state.values['g']).toEqual(numericValue(11, 'free'));
  });

  // gateOpen 캐시는 ticker(웹) 경로가 보는 단일 source-of-truth. propagate는
  // 매 step source state로부터 캐시를 재동기화해야 한다.
  it('propagate syncs runtime.gateOpen from source state (true)', () => {
    let m = createEmptyModel(0);
    m = addConstantNode(m, { id: 'gate', label: 'on', value: booleanValue(true) }, 0);
    m = addGeneratorNode(m, { id: 'g', label: 'gen' }, 0);
    m = addEdge(m, { from: 'gate', to: 'g', shape: { kind: 'none', params: {} } }, 0);
    let state = initializeFromInitialValues(m);
    state = step(state, m);
    expect(state.generatorRuntime['g']!.gateOpen).toBe(true);
  });

  it('propagate syncs runtime.gateOpen from source state (false)', () => {
    let m = createEmptyModel(0);
    m = addConstantNode(m, { id: 'gate', label: 'off', value: booleanValue(false) }, 0);
    m = addGeneratorNode(m, { id: 'g', label: 'gen' }, 0);
    m = addEdge(m, { from: 'gate', to: 'g', shape: { kind: 'none', params: {} } }, 0);
    let state = initializeFromInitialValues(m);
    state = step(state, m);
    expect(state.generatorRuntime['g']!.gateOpen).toBe(false);
  });

  it('propagate respects edge.inverted when syncing gateOpen', () => {
    let m = createEmptyModel(0);
    m = addConstantNode(m, { id: 'gate', label: 'on', value: booleanValue(true) }, 0);
    m = addGeneratorNode(m, { id: 'g', label: 'gen' }, 0);
    m = addEdge(
      m,
      { from: 'gate', to: 'g', shape: { kind: 'none', params: {} }, inverted: true },
      0,
    );
    let state = initializeFromInitialValues(m);
    state = step(state, m);
    expect(state.generatorRuntime['g']!.gateOpen).toBe(false);
  });

  it('no incoming edge → gateOpen stays undefined', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(m, { id: 'g', label: 'gen' }, 0);
    let state = initializeFromInitialValues(m);
    state = step(state, m);
    expect(state.generatorRuntime['g']!.gateOpen).toBeUndefined();
  });
});

describe('GeneratorNode — Condition 슬롯 게이트 (메타 인식)', () => {
  // Condition→Generator: condition 평가 결과가 WrappedValue meta(boolean)로 부착돼
  // generator의 boolean gate로 자연스레 흘러간다. plain boolean 게이트와 동일 시맨틱.
  it('condition true → wrapped meta:true 가 게이트를 연다 (slot 0 경유)', () => {
    let m = createEmptyModel(0);
    m = addValueNode(m, { id: 'v', label: 'v', unitId: 'free', initialNumber: 7 }, 0);
    m = addConditionNode(
      m,
      { id: 'c', label: 'c', operator: '>', threshold: 3 },
      0,
    );
    m = addGeneratorNode(
      m,
      { id: 'g', label: 'gen', params: { kind: 'counter', start: 100, step: 1 } },
      0,
    );
    m = addEdge(m, { from: 'v', to: 'c', shape: { kind: 'none', params: {} }, slotIndex: 0 }, 0);
    m = addEdge(
      m,
      { from: 'c', to: 'g', shape: { kind: 'none', params: {} }, sourceSlotIndex: 0 },
      0,
    );
    let state = initializeFromInitialValues(m);
    state = step(state, m);
    expect(state.generatorRuntime['g']!.gateOpen).toBe(true);
    expect(state.values['g']).toEqual(numericValue(100, 'free'));
    state = step(state, m);
    expect(state.values['g']).toEqual(numericValue(101, 'free'));
  });

  it('condition false → wrapped meta:false 가 게이트를 닫는다 (freeze)', () => {
    let m = createEmptyModel(0);
    m = addValueNode(m, { id: 'v', label: 'v', unitId: 'free', initialNumber: 1 }, 0);
    m = addConditionNode(
      m,
      { id: 'c', label: 'c', operator: '>', threshold: 3 },
      0,
    );
    m = addGeneratorNode(
      m,
      { id: 'g', label: 'gen', params: { kind: 'counter', start: 50, step: 5 } },
      0,
    );
    m = addEdge(m, { from: 'v', to: 'c', shape: { kind: 'none', params: {} }, slotIndex: 0 }, 0);
    // false 슬롯(1) 경유 — Condition meta 는 false 라 게이트도 닫혀야 한다.
    m = addEdge(
      m,
      { from: 'c', to: 'g', shape: { kind: 'none', params: {} }, sourceSlotIndex: 1 },
      0,
    );
    let state = initializeFromInitialValues(m);
    // 명시적으로 enabled=true 로 두어도 게이트가 닫혀야 한다.
    state = {
      ...state,
      generatorRuntime: {
        ...state.generatorRuntime,
        g: { ...state.generatorRuntime['g']!, enabled: true },
      },
    };
    const before = state.values['g'];
    state = step(state, m);
    expect(state.generatorRuntime['g']!.gateOpen).toBe(false);
    expect(state.values['g']).toEqual(before);
  });

  it('condition false + true 슬롯 경유 → 슬롯 invalid 라 freeze (게이트 미캐싱)', () => {
    // 조건이 거짓이면 slot 0(true)는 invalid — Generator가 source invalid를 보고 freeze.
    // gateOpen 캐시는 undefined로 남는다 (캐시 진입 자체가 source valid 조건).
    let m = createEmptyModel(0);
    m = addValueNode(m, { id: 'v', label: 'v', unitId: 'free', initialNumber: 1 }, 0);
    m = addConditionNode(
      m,
      { id: 'c', label: 'c', operator: '>', threshold: 3 },
      0,
    );
    m = addGeneratorNode(
      m,
      { id: 'g', label: 'gen', params: { kind: 'counter', start: 7, step: 1 } },
      0,
    );
    m = addEdge(m, { from: 'v', to: 'c', shape: { kind: 'none', params: {} }, slotIndex: 0 }, 0);
    m = addEdge(
      m,
      { from: 'c', to: 'g', shape: { kind: 'none', params: {} }, sourceSlotIndex: 0 },
      0,
    );
    let state = initializeFromInitialValues(m);
    const before = state.values['g'];
    state = step(state, m);
    expect(state.generatorRuntime['g']!.gateOpen).toBeUndefined();
    expect(state.values['g']).toEqual(before);
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
    const cursor = sineParadigm.initCursor(params, 0);
    expect(cursor.step).toBe(0);
    const r = sineParadigm.emit(params, cursor, 0);
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
    let cursor = sineParadigm.initCursor(params, 0);
    const first = sineParadigm.emit(params, cursor, 0).value;
    for (let i = 0; i < period - 1; i++) {
      cursor = sineParadigm.emit(params, cursor, 0).nextCursor;
    }
    // step=20 일 때 sin(2π) = sin(0) — 부동소수 오차 ε 이내.
    const afterCycle = sineParadigm.peek(
      params,
      sineParadigm.emit(params, cursor, 0).nextCursor,
      0,
    );
    expect(afterCycle?.kind).toBe('numeric');
    if (afterCycle?.kind === 'numeric' && first?.kind === 'numeric') {
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
    let cursor = sineParadigm.initCursor(params, 0);
    for (let i = 0; i < 200; i++) {
      const r = sineParadigm.emit(params, cursor, 0);
      cursor = r.nextCursor;
      expect(r.value?.kind).toBe('numeric');
      if (r.value?.kind === 'numeric') {
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
    let cursor = sineParadigm.initCursor(params, 0);
    cursor = sineParadigm.emit(params, cursor, 0).nextCursor;
    cursor = sineParadigm.emit(params, cursor, 0).nextCursor;
    const peeked = sineParadigm.peek(params, cursor, 0);
    const peekedAgain = sineParadigm.peek(params, cursor, 0);
    expect(peeked).toEqual(peekedAgain);
    const emitted = sineParadigm.emit(params, cursor, 0).value;
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
    let a = sineParadigm.initCursor(params, 0);
    let b = sineParadigm.initCursor(params, 0);
    for (let i = 0; i < 30; i++) {
      const ra = sineParadigm.emit(params, a, 0);
      const rb = sineParadigm.emit(params, b, 0);
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
      0,
    );
    expect(out.value).toEqual(numericValue(100, 'free'));
  });
});
