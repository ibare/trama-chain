import { describe, expect, it } from 'vitest';
import {
  addConditionNode,
  addEdge,
  addGeneratorNode,
  addObserveNode,
  addValueNode,
  createEmptyModel,
  initializeFromInitialValues,
  numericValue,
  outputKey,
  type ExecutionState,
} from '@trama-chain/core';
import {
  selectCableMedium,
  selectIsBranchingSlot,
  selectIsSlotActive,
  selectSourceExecValue,
} from '../src/store/edge-selectors.js';

/**
 * edge-selectors 의 4 함수가 EdgeView 와 spawnOutgoingPulses 가 같은 invariant 를
 * 표현하던 자리들의 *단일 진실* 인지 검증. 식 자체는 단순(set.has·맵 조회·
 * 디스크립터 디스패치) 이지만, 호출자가 두 군데(view + store) 라 식이 한 쪽에서만
 * 변경되어 drift 가 생기던 패턴 (감사 §6.2 (d)) 의 회귀 방지망.
 */

describe('selectIsSlotActive', () => {
  it('validOutputs 에 키 있으면 true, 없으면 false', () => {
    const exec: ExecutionState = {
      values: {},
      sequenceOutputs: {},
      validOutputs: new Set([outputKey('a', 0), outputKey('b', 1)]),
      pendingOutputs: new Set(),
      invalidReasons: {},
      observeBuffers: {},
      observeExtractionRuntime: {},
      generatorRuntime: {},
      stockRuntime: {},
      simulationTimeMs: 0,
    };
    expect(selectIsSlotActive(exec, 'a', 0)).toBe(true);
    expect(selectIsSlotActive(exec, 'b', 1)).toBe(true);
    expect(selectIsSlotActive(exec, 'a', 1)).toBe(false);
    expect(selectIsSlotActive(exec, 'c', 0)).toBe(false);
  });
});

describe('selectIsBranchingSlot', () => {
  it('ConditionNode 의 슬롯 0/1 은 branching, 그 외는 아님', () => {
    let m = createEmptyModel(0);
    m = addConditionNode(m, { id: 'c', label: 'C' }, 0);
    expect(selectIsBranchingSlot(m, 'c', 0)).toBe(true);
    expect(selectIsBranchingSlot(m, 'c', 1)).toBe(true);
    expect(selectIsBranchingSlot(m, 'c', 2)).toBe(false);
  });

  it('ValueNode 단일 슬롯은 branching 아님', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'v', label: 'V', unitId: 'free', initialValue: numericValue(1) },
      0,
    );
    expect(selectIsBranchingSlot(m, 'v', 0)).toBe(false);
  });

  it('모르는 nodeId 는 false', () => {
    const m = createEmptyModel(0);
    expect(selectIsBranchingSlot(m, 'missing', 0)).toBe(false);
  });
});

describe('selectCableMedium', () => {
  it('sine paradigm GeneratorNode 의 본체 슬롯은 undulation', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      {
        id: 'g-sine',
        label: 'sine',
        params: { kind: 'sine', amplitude: 1, period: 1000, phase: 0, offset: 0 },
      },
      0,
    );
    expect(selectCableMedium(m, 'g-sine', 0)).toBe('undulation');
  });

  it('counter paradigm GeneratorNode 는 particle', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      { id: 'g-cnt', label: 'cnt', params: { kind: 'counter', start: 1, step: 1 } },
      0,
    );
    expect(selectCableMedium(m, 'g-cnt', 0)).toBe('particle');
  });

  it('ValueNode 는 particle (outputInterpolation 미정의)', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'v', label: 'V', unitId: 'free', initialValue: numericValue(1) },
      0,
    );
    expect(selectCableMedium(m, 'v', 0)).toBe('particle');
  });

  it('모르는 nodeId 는 particle 폴백', () => {
    const m = createEmptyModel(0);
    expect(selectCableMedium(m, 'missing', 0)).toBe('particle');
  });

  it('Sine → Observe 의 본체 슬롯 0 은 source mirror 결과 undulation', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      {
        id: 'g-sine',
        label: 'sine',
        params: { kind: 'sine', amplitude: 1, period: 1000, phase: 0, offset: 0 },
      },
      0,
    );
    m = addObserveNode(m, { id: 'o', label: 'O' }, 0);
    m = addEdge(m, { id: 'e0', from: 'g-sine', to: 'o' }, 0);
    expect(selectCableMedium(m, 'o', 0)).toBe('undulation');
  });

  it('ObserveNode 의 누적 추출 슬롯 1 은 source 가 continuous 라도 particle (SequencePortSpec)', () => {
    let m = createEmptyModel(0);
    m = addGeneratorNode(
      m,
      {
        id: 'g-sine',
        label: 'sine',
        params: { kind: 'sine', amplitude: 1, period: 1000, phase: 0, offset: 0 },
      },
      0,
    );
    m = addObserveNode(m, { id: 'o', label: 'O' }, 0);
    m = addEdge(m, { id: 'e0', from: 'g-sine', to: 'o' }, 0);
    expect(selectCableMedium(m, 'o', 1)).toBe('particle');
  });
});

describe('selectSourceExecValue', () => {
  it('values 에 있으면 그 ExecValue, 없으면 undefined', () => {
    let m = createEmptyModel(0);
    m = addValueNode(
      m,
      { id: 'v', label: 'V', unitId: 'free', initialValue: numericValue(7) },
      0,
    );
    const exec = initializeFromInitialValues(m);
    const got = selectSourceExecValue(exec, 'v');
    expect(got).toBeDefined();
    expect(selectSourceExecValue(exec, 'missing')).toBeUndefined();
  });
});
