import type { Model, Node, ValueKind } from '../../model/index.js';
import type { ResolvedUnit, UnitCatalog } from '../../units/index.js';
import { FREE_FALLBACK } from './context.js';
import {
  isSequencePortSpec,
  type OutputSlotSpec,
  type PortSpec,
} from './port-spec.js';
import type { NodeKindRegistry } from './registry.js';
// cyclic value import — `defaultNodeKindRegistry` 는 디스크립터 9 개를 register
// 한 후 kinds.ts 가 평가 끝낼 때 완성. queries 함수의 default 인자 평가는
// 호출 시점(=모듈 평가 후) 이므로 live binding 으로 안전하게 해소.
import { defaultNodeKindRegistry } from './index.js';

/**
 * 디스크립터를 통해 출력 단위를 얻는다. 등록되지 않은 종류면 FREE_FALLBACK.
 * propagate.ts와 외부(UI)에서 안전하게 쓰기 위한 헬퍼.
 */
export function getNodeOutputUnit(
  node: Node,
  catalog: UnitCatalog,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
): ResolvedUnit {
  const desc = registry.forNode(node);
  if (!desc) return FREE_FALLBACK;
  return desc.outputUnit(node, catalog);
}

/** 노드의 raw passthrough 여부. 미등록 종류는 false. */
export function isRawOutputNode(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
): boolean {
  return registry.forNode(node)?.outputsRaw ?? false;
}

/** 노드가 피드백 target이 될 수 있는지. 미등록 종류는 false. */
export function canBeFeedbackTarget(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
): boolean {
  return registry.forNode(node)?.canBeFeedbackTarget ?? false;
}

/**
 * 노드의 출력 슬롯 명세 전체. 미등록 종류는 보수적인 단일 numeric 슬롯으로 폴백.
 *
 * `model` 을 주면 passthrough 노드가 source spec 을 미러링한다.
 */
export function getOutputSlots(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): readonly OutputSlotSpec[] {
  const desc = registry.forNode(node);
  if (!desc) return [{ index: 0, value: 'numeric' }];
  return desc.outputSlots(node, model ? { model, registry } : undefined);
}

/**
 * 특정 슬롯 인덱스의 출력 PortSpec. 슬롯이 없으면 undefined.
 */
export function getOutputSlotAt(
  node: Node,
  slot: number,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): OutputSlotSpec | undefined {
  return getOutputSlots(node, registry, model)[slot];
}

/**
 * 노드의 입력 acceptsList. null 이면 입력을 받지 않는다.
 */
export function getInputAccepts(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): readonly PortSpec[] | null {
  const desc = registry.forNode(node);
  if (!desc) return null;
  return desc.inputAccepts(node, model ? { model, registry } : undefined);
}

/**
 * 노드의 scalar 입력 PortType (slot 0, value 만). null 이면 입력 없음 또는 sequence-only.
 * 미등록 종류는 null 로 안전 폴백.
 *
 * 슬롯·메타·sequence 인지 호출자는 [[getInputAccepts]] 를 직접 사용.
 */
export function getInputPortType(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): ValueKind | null {
  const accepts = getInputAccepts(node, registry, model);
  if (accepts === null) return null;
  const first = accepts[0];
  if (!first) return null;
  if (isSequencePortSpec(first)) return null;
  return first.value;
}

/**
 * 노드의 scalar 출력 PortType (slot 0, value 만). 미등록·sequence 슬롯은 'numeric' 폴백.
 *
 * 슬롯별 / sequence 인지 PortType 이 필요하면 [[getOutputSlotAt]] 사용.
 */
export function getOutputPortType(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): ValueKind {
  const first = getOutputSlots(node, registry, model)[0];
  if (!first) return 'numeric';
  if (isSequencePortSpec(first)) return 'numeric';
  return first.value;
}
