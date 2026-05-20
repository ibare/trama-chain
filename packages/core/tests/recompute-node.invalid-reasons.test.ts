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
  initializeFromInitialValues,
  recomputeNode,
} from '../src/execution/index.js';
import type { ExpressionEvaluator } from '../src/execution/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

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
    return { ok: false, status: 'unsupported' };
  },
  analyze: () => ({
    required: [],
    constants: [],
    evaluable: true,
    unsupported: [],
  }),
};

describe('recomputeNode — newInvalidReasons 노출', () => {
  it('평가 성공으로 직전 invalid 사유가 newInvalidReasons 에서 제거된다', () => {
    let m = createEmptyModel();
    m = addExpressionNode(m, {
      id: 'e',
      label: '상수',
      latex: '42',
      variables: [],
    });

    // stale 사유 강제 — 직전 step 에서 평가 실패했다고 가정.
    const seeded = initializeFromInitialValues(m);
    const s = {
      ...seeded,
      invalidReasons: {
        ...seeded.invalidReasons,
        e: { ok: false as const, status: 'unsupported' as const },
      },
    };
    expect(s.invalidReasons.e).toBeDefined();

    const result = recomputeNode('e', s, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      expressionEvaluator: stubEvaluator,
    });

    expect(result.newInvalidReasons.e).toBeUndefined();
  });

  it('평가 실패가 newInvalidReasons 에 기록된다 — 변수 미충족', () => {
    let m = createEmptyModel();
    m = addValueNode(m, {
      id: 'a',
      label: 'A',
      unitId: 'count',
      unitOverride: { min: -100, max: 100 },
      initialNumber: 3,
    });
    m = addExpressionNode(m, {
      id: 'e',
      label: '합',
      latex: 'a+b',
      variables: ['a', 'b'],
    });
    // 변수 'a' 만 바인딩 — 'b' 는 unbound 로 invalid 사유 기록 예상.
    m = addEdge(m, {
      from: 'a',
      to: 'e',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 0,
    });

    const s = initializeFromInitialValues(m);
    expect(s.invalidReasons.e).toBeUndefined();

    const result = recomputeNode('e', s, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      expressionEvaluator: stubEvaluator,
    });

    expect(result.newInvalidReasons.e).toBeDefined();
    expect(result.newInvalidReasons.e?.status).toBe('unbound');
  });
});
