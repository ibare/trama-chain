import { describe, expect, it } from 'vitest';
import {
  addEdge,
  addValueNode,
  createEmptyModel,
  setExecution,
  type Model,
} from '../src/model/index.js';
import { createDefaultCombinerRegistry } from '../src/combiners/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';
import {
  InstantaneousCycleError,
  buildTopology,
  executeModel,
  initializeFromInitialValues,
  propagateOneStep,
} from '../src/execution/index.js';
import { mulberry32 } from '../src/execution/rng.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

/**
 * 테스트용 ad-hoc number 단위 — number kind 베이스 카탈로그('count') 위에
 * min/max/suffix를 override로 얹는다. spread해서 addValueNode에 풀어 넣는다.
 */
function numberUnit(min: number, max: number, suffix = '') {
  return {
    unitId: 'count',
    unitOverride: { min, max, suffix },
  } as const;
}

describe('topology', () => {
  it('orders simple chain', () => {
    let m = createEmptyModel();
    m = addValueNode(m, { id: 'a', label: 'A', ...numberUnit(0, 10), initialValue: 0 });
    m = addValueNode(m, { id: 'b', label: 'B', ...numberUnit(0, 10), initialValue: 0 });
    m = addValueNode(m, { id: 'c', label: 'C', ...numberUnit(0, 10), initialValue: 0 });
    m = addEdge(m, { from: 'a', to: 'b', shape: { kind: 'linear', params: { slope: 1, offset: 0 } } });
    m = addEdge(m, { from: 'b', to: 'c', shape: { kind: 'linear', params: { slope: 1, offset: 0 } } });
    const t = buildTopology(m);
    expect(t.order).toEqual(['a', 'b', 'c']);
  });

  it('throws on instantaneous cycle', () => {
    let m = createEmptyModel();
    m = addValueNode(m, { id: 'a', label: 'A', ...numberUnit(0, 10), initialValue: 0 });
    m = addValueNode(m, { id: 'b', label: 'B', ...numberUnit(0, 10), initialValue: 0 });
    m = addEdge(m, { from: 'a', to: 'b', shape: { kind: 'linear', params: { slope: 1, offset: 0 } } });
    m = addEdge(m, { from: 'b', to: 'a', shape: { kind: 'linear', params: { slope: 1, offset: 0 } } });
    expect(() => buildTopology(m)).toThrow(InstantaneousCycleError);
  });

  it('allows feedback (lag=1) cycle without error', () => {
    let m = createEmptyModel();
    m = addValueNode(m, { id: 'a', label: 'A', ...numberUnit(0, 10), initialValue: 0 });
    m = addValueNode(m, { id: 'b', label: 'B', ...numberUnit(0, 10), initialValue: 0 });
    m = addEdge(m, { from: 'a', to: 'b', shape: { kind: 'linear', params: { slope: 1, offset: 0 } } });
    m = addEdge(m, {
      from: 'b',
      to: 'a',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      lag: 1,
    });
    expect(() => buildTopology(m)).not.toThrow();
  });
});

describe('propagateOneStep', () => {
  it('linear chain propagates', () => {
    let m = createEmptyModel();
    m = addValueNode(m, { id: 'a', label: 'A', ...numberUnit(0, 100), initialValue: 50 });
    m = addValueNode(m, { id: 'b', label: 'B', ...numberUnit(0, 100), initialValue: 0 });
    m = addEdge(m, {
      from: 'a',
      to: 'b',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    });
    const state = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    // 50/100 = 0.5 → linear(0.5) = 0.5 → denorm to [0,100] = 50
    expect(state.values.b).toBeCloseTo(50);
  });

  it('sum combiner combines multiple inputs', () => {
    let m = createEmptyModel();
    m = addValueNode(m, { id: 'a', label: 'A', ...numberUnit(0, 10), initialValue: 5 });
    m = addValueNode(m, { id: 'b', label: 'B', ...numberUnit(0, 10), initialValue: 3 });
    m = addValueNode(m, {
      id: 'c',
      label: 'C',
      ...numberUnit(0, 20),
      initialValue: 0,
      combiner: 'sum',
    });
    m = addEdge(m, { from: 'a', to: 'c', shape: { kind: 'linear', params: { slope: 1, offset: 0 } } });
    m = addEdge(m, { from: 'b', to: 'c', shape: { kind: 'linear', params: { slope: 1, offset: 0 } } });
    const state = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    // a contrib: norm 0.5 → linear → 0.5 → denorm [0,20] = 10
    // b contrib: norm 0.3 → linear → 0.3 → denorm [0,20] = 6
    // sum = 16
    expect(state.values.c).toBeCloseTo(16);
  });

  it('inverted edge flips output', () => {
    let m = createEmptyModel();
    m = addValueNode(m, { id: 'a', label: 'A', ...numberUnit(0, 10), initialValue: 8 });
    m = addValueNode(m, { id: 'b', label: 'B', ...numberUnit(0, 10), initialValue: 0 });
    m = addEdge(m, {
      from: 'a',
      to: 'b',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      inverted: true,
    });
    const state = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    // 0.8 → 1 - 0.8 = 0.2 → 2
    expect(state.values.b).toBeCloseTo(2);
  });
});

