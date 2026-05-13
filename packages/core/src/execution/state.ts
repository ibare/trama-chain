import type { Model, NodeId } from '../model/index.js';
import type { EvalDiagnosis } from './expression-evaluator.js';
import { defaultNodeKindRegistry, type NodeKindRegistry } from './kinds.js';

/**
 * 실행 시점의 노드 값들. *모델과 분리* — 모델은 초기값/구조의 source of truth고,
 * 이 state는 propagation/iteration이 만들어내는 derived view.
 *
 * `validOutputs`는 "출력 슬롯 단위"로 유효성을 표현한다. 키 형식 `${nodeId}:${slot}`.
 * 단출력 노드(value·function·constant)는 슬롯 0만 사용. 다출력 노드(조건 노드는
 * 0=참, 1=거짓)는 한 시점에 일부 슬롯만 valid로 표시한다.
 *
 * `invalidReasons`는 노드별 마지막 실패 사유. 평가가 성공한 step에서는 키가
 * 삭제된다. UI 가 invalid 배지/툴팁에 노출하는 용도이며 propagate 결정에는
 * 영향이 없다.
 */
export interface ExecutionState {
  values: Record<NodeId, number>;
  validOutputs: Set<string>;
  invalidReasons: Record<NodeId, EvalDiagnosis & { ok: false }>;
}

/** 출력 유효성 집합용 키 생성. */
export function outputKey(nodeId: NodeId, slot: number = 0): string {
  return `${nodeId}:${slot}`;
}

export function initializeFromInitialValues(
  model: Model,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
): ExecutionState {
  const values: Record<NodeId, number> = {};
  const validOutputs = new Set<string>();
  for (const nid of model.nodeOrder) {
    const node = model.nodes[nid];
    if (!node) continue;
    const desc = registry.forNode(node);
    if (!desc) continue;
    const v = desc.initialValue(node);
    if (typeof v === 'number') values[nid] = v;
    if (desc.initialValid(node)) validOutputs.add(outputKey(nid, 0));
  }
  return { values, validOutputs, invalidReasons: {} };
}

export function getNodeValue(state: ExecutionState, id: NodeId): number {
  return state.values[id] ?? 0;
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
