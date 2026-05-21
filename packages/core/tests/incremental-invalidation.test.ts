import { describe, expect, it } from 'vitest';
import {
  addConditionNode,
  addConstantNode,
  addEdge,
  addValueNode,
  buildTopology,
  cascadeInvalidation,
  createDefaultCombinerRegistry,
  createEmptyModel,
  initializeFromInitialValues,
  numericValue,
  outputKey,
  propagateOneStep,
  recomputeNode,
} from '../src/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

describe('cascadeInvalidation', () => {
  it('simulationTimeMs 보존 — prior 시간축이 결과에 그대로 유지된다', () => {
    // 회귀 — 이 시맨틱이 본 함수의 존재 이유. computeExecutionState 처럼
    // initializeFromInitialValues 로 빈 시작이 아니라 prior state 에서 출발.
    let m = createEmptyModel(0);
    m = addConstantNode(
      m,
      { id: 'k', label: 'k', value: numericValue(5, 'free') },
      0,
    );
    m = addValueNode(
      m,
      { id: 'v', label: 'v', unitId: 'free', initialNumber: 0 },
      0,
    );
    m = addEdge(m, { from: 'k', to: 'v', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);
    state = propagateOneStep(state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    // prior 시뮬레이션 시간을 임의의 값으로 박는다 — cascade 가 0 으로 리셋하지
    // 않아야 한다는 검증.
    state = { ...state, simulationTimeMs: 12_345 };

    const result = recomputeNode('v', state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    const cascaded = cascadeInvalidation('v', result, state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });

    expect(cascaded.executionState.simulationTimeMs).toBe(12_345);
  });

  it('Condition 슬롯 flip — falseSlot 이 rootNewlyValidSlots 에 들어간다', () => {
    // 시나리오: ConstantNode k=+1 → Condition(>0). 초기 상태에서 trueSlot valid,
    // falseSlot invalid. k=-1 펄스 도착으로 재계산하면 trueSlot invalid,
    // falseSlot valid 로 flip — falseSlot 이 *새로* valid 가 됐으므로
    // rootNewlyValidSlots 에 슬롯 1 이 포함돼야 한다 (호출자가 펄스 spawn 트리거).
    let m = createEmptyModel(0);
    m = addConstantNode(
      m,
      { id: 'k', label: 'k', value: numericValue(1, 'free') },
      0,
    );
    m = addConditionNode(
      m,
      { id: 'c', label: 'c', operator: '>', threshold: 0 },
      0,
    );
    m = addEdge(m, { from: 'k', to: 'c', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);
    state = propagateOneStep(state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(state.validOutputs.has(outputKey('c', 0))).toBe(true);
    expect(state.validOutputs.has(outputKey('c', 1))).toBe(false);

    // sourceOverride 로 k=-1 펄스 도착을 시뮬.
    const result = recomputeNode('c', state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      sourceOverride: {
        sourceNodeId: 'k',
        sourceSlotIndex: 0,
        value: numericValue(-1, 'free'),
      },
    });
    expect(result.validOutputs.has(outputKey('c', 0))).toBe(false);
    expect(result.validOutputs.has(outputKey('c', 1))).toBe(true);

    const cascaded = cascadeInvalidation('c', result, state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });

    expect(cascaded.rootNewlyValidSlots.has(1)).toBe(true);
    expect(cascaded.rootNewlyValidSlots.has(0)).toBe(false);
    // 워킹 state 도 합치된 결과.
    expect(cascaded.executionState.validOutputs.has(outputKey('c', 0))).toBe(false);
    expect(cascaded.executionState.validOutputs.has(outputKey('c', 1))).toBe(true);
  });

  it('단일 invalid 전파 — root 슬롯 invalid 가 다운스트림 의존자에게 cascade', () => {
    // A = Condition(>0). B = ValueNode 가 A.trueSlot(0) 만 source 로 받는다.
    // 초기: trueSlot valid → B valid. k=-1 override → trueSlot invalid → B 가
    // 입력을 잃어 pending 으로 떨어져야 한다 (cascade 가 B 까지 도달).
    let m = createEmptyModel(0);
    m = addConstantNode(
      m,
      { id: 'k', label: 'k', value: numericValue(1, 'free') },
      0,
    );
    m = addConditionNode(
      m,
      { id: 'c', label: 'c', operator: '>', threshold: 0 },
      0,
    );
    m = addValueNode(
      m,
      { id: 'b', label: 'b', unitId: 'free', initialNumber: 0 },
      0,
    );
    m = addEdge(m, { from: 'k', to: 'c', shape: { kind: 'none', params: {} } }, 0);
    m = addEdge(
      m,
      {
        from: 'c',
        to: 'b',
        shape: { kind: 'none', params: {} },
        sourceSlotIndex: 0, // trueSlot 만 입력
      },
      0,
    );

    let state = initializeFromInitialValues(m);
    state = propagateOneStep(state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(state.validOutputs.has(outputKey('b', 0))).toBe(true);

    const result = recomputeNode('c', state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      sourceOverride: {
        sourceNodeId: 'k',
        sourceSlotIndex: 0,
        value: numericValue(-1, 'free'),
      },
    });
    const cascaded = cascadeInvalidation('c', result, state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });

    // B 의 trueSlot 입력이 사라졌으므로 B 가 valid 를 유지할 수 없다.
    expect(cascaded.executionState.validOutputs.has(outputKey('b', 0))).toBe(false);
  });

  it('다단 cascade — A → B → C 에서 A invalid 가 C 까지 전파', () => {
    // A = Condition, B = ValueNode (A.true 입력), C = ValueNode (B 입력).
    // A.true invalid → B pending → C pending.
    let m = createEmptyModel(0);
    m = addConstantNode(
      m,
      { id: 'k', label: 'k', value: numericValue(1, 'free') },
      0,
    );
    m = addConditionNode(
      m,
      { id: 'a', label: 'a', operator: '>', threshold: 0 },
      0,
    );
    m = addValueNode(
      m,
      { id: 'b', label: 'b', unitId: 'free', initialNumber: 0 },
      0,
    );
    m = addValueNode(
      m,
      { id: 'c', label: 'c', unitId: 'free', initialNumber: 0 },
      0,
    );
    m = addEdge(m, { from: 'k', to: 'a', shape: { kind: 'none', params: {} } }, 0);
    m = addEdge(
      m,
      {
        from: 'a',
        to: 'b',
        shape: { kind: 'none', params: {} },
        sourceSlotIndex: 0,
      },
      0,
    );
    m = addEdge(m, { from: 'b', to: 'c', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);
    state = propagateOneStep(state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(state.validOutputs.has(outputKey('c', 0))).toBe(true);

    const result = recomputeNode('a', state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      sourceOverride: {
        sourceNodeId: 'k',
        sourceSlotIndex: 0,
        value: numericValue(-1, 'free'),
      },
    });
    const cascaded = cascadeInvalidation('a', result, state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });

    // B 와 C 모두 입력을 잃어 invalid 가 돼야 한다.
    expect(cascaded.executionState.validOutputs.has(outputKey('b', 0))).toBe(false);
    expect(cascaded.executionState.validOutputs.has(outputKey('c', 0))).toBe(false);
  });

  it('누적 상태 보존 — cascade 가 건드리지 않는 노드의 observeBuffers·values 그대로', () => {
    // 메인 그래프: k → c → b (cascade 대상). 별개 그래프: k2 → v2 (cascade 와 무관).
    // c 의 슬롯 flip 으로 b 가 영향 받는 동안 v2 의 값과 cumulative state 는 보존.
    let m = createEmptyModel(0);
    m = addConstantNode(
      m,
      { id: 'k', label: 'k', value: numericValue(1, 'free') },
      0,
    );
    m = addConstantNode(
      m,
      { id: 'k2', label: 'k2', value: numericValue(42, 'free') },
      0,
    );
    m = addConditionNode(
      m,
      { id: 'c', label: 'c', operator: '>', threshold: 0 },
      0,
    );
    m = addValueNode(
      m,
      { id: 'b', label: 'b', unitId: 'free', initialNumber: 0 },
      0,
    );
    m = addValueNode(
      m,
      { id: 'v2', label: 'v2', unitId: 'free', initialNumber: 0 },
      0,
    );
    m = addEdge(m, { from: 'k', to: 'c', shape: { kind: 'none', params: {} } }, 0);
    m = addEdge(
      m,
      {
        from: 'c',
        to: 'b',
        shape: { kind: 'none', params: {} },
        sourceSlotIndex: 0,
      },
      0,
    );
    m = addEdge(m, { from: 'k2', to: 'v2', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);
    state = propagateOneStep(state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    const priorV2 = state.values['v2'];
    expect(priorV2).toBeDefined();

    const result = recomputeNode('c', state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      sourceOverride: {
        sourceNodeId: 'k',
        sourceSlotIndex: 0,
        value: numericValue(-1, 'free'),
      },
    });
    const cascaded = cascadeInvalidation('c', result, state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });

    // v2 는 cascade 의 다운스트림이 아니므로 reference 그대로.
    expect(cascaded.executionState.values['v2']).toBe(priorV2);
    expect(cascaded.executionState.validOutputs.has(outputKey('v2', 0))).toBe(true);
  });

  it('topology 재사용 — 호출자가 buildTopology 결과를 전달하면 그대로 사용', () => {
    // 외부 topology 캐싱 경로의 호환성 — 본 함수가 내부에서 buildTopology 를 재호출
    // 하지 않고 전달된 topology 를 그대로 쓰는지. 잘못 무시되면 캐싱 효율이 무력화.
    let m = createEmptyModel(0);
    m = addConstantNode(
      m,
      { id: 'k', label: 'k', value: numericValue(1, 'free') },
      0,
    );
    m = addConditionNode(
      m,
      { id: 'c', label: 'c', operator: '>', threshold: 0 },
      0,
    );
    m = addEdge(m, { from: 'k', to: 'c', shape: { kind: 'none', params: {} } }, 0);

    let state = initializeFromInitialValues(m);
    state = propagateOneStep(state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });

    const topology = buildTopology(m);
    const result = recomputeNode('c', state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      topology,
      sourceOverride: {
        sourceNodeId: 'k',
        sourceSlotIndex: 0,
        value: numericValue(-1, 'free'),
      },
    });
    const cascaded = cascadeInvalidation('c', result, state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
      topology,
    });

    expect(cascaded.rootNewlyValidSlots.has(1)).toBe(true);
  });
});