describe('executeModel (N-step)', () => {
  it('deterministic compound growth via feedback', () => {
    let m = createEmptyModel();
    m = addValueNode(m, {
      id: 'balance',
      label: '잔액',
      ...numberUnit(0, 10000),
      initialValue: 1000,
      combiner: 'sum',
    });
    m = addValueNode(m, {
      id: 'interest',
      label: '이자',
      ...numberUnit(0, 1000),
      initialValue: 0,
    });
    // interest = 0.1 * balance (slope 0.1)
    m = addEdge(m, {
      from: 'balance',
      to: 'interest',
      shape: { kind: 'linear', params: { slope: 0.1, offset: 0 } },
    });
    // feedback: interest 누적 to balance
    m = addEdge(m, {
      from: 'interest',
      to: 'balance',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      lag: 1,
    });
    m = setExecution(m, { steps: 3 });

    const traj = executeModel(m, { shapeRegistry: shapes, combinerRegistry: combiners });
    // traj[0] = initial, traj[1] propagation 후, ...
    expect(traj.length).toBeGreaterThanOrEqual(4);
    // 잔액이 시간이 갈수록 증가 (10% 복리)
    const finalBalance = traj[traj.length - 1]!.values.balance;
    expect(finalBalance).toBeGreaterThan(1000);
  });

  it('stochastic is reproducible with seeded rng', () => {
    let m = stochasticSlotModel();
    m = setExecution(m, { steps: 50 });

    const r1 = executeModel(m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      rng: mulberry32(42),
    });
    const r2 = executeModel(m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      rng: mulberry32(42),
    });
    const f1 = r1[r1.length - 1]!.values.balance;
    const f2 = r2[r2.length - 1]!.values.balance;
    expect(f1).toBe(f2);

    const r3 = executeModel(m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      rng: mulberry32(43),
    });
    const f3 = r3[r3.length - 1]!.values.balance;
    expect(f3).not.toBe(f1);
  });
});

function stochasticSlotModel(): Model {
  let m = createEmptyModel();
  m = addValueNode(m, {
    id: 'balance',
    label: '잔액',
    ...numberUnit(0, 30000000, 'krw'),
    initialValue: 10000000,
    combiner: 'sum',
  });
  m = addValueNode(m, {
    id: 'bet',
    label: '회당 베팅',
    ...numberUnit(10000, 1000000, 'krw'),
    initialValue: 50000,
  });
  m = addValueNode(m, {
    id: 'outcome',
    label: '회당 결과',
    ...numberUnit(-1000000, 5000000, 'krw'),
    initialValue: 0,
  });
  m = addEdge(m, {
    from: 'bet',
    to: 'outcome',
    shape: {
      kind: 'stochastic',
      params: {
        distribution: 'bernoulli',
        winProbability: 0.05,
        winMultiplier: 5,
        loseMultiplier: -1,
        bias: 0.2,
      },
    },
  });
  m = addEdge(m, {
    from: 'outcome',
    to: 'balance',
    shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    lag: 1,
  });
  return m;
}
