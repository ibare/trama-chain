import {
  isAverageNode,
  isConditionNode,
  isConstantNode,
  isGeneratorNode,
  isLogicGateNode,
  isObserveNode,
  isStockNode,
  isValueNode,
  type Node,
} from '@trama-chain/core';
import type { NodeDisplayMode } from '@trama-chain/layout';

/**
 * 노드 종류별 기본 디스플레이 모드 매핑.
 *
 * 토글 지원 kind는 모두 compact로 시작 — 사용자가 ModeToggle로 standard 확대.
 * 토글 미지원(expression)만 standard 고정.
 */
export function getDefaultDisplayMode(node: Node): NodeDisplayMode {
  switch (node.kind) {
    case 'value':
    case 'observe':
    case 'constant':
    case 'generator':
    case 'logic-gate':
    case 'condition':
    case 'average':
    case 'stock':
      return 'compact';
    case 'expression':
      return 'standard';
    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}

/**
 * 인스턴스 오버라이드를 적용한 최종 디스플레이 모드.
 *
 * displayMode 필드를 가진 kind(value/constant/condition/generator/logic-gate/
 * observe)는 노드별로 mode를 영속화할 수 있다. 값이 비어 있으면 kind 기본을
 * 따른다. 그 외 kind는 오버라이드 의미가 없으므로 항상 기본을 반환한다.
 */
export function resolveDisplayMode(node: Node): NodeDisplayMode {
  if (
    isValueNode(node) ||
    isConstantNode(node) ||
    isConditionNode(node) ||
    isGeneratorNode(node) ||
    isLogicGateNode(node) ||
    isObserveNode(node) ||
    isAverageNode(node) ||
    isStockNode(node)
  ) {
    if (node.displayMode) return node.displayMode;
  }
  return getDefaultDisplayMode(node);
}

/**
 * 노드 kind가 compact/standard 토글 UI 노출 대상인지.
 * compact spec이 정의된 kind에 한해 토글이 의미를 갖는다.
 */
export function supportsDisplayModeToggle(node: Node): boolean {
  if (isValueNode(node)) {
    // 스킨이 적용된 ValueNode는 본문이 스킨으로 통째 대체되므로 compact 의미가
    // 없다 — 토글 노출 대상에서 제외.
    if (node.skin) return false;
    return (
      node.initialValue.kind === 'boolean' || node.initialValue.kind === 'numeric'
    );
  }
  return (
    isConstantNode(node) ||
    isConditionNode(node) ||
    isGeneratorNode(node) ||
    isLogicGateNode(node) ||
    isObserveNode(node) ||
    isAverageNode(node) ||
    isStockNode(node)
  );
}
