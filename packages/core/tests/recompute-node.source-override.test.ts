import { describe, expect, it } from 'vitest';
import {
  addConditionNode,
  addEdge,
  addValueNode,
  createEmptyModel,
  numericValue,
} from '../src/index.js';
import { createDefaultCombinerRegistry } from '../src/combiners/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';
import {
  initializeFromInitialValues,
  outputKey,
  propagateOneStep,
  recomputeNode,
} from '../src/execution/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

/**
 * v → c (Condition >0) 그래프. c 는 슬롯 0(true)·1(false) 두 branching 슬롯.
 */
function setup(initial: number) {
  let m = createEmptyModel();
  m = addValueNode(m, {
    id: 'v',
    label: 'V',
    unitId: 'count',
    unitOverride: { min: -100, max: 100 },
    initialNumber: initial,
  });
  m = addConditionNode(m, { id: 'c', label: '조건', operator: '>', threshold: 0 });
  m = addEdge(m, {
    from: 'v',
    to: 'c',
    shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    slotIndex: 0,
  });
  return m;
}

describe('recomputeNode — sourceOverride 의 branching 슬롯 배제', () => {
  it('branching source 의 다른 슬롯이 stale valid 였다면 override 적용 시 제거된다', () => {
    const m = setup(5);
    // 1) 정상 propagate — v=5 → c 슬롯 0(true) valid, 슬롯 1(false) invalid.
    let s = initializeFromInitialValues(m);
    s = propagateOneStep(s, m, { shapeRegistry: shapes, combinerRegistry: combiners });
    expect(s.validOutputs.has(outputKey('c', 0))).toBe(true);
    expect(s.validOutputs.has(outputKey('c', 1))).toBe(false);

    // 2) stale 상황 강제 — 슬롯 1(false) 도 valid 한 상태로 조작.
    s = {
      ...s,
      validOutputs: new Set([...s.validOutputs, outputKey('c', 1)]),
    };
    expect(s.validOutputs.has(outputKey('c', 0))).toBe(true);
    expect(s.validOutputs.has(outputKey('c', 1))).toBe(true);

    // 3) 슬롯 0 펄스 도착을 시뮬레이션 — recomputeNode 가 슬롯 1 의 stale valid 를 제거해야.
    const result = recomputeNode('c', s, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      sourceOverride: {
        sourceNodeId: 'c',
        sourceSlotIndex: 0,
        value: numericValue(5, 'count'),
      },
    });
    expect(result.validOutputs.has(outputKey('c', 0))).toBe(true);
    expect(result.validOutputs.has(outputKey('c', 1))).toBe(false);
  });

  it('branching=false source 는 override 가 다른 슬롯에 영향을 주지 않는다', () => {
    // ValueNode 는 슬롯 0 단일 출력 + branching=false. 영향 없는지 확인.
    let m = createEmptyModel();
    m = addValueNode(m, {
      id: 'v',
      label: 'V',
      unitId: 'count',
      unitOverride: { min: -100, max: 100 },
      initialNumber: 1,
    });
    m = addValueNode(m, {
      id: 'w',
      label: 'W',
      unitId: 'count',
      unitOverride: { min: -100, max: 100 },
      initialNumber: 2,
    });
    m = addEdge(m, {
      from: 'v',
      to: 'w',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 0,
    });

    let s = initializeFromInitialValues(m);
    s = propagateOneStep(s, m, { shapeRegistry: shapes, combinerRegistry: combiners });
    // ValueNode v 의 슬롯 0 valid.
    expect(s.validOutputs.has(outputKey('v', 0))).toBe(true);

    // 슬롯 0 펄스 도착 — fix 가 적용되어도 다른 슬롯이 없으므로 valid set 의 v:0 만 켜진다.
    const result = recomputeNode('w', s, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      sourceOverride: {
        sourceNodeId: 'v',
        sourceSlotIndex: 0,
        value: numericValue(7, 'count'),
      },
    });
    // v 의 슬롯 0 은 valid 유지.
    expect(result.validOutputs.has(outputKey('v', 0))).toBe(true);
    // 가상의 v:1 같은 슬롯이 valid 였다면 그대로 — fix 는 *branching 슬롯만* 정리.
    // (이 시나리오에서는 그런 슬롯 자체가 없으므로 확인하지 않는다.)
  });
});
