import type { Model, NodeId, Value } from '../model/index.js';
import { isGeneratorNode } from '../model/index.js';
import {
  defaultGeneratorRegistry,
  type GeneratorRegistry,
  type GeneratorRuntime,
} from '../generators/index.js';
import type { EvalDiagnosis } from './expression-evaluator.js';
import type { ExecValue } from './exec-value.js';
import { unwrap } from './exec-value.js';
import { defaultNodeKindRegistry, type NodeKindRegistry } from './kinds.js';

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
 */
export interface ExecutionState {
  values: Record<NodeId, ExecValue>;
  validOutputs: Set<string>;
  invalidReasons: Record<NodeId, EvalDiagnosis & { ok: false }>;
  /**
   * ObserveNode가 통과한 값을 시간순으로 누적한 버퍼. runtime-only — 직렬화되지
   * 않고 세션이 끝나면 사라진다. capacity 정책(bounded/unbounded)은 propagate
   * 시점에 적용되어 이 버퍼에 들어오는 시점부터 잘려있다.
   */
  observeBuffers: Record<NodeId, Value[]>;
  /**
   * GeneratorNode의 enabled 플래그와 cursor. runtime-only — 매개변수는 모델에
   * 영속되지만 시작/정지 상태와 cursor 진행도는 세션 한정이다.
   */
  generatorRuntime: Record<NodeId, GeneratorRuntime>;
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
    // GeneratorNode는 모델 매개변수로 cursor 초기화, enabled=false로 시작.
    // 사용자가 ▶을 눌러야 emit이 시작된다. 다만 idle 상태에서도 "다음 emit하면
    // 나올 값"을 peek로 미리 노출해 다운스트림 케이블이 떨어지지 않도록 한다.
    if (isGeneratorNode(node)) {
      const cursor = generatorRegistry.initCursor(node.params);
      generatorRuntime[nid] = { enabled: false, cursor };
      values[nid] = generatorRegistry.peek(node.params, cursor);
      validOutputs.add(outputKey(nid, 0));
    }
  }
  return {
    values,
    validOutputs,
    invalidReasons: {},
    observeBuffers: {},
    generatorRuntime,
  };
}

/**
 * 노드 값 조회. 미기록이면 undefined — 호출자가 직접 분기해야 한다.
 * WrappedValue 가 저장돼 있어도 자동 unwrap 해 Value 만 노출 — 메타 무관 caller가
 * 안전하게 사용. 메타를 보려면 [[getExecValue]] 로 raw ExecValue 를 받는다.
 */
export function getNodeValue(state: ExecutionState, id: NodeId): Value | undefined {
  const ev = state.values[id];
  return ev === undefined ? undefined : unwrap(ev);
}

/** 노드의 numeric 값. boolean Value거나 미기록이면 undefined. wrapped 자동 unwrap. */
export function getNumericValue(state: ExecutionState, id: NodeId): number | undefined {
  const ev = state.values[id];
  if (!ev) return undefined;
  const v = unwrap(ev);
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
