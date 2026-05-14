import { describe, expect, it } from 'vitest';
import {
  addConditionNode,
  addEdge,
  addValueNode,
  createEmptyModel,
  documentToModel,
  modelToDocument,
  parseTrama,
  serializeTrama,
} from '../src/index.js';
import { createDefaultCombinerRegistry } from '../src/combiners/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';
import type { ConditionOperator } from '../src/model/types.js';
import {
  initializeFromInitialValues,
  isOutputValid,
  outputKey,
  propagateOneStep,
} from '../src/execution/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

/**
 * 단일 입력 v→c(operator, threshold) 게이트 구성.
 * 조건이 참이면 c의 단일 출력으로 v가 그대로 통과한다.
 */
function setup(v: number, threshold: number, operator: ConditionOperator = '>') {
  let m = createEmptyModel();
  m = addValueNode(m, {
    id: 'v',
    label: 'V',
    unitId: 'count',
    unitOverride: { min: -100, max: 100 },
    initialValue: v,
  });
  m = addConditionNode(m, { id: 'c', label: '조건', operator, threshold });
  m = addEdge(m, {
    from: 'v',
    to: 'c',
    shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    slotIndex: 0,
  });
  return m;
}

describe('ConditionNode 게이트 시맨틱', () => {
  it('조건 참 — 입력값이 출력으로 통과, 출력 valid', () => {
    const m = setup(7, 3, '>');
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(s.values.c).toBe(7);
    expect(isOutputValid(s, 'c', 0)).toBe(true);
  });

  it('조건 거짓 — 출력 invalid', () => {
    const m = setup(2, 5, '>');
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(isOutputValid(s, 'c', 0)).toBe(false);
  });

  it('== / != 연산자', () => {
    const mEq = setup(4, 4, '==');
    const sEq = propagateOneStep(initializeFromInitialValues(mEq), mEq, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(isOutputValid(sEq, 'c', 0)).toBe(true);

    const mNe = setup(4, 4, '!=');
    const sNe = propagateOneStep(initializeFromInitialValues(mNe), mNe, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(isOutputValid(sNe, 'c', 0)).toBe(false);
  });

  it('>= / <= 경계값', () => {
    const mGe = setup(5, 5, '>=');
    const sGe = propagateOneStep(initializeFromInitialValues(mGe), mGe, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(isOutputValid(sGe, 'c', 0)).toBe(true);

    const mLe = setup(5, 5, '<=');
    const sLe = propagateOneStep(initializeFromInitialValues(mLe), mLe, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(isOutputValid(sLe, 'c', 0)).toBe(true);

    const mGt = setup(5, 5, '>');
    const sGt = propagateOneStep(initializeFromInitialValues(mGt), mGt, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(isOutputValid(sGt, 'c', 0)).toBe(false);
  });

  it('입력 미연결이면 출력 invalid', () => {
    let m = createEmptyModel();
    m = addConditionNode(m, { id: 'c', label: '조건', operator: '>', threshold: 0 });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(isOutputValid(s, 'c', 0)).toBe(false);
  });

  it('valid한 출력만 다운스트림으로 흐른다', () => {
    let m = setup(7, 3, '>'); // 통과
    m = addValueNode(m, {
      id: 'out',
      label: '출력',
      unitId: 'raw',
      initialValue: 0,
    });
    m = addEdge(m, {
      from: 'c',
      to: 'out',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(s.values.out).toBe(7);

    let m2 = setup(2, 5, '>'); // 차단
    m2 = addValueNode(m2, {
      id: 'out',
      label: '출력',
      unitId: 'raw',
      initialValue: 0,
    });
    m2 = addEdge(m2, {
      from: 'c',
      to: 'out',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    });
    const s2 = propagateOneStep(initializeFromInitialValues(m2), m2, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(s2.values.out).toBe(0);
  });

  it('outputKey 키 포맷', () => {
    expect(outputKey('c', 0)).toBe('c:0');
    expect(outputKey('c')).toBe('c:0');
  });

  it('직렬화 라운드트립 — operator·threshold 보존', () => {
    const m = setup(7, 3, '==');
    const doc = modelToDocument(m);
    const text = serializeTrama(doc);
    const parsed = parseTrama(text);
    const round = documentToModel(parsed);
    const cNode = round.nodes.c;
    expect(cNode?.kind).toBe('condition');
    if (cNode?.kind === 'condition') {
      expect(cNode.operator).toBe('==');
      expect(cNode.threshold).toBe(3);
    }
  });
});
