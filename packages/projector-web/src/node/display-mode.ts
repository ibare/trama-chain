import type { Node } from '@trama/core';
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
