import { describe, expect, it } from 'vitest';
import {
  addConditionalNode,
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
import { createDefaultFunctionRegistry } from '../src/node-functions/index.js';
import {
  initializeFromInitialValues,
  isOutputValid,
  outputKey,
  propagateOneStep,
} from '../src/execution/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();
const functions = createDefaultFunctionRegistry();

function setupAB(a: number, b: number, operator: '>' | '==' | '!=' = '>') {
  let m = createEmptyModel();
  m = addValueNode(m, {
    id: 'a',
    label: 'A',
    unitId: 'count',
    unitOverride: { min: -100, max: 100 },
    initialValue: a,
  });
  m = addValueNode(m, {
    id: 'b',
    label: 'B',
    unitId: 'count',
    unitOverride: { min: -100, max: 100 },
    initialValue: b,
  });
  m = addConditionalNode(m, { id: 'c', label: '조건', operator });
  m = addEdge(m, {
    from: 'a',
    to: 'c',
    shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    slotIndex: 0,
  });
  m = addEdge(m, {
    from: 'b',
    to: 'c',
    shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    slotIndex: 1,
  });
  return m;
}

describe('ConditionalNode propagation', () => {
  it('A > B 참: 참 슬롯만 valid, 값은 A', () => {
    const m = setupAB(7, 3, '>');
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(s.values.c).toBe(7);
    expect(isOutputValid(s, 'c', 0)).toBe(true);
    expect(isOutputValid(s, 'c', 1)).toBe(false);
  });

  it('A > B 거짓: 거짓 슬롯만 valid, 값은 A', () => {
    const m = setupAB(2, 5, '>');
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(s.values.c).toBe(2);
    expect(isOutputValid(s, 'c', 0)).toBe(false);
    expect(isOutputValid(s, 'c', 1)).toBe(true);
  });

  it('A == B', () => {
    const m = setupAB(4, 4, '==');
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(isOutputValid(s, 'c', 0)).toBe(true);
    expect(isOutputValid(s, 'c', 1)).toBe(false);
  });

  it('A != B', () => {
    const m = setupAB(4, 5, '!=');
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(isOutputValid(s, 'c', 0)).toBe(true);
    expect(isOutputValid(s, 'c', 1)).toBe(false);
  });

  it('한쪽 입력 미연결이면 양 슬롯 모두 invalid', () => {
    let m = createEmptyModel();
    m = addValueNode(m, {
      id: 'a',
      label: 'A',
      unitId: 'count',
      unitOverride: { min: -100, max: 100 },
      initialValue: 10,
    });
    m = addConditionalNode(m, { id: 'c', label: '조건', operator: '>' });
    m = addEdge(m, {
      from: 'a',
      to: 'c',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 0,
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(isOutputValid(s, 'c', 0)).toBe(false);
    expect(isOutputValid(s, 'c', 1)).toBe(false);
  });

  it('valid한 출력 슬롯을 통해서만 다운스트림으로 흐른다', () => {
    let m = setupAB(7, 3, '>'); // 참 슬롯 valid
    m = addValueNode(m, {
      id: 'tOut',
      label: '참출력',
      unitId: 'raw',
      initialValue: 0,
    });
    m = addValueNode(m, {
      id: 'fOut',
      label: '거짓출력',
      unitId: 'raw',
      initialValue: 0,
    });
    m = addEdge(m, {
      from: 'c',
      to: 'tOut',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      sourceSlotIndex: 0,
    });
    m = addEdge(m, {
      from: 'c',
      to: 'fOut',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      sourceSlotIndex: 1,
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    // 참 슬롯이 valid → tOut에 A(=7)이 흐른다.
    expect(s.values.tOut).toBe(7);
    // 거짓 슬롯은 invalid → fOut은 초기값 유지.
    expect(s.values.fOut).toBe(0);
  });

  it('outputKey 키 포맷', () => {
    expect(outputKey('c', 0)).toBe('c:0');
    expect(outputKey('c', 1)).toBe('c:1');
    expect(outputKey('c')).toBe('c:0');
  });

  it('직렬화 라운드트립 — conditional 노드와 sourceSlotIndex 보존', () => {
    let m = setupAB(7, 3, '==');
    m = addValueNode(m, {
      id: 'tOut',
      label: '참출력',
      unitId: 'raw',
      initialValue: 0,
    });
    m = addEdge(m, {
      id: 'e1',
      from: 'c',
      to: 'tOut',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      sourceSlotIndex: 1,
    });
    const doc = modelToDocument(m);
    const text = serializeTrama(doc);
    const parsed = parseTrama(text);
    const round = documentToModel(parsed);
    const cNode = round.nodes.c;
    expect(cNode?.kind).toBe('conditional');
    if (cNode?.kind === 'conditional') expect(cNode.operator).toBe('==');
    const e = round.edges.e1;
    expect(e?.sourceSlotIndex).toBe(1);
  });
});
