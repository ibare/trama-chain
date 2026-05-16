import {
  isConstantNode,
  isGeneratorNode,
  isLogicGateNode,
  isValueNode,
  type Node,
} from '@trama/core';
import type { NodeDisplayMode } from './box.js';

/**
 * 노드 종류별 기본 디스플레이 모드 매핑.
 *
 * 기준: 패널 안에 "읽어야 할" 정보가 본질이면 standard, 도식 자체가 식별
 * 단서면 compact. 사용자 인스턴스 오버라이드(노드별 모드 변경 UI)는 후속
 * 작업에서 추가될 예정 — 현재는 이 함수가 단일 출처.
 *
 * `condition` / `comparison`은 별도 layout(`condition-box.ts`) 경유라 본 함수의
 * 반환값이 실제 box.ts 분기에 영향을 주지 않는다. 일관성을 위해 값은 반환하되
 * displayMode는 무시된다 — condition/comparison이 box.ts 분기를 타게 되면
 * 이 매핑이 비로소 의미를 갖는다.
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
    case 'comparison':
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
 * displayMode 필드를 가진 kind(value/constant/generator/logic-gate)는
 * 노드별로 mode를 영속화할 수 있다. 값이 비어 있으면 kind 기본을 따른다.
 * 그 외 kind는 오버라이드 의미가 없으므로 항상 기본을 반환한다.
 */
export function resolveDisplayMode(node: Node): NodeDisplayMode {
  if (
    isValueNode(node) ||
    isConstantNode(node) ||
    isGeneratorNode(node) ||
    isLogicGateNode(node)
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
    return node.initialValue.kind === 'boolean';
  }
  return isConstantNode(node) || isGeneratorNode(node) || isLogicGateNode(node);
}
