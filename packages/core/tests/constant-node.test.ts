import { describe, expect, it } from 'vitest';
import {
  addConstantNode,
  addEdge,
  addFunctionNode,
  addValueNode,
  createEmptyModel,
} from '../src/model/index.js';
import { createDefaultCombinerRegistry } from '../src/combiners/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';
import { createDefaultFunctionRegistry } from '../src/node-functions/index.js';
import {
  initializeFromInitialValues,
  isOutputValid,
  propagateOneStep,
} from '../src/execution/index.js';
import {
  documentToModel,
  modelToDocument,
  parseTrama,
  serializeTrama,
} from '../src/schema/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();
const functions = createDefaultFunctionRegistry();

describe('ConstantNode', () => {
  it('상수는 초기 state에 자기 value로 들어가고 항상 valid', () => {
    let m = createEmptyModel();
    m = addConstantNode(m, { id: 'pi', label: 'π', value: Math.PI, constantKey: 'pi' });
    const s = initializeFromInitialValues(m);
    expect(s.values.pi).toBe(Math.PI);
    expect(isOutputValid(s, 'pi')).toBe(true);
  });

  it('상수→함수 슬롯으로 흐른다 (½ · b · h)', () => {
    let m = createEmptyModel();
    m = addConstantNode(m, { id: 'half', label: '½', value: 0.5, constantKey: 'one-half' });
    m = addValueNode(m, {
      id: 'b',
      label: '밑변',
      unitId: 'count',
      unitOverride: { min: 0, max: 100 },
      initialValue: 10,
    });
    m = addValueNode(m, {
      id: 'h',
      label: '높이',
      unitId: 'count',
      unitOverride: { min: 0, max: 100 },
      initialValue: 6,
    });
    m = addFunctionNode(m, { id: 'mul1', label: '×', functionKey: 'multiply' });
    m = addFunctionNode(m, { id: 'mul2', label: '×', functionKey: 'multiply' });
    // ½ × b
    m = addEdge(m, {
      from: 'half',
      to: 'mul1',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 0,
    });
    m = addEdge(m, {
      from: 'b',
      to: 'mul1',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 1,
    });
    // (½ × b) × h
    m = addEdge(m, {
      from: 'mul1',
      to: 'mul2',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 0,
    });
    m = addEdge(m, {
      from: 'h',
      to: 'mul2',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 1,
    });

    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(s.values.mul1).toBe(5);
    expect(s.values.mul2).toBe(30);
  });

  it('상수 → ValueNode는 raw 통과(타깃 단위 클램프 우회)', () => {
    let m = createEmptyModel();
    m = addConstantNode(m, { id: 'g', label: 'g', value: 9.81, constantKey: 'g' });
    m = addValueNode(m, {
      id: 'out',
      label: 'Out',
      // 타깃 단위가 작더라도 raw 9.81이 그대로 와야 한다.
      unitId: 'count',
      unitOverride: { min: 0, max: 1 },
      initialValue: 0,
    });
    m = addEdge(m, {
      from: 'g',
      to: 'out',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(s.values.out).toBeCloseTo(9.81);
  });

  it('직렬화 라운드트립 — 상수 노드 보존', () => {
    let m = createEmptyModel(1731234567890);
    m = {
      ...m,
      id: 'mdl-const',
      createdAt: 1731234567890,
      updatedAt: 1731234567890,
    };
    m = addConstantNode(m, {
      id: 'pi',
      label: 'π',
      value: Math.PI,
      constantKey: 'pi',
      position: { x: 100, y: 50 },
    });
    const doc = modelToDocument(m);
    const text = serializeTrama(doc);
    const parsed = parseTrama(text);
    const round = documentToModel(parsed);
    const restored = round.nodes.pi;
    expect(restored?.kind).toBe('constant');
    if (restored && restored.kind === 'constant') {
      expect(restored.value).toBe(Math.PI);
      expect(restored.constantKey).toBe('pi');
      expect(restored.position).toEqual({ x: 100, y: 50 });
    }
  });
});
