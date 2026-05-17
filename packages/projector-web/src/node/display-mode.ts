import {
  isConditionNode,
  isConstantNode,
  isGeneratorNode,
  isLogicGateNode,
  isObserveNode,
  isValueNode,
  type Node,
} from '@trama/core';
import type { NodeDisplayMode } from './box.js';

/**
 * 노드 종류별 기본 디스플레이 모드 매핑.
 *
 * 기준: 패널 안에 "읽어야 할" 정보가 본질이면 standard, 도식 자체가 식별
 * 단서면 compact. 사용자가 노드별로 ModeToggle로 오버라이드 가능.
 */
export function getDefaultDisplayMode(node: Node): NodeDisplayMode {
  switch (node.kind) {
    case 'value':
      // numeric: 현재값 + 슬라이더 본질 → standard
      // boolean: ✓/✗ 결과 아이콘만 → compact (토글 컨트롤은 패널 아래로 분리)
      return node.initialValue.kind === 'boolean' ? 'compact' : 'standard';
    case 'expression':
    case 'observe':
      return 'standard';
    case 'constant':
    case 'generator':
    case 'logic-gate':
      return 'compact';
    case 'condition':
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
    isObserveNode(node)
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
    isObserveNode(node)
  );
}
