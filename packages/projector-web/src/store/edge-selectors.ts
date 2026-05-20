import {
  defaultNodeKindRegistry,
  getExecValue,
  isOutputValid,
  type ExecutionState,
  type ExecValue,
  type Model,
  type NodeId,
} from '@trama/core';

/**
 * 엣지 시각(EdgeView) 과 펄스 발사 가드(spawnOutgoingPulses) 가 같은 invariant 를
 * 두 번 표현하던 *3 종 판정* 의 단일 진실 자리. EdgeView 의 useSyncExternalStore
 * selector 와 store 의 spawn 가드가 모두 이 모듈을 호출하면 변경 시 한 곳만 손대면
 * 되고, 두 호출자 사이 invariant 표현 drift 가 발생할 수 없다.
 *
 * selector 의 입력은 zustand state 객체가 아니라 그 안의 *최소 필드* 만 — 호출자가
 * 어떤 store 모양에서 가져와도 같은 식이 쓰이도록.
 */

/**
 * "output slot 이 valid 인가" 의 단일 표현 — core 의 [[isOutputValid]] wrapper.
 * projector layer 의 EdgeView 와 spawnOutgoingPulses 가 *같은 모듈을 거쳐* 같은
 * 식을 부르도록 강제하는 게 이 selector 의 역할. core helper 를 직접 호출해도
 * 의미는 동일하지만, 한 자리에서 호출 표면을 통제하기 위해 wrapper 를 둔다.
 */
export function selectIsSlotActive(
  executionState: ExecutionState,
  nodeId: NodeId,
  slot: number,
): boolean {
  return isOutputValid(executionState, nodeId, slot);
}

/**
 * 출력 슬롯이 디스크립터에서 `branching: true` 로 표시되었는가. Condition true/false
 * 슬롯, LogicGate 출력 등 *한 시점에 하나만 활성* 인 슬롯의 시맨틱 판정. EdgeView 의
 * 비활성 dashed 표시가 이 판정과 [[selectIsSlotActive]] 의 합성으로 결정된다.
 *
 * 정적 시점(ctx 없이) 호출되므로 ctx 는 `{ model, registry: defaultNodeKindRegistry }`
 * 만 채움.
 */
export function selectIsBranchingSlot(
  model: Model,
  nodeId: NodeId,
  slot: number,
): boolean {
  const node = model.nodes[nodeId];
  if (!node) return false;
  const desc = defaultNodeKindRegistry.forNode(node);
  if (!desc) return false;
  const slots = desc.outputSlots(node, {
    model,
    registry: defaultNodeKindRegistry,
  });
  return slots[slot]?.branching === true;
}

/**
 * source 노드의 `outputInterpolation` 이 `'continuous'` 인가. 디스크립터가 선언하는
 * paradigm 속성 — sine 같은 연속 신호 source 에서 시각·인과 양쪽 모두 분기.
 * EdgeView 는 stroke 변조 토글에, spawn 은 시각 펄스 대신 합성 즉시 펄스를 쓰는
 * 분기에 사용.
 */
export function selectIsContinuousSource(model: Model, nodeId: NodeId): boolean {
  const node = model.nodes[nodeId];
  if (!node) return false;
  const desc = defaultNodeKindRegistry.forNode(node);
  return desc?.outputInterpolation?.(node) === 'continuous';
}

/**
 * source 노드의 현재 출력값(ExecValue). `executionState.values[nodeId]` 의 단순한
 * 캡슐화 — EdgeView 의 시각 normalize 입력과 spawn 의 펄스 sourceValue 가 모두
 * 같은 식을 통해 읽는다. fallback (ValueNode 의 initialValue 등) 은 호출자별 정책
 * 이라 selector 에 포함하지 않음.
 */
export function selectSourceExecValue(
  executionState: ExecutionState,
  nodeId: NodeId,
): ExecValue | undefined {
  return getExecValue(executionState, nodeId);
}
