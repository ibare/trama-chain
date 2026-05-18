import type { Model, NodeId, Value } from '../model/index.js';
import { isGeneratorNode, isValueNode } from '../model/index.js';
import {
  defaultGeneratorRegistry,
  type GeneratorRegistry,
  type GeneratorRuntime,
} from '../generators/index.js';
import type { EvalDiagnosis } from './expression-evaluator.js';
import type { ExecValue, SequenceValue } from './exec-value.js';
import { isSequence, resolveScalar, unwrap } from './exec-value.js';
import type { ObserveBuffer } from './observe-buffer.js';
import {
  defaultNodeKindRegistry,
  type NodeKindRegistry,
  type ObserveExtractionRuntime,
} from './kinds.js';

/**
 * 실행 시점의 노드 값들. *모델과 분리* — 모델은 초기값/구조의 source of truth고,
 * 이 state는 propagation/iteration이 만들어내는 derived view.
 *
 * `values`는 노드별 단일 출력값을 담는다. 타입은 [[ExecValue]] — 원시 Value 또는
 * 메타가 부착된 WrappedValue. 한 노드가 두 슬롯을 동시에 다른 값으로 송신하지는
 * 않는다(Condition의 두 슬롯은 상호 배타). 슬롯 단위 라우팅은 `validOutputs`로,
 * 값의 부가 메타는 WrappedValue 로 분리해 표현한다.
 *
 * `validOutputs`는 "출력 슬롯 단위"로 유효성을 표현한다. 키 형식 `${nodeId}:${slot}`.
 * 단출력 노드(value·function·constant)는 슬롯 0만 사용. 다출력 노드(조건 노드는
 * 0=참, 1=거짓)는 한 시점에 정확히 한 슬롯만 valid로 표시한다.
 *
 * `invalidReasons`는 노드별 마지막 실패 사유. 평가가 성공한 step에서는 키가
 * 삭제된다. UI 가 invalid 배지/툴팁에 노출하는 용도이며 propagate 결정에는
 * 영향이 없다.
 *
 * `pendingOutputs`는 valid/invalid와 별개의 세 번째 상태 — "토폴로지는 정상,
 * 아직 첫 신호가 도착하지 않음". ValueNode가 lag=0 incoming을 받으면 stored
 * state(initialValue)의 권위가 엣지로 이양된다. 시간이 흐르지 않은 상태(멈춤,
 * 또는 play 시작 직후)에선 신호가 도착하지 않았으므로 출력은 pending. 첫
 * propagate(또는 pulse) 도착으로 valid 승격. runtime-only.
 */
export interface ExecutionState {
  values: Record<NodeId, ExecValue>;
  /**
   * Sequence 채널 출력 — 누적 추출 슬롯 등 sequence PortSpec 을 advertise 하는
   * 슬롯의 SequenceValue 스냅샷. 키는 `${nodeId}:${slot}` (outputKey 와 동일 포맷).
   * 스칼라 [[values]] 와 별도 채널로 분리해 두 출력이 서로 덮어쓰지 않게 한다.
   * runtime-only.
   */
  sequenceOutputs: Record<string, SequenceValue>;
  validOutputs: Set<string>;
  /**
   * "토폴로지 정상, 첫 신호 미도착" 상태. validOutputs와 상호 배타 — 한 슬롯이
   * 동시에 valid와 pending이 될 수 없다. 둘 다 아니면 invalid (실패).
   * runtime-only.
   */
  pendingOutputs: Set<string>;
  invalidReasons: Record<NodeId, EvalDiagnosis & { ok: false }>;
  /**
   * ObserveNode가 통과한 값을 시간순으로 누적한 sample 버퍼. capacity 정책별로
   * bounded(ring buffer) / unbounded(growable array) 두 모양. push는 O(1)
   * in-place mutate, snapshot은 [[observeBufferToArray]]가 ordered sample 배열을
   * 만들어 SequenceValue로 흘려보낸다. runtime-only — 직렬화되지 않고 세션이
   * 끝나면 사라진다.
   */
  observeBuffers: Record<NodeId, ObserveBuffer>;
  /**
   * ObserveNode 추출 슬롯의 throttle 런타임 — 마지막 emit 시각을 기억해 throttle
   * 정책의 다음 emit 여부를 결정. runtime-only.
   */
  observeExtractionRuntime: Record<NodeId, ObserveExtractionRuntime>;
  /**
   * GeneratorNode의 cursor·gate 캐시. runtime-only — 매개변수는 모델에
   * 영속되지만 cursor 진행도는 세션 한정이다. 글로벌 paused가 시간(=emit)의
   * 단일 출처라 노드별 enable 토글은 없다.
   */
  generatorRuntime: Record<NodeId, GeneratorRuntime>;
  /**
   * 현재 simulation time(ms). 매 propagate step 마다 step 간격만큼 증가한다.
   * wall clock 과 분리된 모델 시간축 — ObserveNode 의 (value, t) sample 누적,
   * throttle 비교 기준이 된다. 0 부터 시작 (reset 시 0 으로 복귀).
   *
   * step 인덱스가 아닌 ms 단위인 이유는 sub-step 지연(스크럽 spawn, 비주기 펄스)
   * 까지 표현할 수 있기 위함.
   */
  simulationTimeMs: number;
}

