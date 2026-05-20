import type { Model, Node } from '../../model/index.js';
import type { NodeKindRegistry } from '../kinds.js';
import {
  defaultNodeKindRegistry,
  getInputAccepts,
  getOutputSlotAt,
} from '../kinds.js';
import {
  isSequencePortSpec,
  type PortSpec,
  type ScalarPortSpec,
} from './port-spec.js';

export type EdgeCompatibility =
  | { compatible: true }
  | { compatible: false; reason: string };

/**
 * 두 PortSpec 이 호환되는지.
 *
 * - `value` 는 항상 일치해야 한다 (자동 변환 없음).
 * - target 이 `meta` 를 명시했으면 source 도 동일한 `meta` 를 가져야 한다.
 *   target 이 meta 를 명시 안 했으면 source meta 유무 무관 — caller 가 unwrap 으로
 *   알맹이만 본다.
 *
 * 이 모델은 "connected but doesn't work" 를 정적으로 차단한다 — Generator 의
 * boolean 게이트가 plain numeric 을 받아 freeze 만 되는 사례를 메뉴에서 제외시킨다.
 */
function specMatches(source: PortSpec, target: PortSpec): boolean {
  // scalar ↔ sequence 는 호환 안 됨 — 자동 변환 없음 (명시적 변환 노드 필요).
  if (isSequencePortSpec(source) !== isSequencePortSpec(target)) return false;
  if (isSequencePortSpec(source) && isSequencePortSpec(target)) {
    return source.element === target.element;
  }
  // 둘 다 scalar — 기존 의미 동일.
  const ss = source as ScalarPortSpec;
  const ts = target as ScalarPortSpec;
  if (ss.value !== ts.value) return false;
  if (ts.meta !== undefined && ss.meta !== ts.meta) return false;
  return true;
}

/**
 * source → target 엣지의 PortType 호환성을 본다.
 *
 * 검사 항목:
 *  1. target 이 입력을 받지 않는 종류면 거부 (Constant 등)
 *  2. source 출력 슬롯의 PortSpec 이 target inputAccepts 의 어떤 spec 과도
 *     매칭되지 않으면 거부
 *
 * 자동 변환은 없다 — numeric을 boolean으로(또는 그 반대) 흘리려면
 * 명시적 변환 노드를 끼워야 한다.
 *
 * `sourceSlotIndex` 미지정 시 슬롯 0 으로 간주. ConditionNode 의 true/false
 * 슬롯이 동일 spec 이면 어느 쪽으로 연결하든 통과.
 */
export function checkEdgeCompatibility(
  source: Node,
  target: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
  sourceSlotIndex: number = 0,
): EdgeCompatibility {
  // target 입력 PortType 이 비결정적인 passthrough(ObserveNode 미연결 상태 등)면
  // 어떤 source 든 받아준다 — acceptsAnyInput=true 케이스. 첫 연결을 자유롭게 허용해
  // 이후 PortType 이 그 source 로 잠긴다.
  const targetDesc = registry.forNode(target);
  if (
    targetDesc?.acceptsAnyInput &&
    targetDesc.acceptsAnyInput(target, model ? { model, registry } : undefined)
  ) {
    return { compatible: true };
  }
  const targetAccepts = getInputAccepts(target, registry, model);
  if (targetAccepts === null) {
    return {
      compatible: false,
      reason: `target node "${target.kind}" does not accept inputs`,
    };
  }
  const sourceSlot = getOutputSlotAt(source, sourceSlotIndex, registry, model);
  if (!sourceSlot) {
    return {
      compatible: false,
      reason: `source node "${source.kind}" has no output slot ${sourceSlotIndex}`,
    };
  }
  for (const accept of targetAccepts) {
    if (specMatches(sourceSlot, accept)) return { compatible: true };
  }
  const wanted = targetAccepts.map(describePortSpec).join('|');
  return {
    compatible: false,
    reason: `port type mismatch: source outputs "${describePortSpec(sourceSlot)}", target expects "${wanted}"`,
  };
}

/** PortSpec → 사람이 읽을 수 있는 라우팅 라벨. scalar/sequence 양쪽을 한 형식으로. */
function describePortSpec(spec: PortSpec): string {
  if (isSequencePortSpec(spec)) return `sequence<${spec.element}>`;
  return spec.value;
}
