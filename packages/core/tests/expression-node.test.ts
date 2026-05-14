import { describe, expect, it } from 'vitest';
import {
  addEdge,
  addExpressionNode,
  addValueNode,
  createEmptyModel,
} from '../src/index.js';
import { createDefaultCombinerRegistry } from '../src/combiners/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';
import {
  getNumericValue,
  initializeFromInitialValues,
  isOutputValid,
  propagateOneStep,
} from '../src/execution/index.js';
import type { ExpressionEvaluator } from '../src/execution/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

/** 테스트용 결정적 평가기 — `a + b` 와 `bad` 입력에 대해 정해진 결과를 반환. */
const stubEvaluator: ExpressionEvaluator = {
  evaluate: (latex, vars) => {
    if (latex === 'a+b') {
      const a = vars.a;
      const b = vars.b;
      if (typeof a !== 'number' || typeof b !== 'number') return undefined;
      return a + b;
    }
    if (latex === '42') return 42;
    return undefined;
  },
  diagnose: (latex, vars) => {
    if (latex === 'a+b') {
      const a = vars.a;
      const b = vars.b;
      if (typeof a !== 'number')
        return { ok: false, status: 'unbound', variable: 'a' };
      if (typeof b !== 'number')
        return { ok: false, status: 'unbound', variable: 'b' };
      return { ok: true, value: a + b };
    }
    if (latex === '42') return { ok: true, value: 42 };
    if (latex === 'bad')
      return { ok: false, status: 'unsupported', reason: 'parse-failed' };
    return { ok: false, status: 'unsupported' };
  },
  analyze: () => ({
    required: [],
    constants: [],
    evaluable: true,
    unsupported: [],
  }),
};

function setupSum() {
  let m = createEmptyModel();
  m = addValueNode(m, {
    id: 'a',
    label: 'A',
    unitId: 'count',
    unitOverride: { min: -100, max: 100 },
    initialNumber: 3,
  });
  m = addValueNode(m, {
    id: 'b',
    label: 'B',
    unitId: 'count',
    unitOverride: { min: -100, max: 100 },
    initialNumber: 5,
  });
  m = addExpressionNode(m, {
    id: 'e',
    label: '합',
    latex: 'a+b',
    variables: ['a', 'b'],
  });
  m = addEdge(m, {
    from: 'a',
    to: 'e',
    shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    slotIndex: 0,
  });
  m = addEdge(m, {
    from: 'b',
    to: 'e',
    shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    slotIndex: 1,
  });
  return m;
}

describe('ExpressionNode propagation', () => {
  it('모든 변수가 바인딩되면 정상 평가하고 invalidReason은 비어 있다', () => {
    const m = setupSum();
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      expressionEvaluator: stubEvaluator,
    });
    expect(getNumericValue(s, 'e')).toBe(8);
    expect(isOutputValid(s, 'e', 0)).toBe(true);
    expect(s.invalidReasons['e']).toBeUndefined();
  });

  it('일부 슬롯이 미연결이면 invalid + status=unbound + missing variable 기록', () => {
    let m = setupSum();
    // a→e 엣지 제거 (slotIndex 0 미바인딩 시뮬레이션)
    const aToE = Object.values(m.edges).find(
      (e) => e.from === 'a' && e.to === 'e',
    );
    if (aToE) {
      m = {
        ...m,
        edges: Object.fromEntries(
          Object.entries(m.edges).filter(([id]) => id !== aToE.id),
        ),
        edgeOrder: m.edgeOrder.filter((id) => id !== aToE.id),
      };
    }
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      expressionEvaluator: stubEvaluator,
    });
    expect(isOutputValid(s, 'e', 0)).toBe(false);
    const reason = s.invalidReasons['e'];
    expect(reason?.status).toBe('unbound');
    expect(reason?.variable).toBe('a');
  });

  it('상수식(variables=[])은 diagnose 결과로 평가된다', () => {
    let m = createEmptyModel();
    m = addExpressionNode(m, {
      id: 'k',
      label: '상수',
      latex: '42',
      variables: [],
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      expressionEvaluator: stubEvaluator,
    });
    expect(getNumericValue(s, 'k')).toBe(42);
    expect(isOutputValid(s, 'k', 0)).toBe(true);
    expect(s.invalidReasons['k']).toBeUndefined();
  });

  it('파싱 실패 식은 status=unsupported로 기록된다', () => {
    let m = createEmptyModel();
    m = addExpressionNode(m, {
      id: 'bad',
      label: '깨진식',
      latex: 'bad',
      variables: [],
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      expressionEvaluator: stubEvaluator,
    });
    expect(isOutputValid(s, 'bad', 0)).toBe(false);
    expect(s.invalidReasons['bad']?.status).toBe('unsupported');
  });

  it('한 번 invalid가 적힌 뒤 평가 성공 시 invalidReasons에서 제거된다', () => {
    let m = setupSum();
    // 1) a 엣지 빼고 invalid 상태 만든다
    const aToE = Object.values(m.edges).find(
      (e) => e.from === 'a' && e.to === 'e',
    );
    let m1 = m;
    if (aToE) {
      m1 = {
        ...m,
        edges: Object.fromEntries(
          Object.entries(m.edges).filter(([id]) => id !== aToE.id),
        ),
        edgeOrder: m.edgeOrder.filter((id) => id !== aToE.id),
      };
    }
    const s1 = propagateOneStep(initializeFromInitialValues(m1), m1, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      expressionEvaluator: stubEvaluator,
    });
    expect(s1.invalidReasons['e']?.status).toBe('unbound');

    // 2) 다시 엣지 붙어 있는 그래프로 propagate (state는 s1을 그대로 이어받음)
    const s2 = propagateOneStep(s1, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      expressionEvaluator: stubEvaluator,
    });
    expect(isOutputValid(s2, 'e', 0)).toBe(true);
    expect(s2.invalidReasons['e']).toBeUndefined();
  });
});
