import { describe, expect, it } from 'vitest';
import {
  addConditionNode,
  addEdge,
  addGeneratorNode,
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
  getExecValue,
  getNumericValue,
  initializeFromInitialValues,
  isFunctionHandle,
  isOutputValid,
  isWrapped,
  outputKey,
  propagateOneStep,
  recomputeNode,
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
    initialNumber: v,
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
    expect(getNumericValue(s, 'c')).toBe(7);
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

  it('엣지의 slotIndex가 undefined여도 단일 게이트라 0으로 간주 (회귀 방지)', () => {
    // 사용자 스크린샷 재현: 41.8 kg != 0 — 어떤 경로(라운드트립·구버전 데이터)로
    // slotIndex가 빠진 엣지가 들어와도 조건이 정상 동작해야 한다.
    let m = createEmptyModel();
    m = addValueNode(m, {
      id: 'v',
      label: '무게',
      unitId: 'kg',
      initialNumber: 41.8,
    });
    m = addConditionNode(m, { id: 'c', label: '조건', operator: '!=', threshold: 0 });
    m = addEdge(m, {
      from: 'v',
      to: 'c',
      shape: { kind: 'none', params: {} },
      // slotIndex 의도적으로 누락
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(isOutputValid(s, 'c', 0)).toBe(true);
    expect(getNumericValue(s, 'c')).toBe(41.8);
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
      initialNumber: 0,
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
    expect(getNumericValue(s, 'out')).toBe(7);

    let m2 = setup(2, 5, '>'); // 차단
    m2 = addValueNode(m2, {
      id: 'out',
      label: '출력',
      unitId: 'raw',
      initialNumber: 0,
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
    // out 은 lag=0 incoming 을 가진 ValueNode — 신규 의미 모델에서는 첫 신호가
    // 도착하기 전까지 pending. 차단된 condition 으로 펄스가 흐르지 않았으므로
    // 출력은 invalid, 값은 undefined.
    expect(isOutputValid(s2, 'out', 0)).toBe(false);
    expect(getNumericValue(s2, 'out')).toBeUndefined();
  });

  it('차단되면 다운스트림 ValueNode도 invalid (invalid 전파)', () => {
    // condition 차단 시, condition→out 엣지 하나뿐인 ValueNode는 출력이 invalid가
    // 되어 더 깊은 다운스트림이 stale 값을 받지 않는다.
    let m = setup(2, 5, '>'); // 차단
    m = addValueNode(m, {
      id: 'out',
      label: '출력',
      unitId: 'raw',
      initialNumber: 0,
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
    expect(isOutputValid(s, 'c', 0)).toBe(false);
    expect(isOutputValid(s, 'out', 0)).toBe(false);
  });

  it('입력이 모두 invalid이고 valid가 하나라도 있으면 invalid한 source는 무시 (부분 차단)', () => {
    // 두 입력 중 하나만 condition으로 게이팅. 게이트가 닫히면 그 contribution은
    // 빠지지만 다른 valid 입력으로 값이 계산되고 valid 유지.
    let m = createEmptyModel();
    m = addValueNode(m, {
      id: 'v1',
      label: 'V1',
      unitId: 'raw',
      initialNumber: 5,
    });
    m = addValueNode(m, {
      id: 'v2',
      label: 'V2',
      unitId: 'raw',
      initialNumber: 3,
    });
    m = addConditionNode(m, { id: 'c', label: '조건', operator: '>', threshold: 100 });
    m = addEdge(m, {
      from: 'v1',
      to: 'c',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      slotIndex: 0,
    });
    m = addValueNode(m, {
      id: 'sum',
      label: '합',
      unitId: 'raw',
      initialNumber: 0,
    });
    m = addEdge(m, {
      from: 'c',
      to: 'sum',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    });
    m = addEdge(m, {
      from: 'v2',
      to: 'sum',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    });
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    // c는 차단, v2만 유효 → sum은 valid 유지 (v2 기여만 반영).
    expect(isOutputValid(s, 'c', 0)).toBe(false);
    expect(isOutputValid(s, 'sum', 0)).toBe(true);
  });

  it('outputKey 키 포맷', () => {
    expect(outputKey('c', 0)).toBe('c:0');
    expect(outputKey('c')).toBe('c:0');
  });

  it('두 슬롯 시맨틱 — 조건 참: slot 0(true) valid / slot 1(false) invalid', () => {
    const m = setup(7, 3, '>');
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(isOutputValid(s, 'c', 0)).toBe(true);
    expect(isOutputValid(s, 'c', 1)).toBe(false);
  });

  it('두 슬롯 시맨틱 — 조건 거짓: slot 0(true) invalid / slot 1(false) valid', () => {
    const m = setup(2, 5, '>');
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(isOutputValid(s, 'c', 0)).toBe(false);
    expect(isOutputValid(s, 'c', 1)).toBe(true);
  });

  it('WrappedValue meta=true 부착 — 조건 참', () => {
    const m = setup(7, 3, '>');
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    const ev = getExecValue(s, 'c');
    expect(ev).toBeDefined();
    expect(ev && isWrapped(ev)).toBe(true);
    if (ev && isWrapped(ev)) {
      expect(ev.value.kind).toBe('numeric');
      if (ev.value.kind === 'numeric') expect(ev.value.n).toBe(7);
      expect(ev.meta).toEqual({ kind: 'boolean', b: true });
    }
  });

  it('WrappedValue meta=false 부착 — 조건 거짓 (false 슬롯으로 흘리는 경우에도 메타 일관)', () => {
    const m = setup(2, 5, '>');
    const s = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    const ev = getExecValue(s, 'c');
    expect(ev).toBeDefined();
    expect(ev && isWrapped(ev)).toBe(true);
    if (ev && isWrapped(ev)) {
      expect(ev.meta).toEqual({ kind: 'boolean', b: false });
    }
  });

  it('recomputeNode — ConditionNode 출력의 WrappedValue 메타가 보존된다', () => {
    // 펄스 도착 경로(model-store handlePulseArrival 일반 경로)는 recomputeNode 의
    // result.newValue 를 그대로 store.values 에 저장하고, 그것이 다시
    // 다운스트림 펄스의 sourceValue 로 운반된다. 만약 여기서 wrapped 가 unwrap
    // 되면 GeneratorNode 의 asBooleanGate 가 게이트 boolean 을 읽지 못해
    // gateOpen 이 사라지고 ticker 가 영구 freeze 되는 회귀가 생긴다.
    const m = setup(7, 3, '>');
    const state = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    const result = recomputeNode('c', state, m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    expect(result.isValid).toBe(true);
    expect(result.newValue).toBeDefined();
    expect(result.newValue && isWrapped(result.newValue)).toBe(true);
    if (result.newValue && isWrapped(result.newValue)) {
      expect(result.newValue.meta).toEqual({ kind: 'boolean', b: true });
    }
  });

  it('Sine source → Condition: wrap.value 자리에 FunctionHandle 이 보존된다 (passthrough echo)', () => {
    // 회귀 — Condition 이 wrap(rawValue, cond) 로 평탄 Value 만 envelope 의 alue 자리에
    // 담으면 다운스트림 시각이 sin paradigm 의 시간 의존 closure 를 잃는다.
    // sourceEv 본질을 보존하면서 cond 메타만 갱신하는 echo 시맨틱 검증.
    let m = createEmptyModel();
    m = addGeneratorNode(m, {
      id: 'g-sine',
      label: 'sine',
      params: { kind: 'sine', amplitude: 1, period: 1000, phase: 0, offset: 0 },
    });
    m = addConditionNode(m, { id: 'c', label: '>0', operator: '>', threshold: 0 });
    m = addEdge(m, {
      from: 'g-sine',
      to: 'c',
      shape: { kind: 'none', params: {} },
      slotIndex: 0,
    });

    const state = propagateOneStep(initializeFromInitialValues(m), m, {
      shapeRegistry: shapes,
      combinerRegistry: combiners,
    });
    const ev = getExecValue(state, 'c');
    expect(ev).toBeDefined();
    expect(ev && isWrapped(ev)).toBe(true);
    if (ev && isWrapped(ev)) {
      expect(isFunctionHandle(ev.value)).toBe(true);
      expect(ev.meta.kind).toBe('boolean');
    }
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
