import { describe, expect, it } from 'vitest';
import {
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

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();
const functions = createDefaultFunctionRegistry();

function numberUnit(min: number, max: number) {
  return { unitId: 'count', unitOverride: { min, max } } as const;
}

function setupBinaryFn(functionKey: string, a: number, b: number) {
  let m = createEmptyModel();
  m = addValueNode(m, {
    id: 'a',
    label: 'A',
    ...numberUnit(-100, 100),
    initialValue: a,
  });
  m = addValueNode(m, {
    id: 'b',
    label: 'B',
    ...numberUnit(-100, 100),
    initialValue: b,
  });
  m = addFunctionNode(m, {
    id: 'fn',
    label: 'F',
    functionKey,
    outputUnitId: 'count',
    outputUnitOverride: { min: -10000, max: 10000 },
  });
  m = addEdge(m, {
    from: 'a',
    to: 'fn',
    shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    slotIndex: 0,
  });
  m = addEdge(m, {
    from: 'b',
    to: 'fn',
    shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    slotIndex: 1,
  });
  return m;
}

describe('default function registry', () => {
  it('registers the base set', () => {
    expect(functions.has('multiply')).toBe(true);
    expect(functions.has('add')).toBe(true);
    expect(functions.has('subtract')).toBe(true);
    expect(functions.has('divide')).toBe(true);
    expect(functions.has('min')).toBe(true);
    expect(functions.has('max')).toBe(true);
  });

  it('multiply: a × b', () => {
    const m = setupBinaryFn('multiply', 6, 7);
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(s.values.fn).toBe(42);
    expect(isOutputValid(s, 'fn')).toBe(true);
  });

  it('add: a + b', () => {
    const m = setupBinaryFn('add', 5, 8);
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(s.values.fn).toBe(13);
  });

  it('subtract: minuend - subtrahend', () => {
    const m = setupBinaryFn('subtract', 10, 3);
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(s.values.fn).toBe(7);
  });

  it('divide: numerator / denominator', () => {
    const m = setupBinaryFn('divide', 20, 4);
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(s.values.fn).toBe(5);
  });

  it('divide by zero yields invalid node', () => {
    const m = setupBinaryFn('divide', 20, 0);
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(isOutputValid(s, 'fn')).toBe(false);
  });

  it('min / max', () => {
    const mMin = setupBinaryFn('min', 3, 7);
    const mMax = setupBinaryFn('max', 3, 7);
    const sMin = propagateOneStep(initializeFromInitialValues(mMin), mMin, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    const sMax = propagateOneStep(initializeFromInitialValues(mMax), mMax, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(sMin.values.fn).toBe(3);
    expect(sMax.values.fn).toBe(7);
  });

  it('missing slot leaves function invalid', () => {
    let m = createEmptyModel();
    m = addValueNode(m, {
      id: 'a',
      label: 'A',
      ...numberUnit(-100, 100),
      initialValue: 5,
    });
    m = addFunctionNode(m, {
      id: 'fn',
      label: 'F',
      functionKey: 'multiply',
      outputUnitId: 'count',
      outputUnitOverride: { min: -10000, max: 10000 },
    });
    m = addEdge(m, {
      from: 'a',
      to: 'fn',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 0,
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(isOutputValid(s, 'fn')).toBe(false);
  });

  it('function output flows downstream into ValueNode (raw passthrough)', () => {
    let m = setupBinaryFn('multiply', 4, 5);
    m = addValueNode(m, {
      id: 'out',
      label: 'Out',
      ...numberUnit(0, 200),
      initialValue: 0,
    });
    m = addEdge(m, {
      from: 'fn',
      to: 'out',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    // 함수 출력은 raw 통과 — 'out'의 단위가 [0,200]임에도 클램프되지 않고 20.
    expect(s.values.fn).toBe(20);
    expect(s.values.out).toBe(20);
    expect(isOutputValid(s, 'out')).toBe(true);
  });

  it('function output without outputUnitId is not clamped', () => {
    // outputUnitId를 지정하지 않으면 함수 결과는 raw 그대로 저장된다.
    let m = createEmptyModel();
    m = addValueNode(m, {
      id: 'a',
      label: 'A',
      ...numberUnit(-100, 100),
      initialValue: 55,
    });
    m = addValueNode(m, {
      id: 'b',
      label: 'B',
      ...numberUnit(-100, 100),
      initialValue: 32,
    });
    m = addFunctionNode(m, {
      id: 'fn',
      label: 'F',
      functionKey: 'multiply',
      // outputUnitId 미지정 — 기존 코드라면 free 0~1로 클램프되어 1로 짓이겨짐.
    });
    m = addEdge(m, {
      from: 'a',
      to: 'fn',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 0,
    });
    m = addEdge(m, {
      from: 'b',
      to: 'fn',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 1,
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(s.values.fn).toBe(1760);
  });

  it('function output flowing into cm value node is not clamped to cm max', () => {
    // 회귀 — 사용자 시나리오: 55*32=1760이 'cm' 단위의 defaultMax(250)에 짓이겨지지
    // 않아야 한다.
    let m = createEmptyModel();
    m = addValueNode(m, {
      id: 'w',
      label: 'W',
      unitId: 'cm',
      initialValue: 55,
    });
    m = addValueNode(m, {
      id: 'h',
      label: 'H',
      unitId: 'cm',
      initialValue: 32,
    });
    m = addFunctionNode(m, {
      id: 'fn',
      label: 'F',
      functionKey: 'multiply',
    });
    m = addValueNode(m, {
      id: 'area',
      label: 'Area',
      unitId: 'cm',
      initialValue: 0,
    });
    m = addEdge(m, {
      from: 'w',
      to: 'fn',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 0,
    });
    m = addEdge(m, {
      from: 'h',
      to: 'fn',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 1,
    });
    m = addEdge(m, {
      from: 'fn',
      to: 'area',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      functionRegistry: functions,
    });
    expect(s.values.fn).toBe(1760);
    expect(s.values.area).toBe(1760);
  });
});