/** 출력 유효성 집합용 키 생성. */
export function outputKey(nodeId: NodeId, slot: number = 0): string {
  return `${nodeId}:${slot}`;
}

export function initializeFromInitialValues(
  model: Model,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  generatorRegistry: GeneratorRegistry = defaultGeneratorRegistry,
): ExecutionState {
  const values: Record<NodeId, ExecValue> = {};
  const validOutputs = new Set<string>();
  const pendingOutputs = new Set<string>();
  const generatorRuntime: Record<NodeId, GeneratorRuntime> = {};
  for (const nid of model.nodeOrder) {
    const node = model.nodes[nid];
    if (!node) continue;
    const desc = registry.forNode(node);
    if (!desc) continue;
    const v = desc.initialValue(node);
    if (v !== undefined) values[nid] = v;
    for (const slot of desc.initialValidSlots(node)) {
      validOutputs.add(outputKey(nid, slot));
    }
    // GeneratorNode는 모델 매개변수로 cursor 초기화. 글로벌 paused 만이 시간(emit)
    // 의 단일 출처라 노드별 enable 토글이 없다. ticker가 시작 직후부터 매 step
    // emit — 다만 paradigm이 t<startMs 처럼 정의되지 않은 시각이면 peek는 undefined.
    if (isGeneratorNode(node)) {
      const cursor = generatorRegistry.initCursor(node.params, 0);
      generatorRuntime[nid] = { cursor };
      // 초기 시점(t=0) peek. 시간 기반 paradigm은 아직 정의되지 않은 시각이면
      // undefined를 반환 — 그 경우 values/validOutputs를 건드리지 않아 invalid를
      // 유지한다 (펄스 첫 발화 전·스텝 t<startMs 등).
      const peeked = generatorRegistry.peek(node.params, cursor, 0);
      if (peeked !== undefined) {
        values[nid] = peeked;
        validOutputs.add(outputKey(nid, 0));
      }
    }
  }
  // ValueNode가 lag=0 incoming을 받으면 initialValue 권위는 엣지로 이양된다.
  // 신호가 아직 도착하지 않은 초기 시점이므로 pending — initialValue는 표시되지
  // 않는다. 첫 propagate/pulse 도착으로 valid 승격.
  for (const nid of model.nodeOrder) {
    const node = model.nodes[nid];
    if (!node || !isValueNode(node)) continue;
    const hasLag0Incoming = model.edgeOrder.some((eid) => {
      const e = model.edges[eid];
      return !!e && e.to === nid && e.lag === 0;
    });
    if (!hasLag0Incoming) continue;
    const slot = outputKey(nid, 0);
    validOutputs.delete(slot);
    pendingOutputs.add(slot);
    delete values[nid];
  }
  return {
    values,
    sequenceOutputs: {},
    validOutputs,
    pendingOutputs,
    invalidReasons: {},
    observeBuffers: {},
    observeExtractionRuntime: {},
    generatorRuntime,
    simulationTimeMs: 0,
  };
}

/**
 * 노드 값 조회. 미기록이면 undefined — 호출자가 직접 분기해야 한다.
 * WrappedValue 가 저장돼 있어도 자동 unwrap 해 Value 만 노출 — 메타 무관 caller가
 * 안전하게 사용. 메타를 보려면 [[getExecValue]] 로 raw ExecValue 를 받는다.
 */
export function getNodeValue(state: ExecutionState, id: NodeId): Value | undefined {
  const ev = state.values[id];
  if (ev === undefined || isSequence(ev)) return undefined;
  return unwrap(resolveScalar(ev, state.simulationTimeMs));
}

/** 노드의 numeric 값. boolean Value·sequence·미기록이면 undefined. wrapped 자동 unwrap. */
export function getNumericValue(state: ExecutionState, id: NodeId): number | undefined {
  const ev = state.values[id];
  if (!ev || isSequence(ev)) return undefined;
  const v = unwrap(resolveScalar(ev, state.simulationTimeMs));
  if (v.kind !== 'numeric') return undefined;
  return v.n;
}

/**
 * 메타 인식 caller 가 raw ExecValue (Value | WrappedValue) 를 받는다.
 * 미기록이면 undefined. WrappedValue 면 그대로 — 메타를 보고 분기할 수 있다.
 */
export function getExecValue(state: ExecutionState, id: NodeId): ExecValue | undefined {
  return state.values[id];
}

/** 슬롯 단위 유효성 조회. */
export function isOutputValid(
  state: ExecutionState,
  id: NodeId,
  slot: number = 0,
): boolean {
  return state.validOutputs.has(outputKey(id, slot));
}

/** 단출력 노드 기준 노드 유효성 (= 슬롯 0의 유효성). 호환용 헬퍼. */
export function isNodeValid(state: ExecutionState, id: NodeId): boolean {
  return isOutputValid(state, id, 0);
}

/** 슬롯 단위 pending 조회. */
export function isOutputPending(
  state: ExecutionState,
  id: NodeId,
  slot: number = 0,
): boolean {
  return state.pendingOutputs.has(outputKey(id, slot));
}
