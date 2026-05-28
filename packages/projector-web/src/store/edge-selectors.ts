import {
  defaultNodeKindRegistry,
  getExecValue,
  getOutputSlots,
  isOutputValid,
  isSequencePortSpec,
  type ExecutionState,
  type ExecValue,
  type Model,
  type NodeId,
} from '@trama-chain/core';

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
 * 케이블의 시각 medium — 한 자리에서 결정되는 2-enum.
 *
 * - `'particle'`: 시각 입자가 케이블 위를 흐른다. 이산 이벤트(펄스·throttle 발사·
 *   누적 추출 스냅샷) 의 자연스러운 표현.
 * - `'undulation'`: 케이블 자체가 진동한다. 매 tick 신호값이 변하는 connecting
 *   continuous 흐름 — sine paradigm 처럼 시간 의존 closure 가 통과하는 자리.
 *
 * 시각 분기는 두 갈래밖에 없지만, 의사결정 입력은 두 종류 — 슬롯의 PortSpec
 * (sequence 여부) 과 source 디스크립터의 outputInterpolation (continuous 여부) —
 * 가 같이 본다.
 */
export type CableMedium = 'particle' | 'undulation';

/**
 * source slot 의 cable medium 을 결정.
 *
 * 우선순위:
 *  1. source 출력 slot 이 SequencePortSpec → `'particle'`.
 *     누적 추출처럼 throttle / step 단위 sample 발사를 시각 입자로 표현해야
 *     사용자가 "스냅샷이 흘렀다" 는 인과를 본다. source 가 continuous paradigm
 *     이어도 sequence 채널은 이산 이벤트라는 시맨틱이 우선.
 *  2. source 디스크립터 `outputInterpolation === 'continuous'` → `'undulation'`.
 *     sine 처럼 매 tick 변하는 신호. Observe·Condition 같은 passthrough 노드는
 *     디스크립터에서 source 의 outputInterpolation 을 mirror 하므로 체인 전체가
 *     일관된 undulation 을 유지한다.
 *  3. 그 외 → `'particle'`. 안전한 기본 — 펄스 시각이 가장 보편.
 *
 * EdgeView 는 medium 으로 stroke 변조 토글을, spawn 은 시각 펄스 대신 합성 즉시
 * 펄스를 쓰는 분기에 사용. 같은 medium 판정이 두 호출자 사이 drift 없이 흐른다.
 */
export function selectCableMedium(
  model: Model,
  sourceNodeId: NodeId,
  sourceSlotIndex: number,
): CableMedium {
  const node = model.nodes[sourceNodeId];
  if (!node) return 'particle';
  const desc = defaultNodeKindRegistry.forNode(node);
  if (!desc) return 'particle';
  const slots = getOutputSlots(node, defaultNodeKindRegistry, model);
  const slot = slots[sourceSlotIndex] ?? slots[0];
  if (slot && isSequencePortSpec(slot)) return 'particle';
  const interp = desc.outputInterpolation?.(node, {
    model,
    registry: defaultNodeKindRegistry,
  });
  return interp === 'continuous' ? 'undulation' : 'particle';
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
