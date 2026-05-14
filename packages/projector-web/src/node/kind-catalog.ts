import type { FC } from 'react';
import type { Node, NodeId } from '@trama/core';
import type { TramaInstance } from '../store/trama-instance.js';

/**
 * 컨텍스트 메뉴에 노출될 단일 항목.
 * - `symbol`: 좌측에 짧게 표시되는 심볼 (예: "+", "×", "π").
 * - `label`: 사용자에게 보이는 한국어 라벨.
 * - `onSelect(canvasPos)`: 클릭 시 노드 생성 액션. 호출 측에서 캔버스 좌표를 넘긴다.
 */
export interface NodeMenuItem {
  key: string;
  label: string;
  symbol?: string;
  onSelect: (canvasPos: { x: number; y: number }) => void;
}

export interface NodeViewProps {
  id: NodeId;
  incomingCount: number;
}

/**
 * 노드 종류별 UI 메타. 새 종류 추가 시 디스크립터를 작성하고
 * `nodeKindCatalog`에 등록만 하면 dispatcher·메뉴·기타 일반 코드가 자동 인지한다.
 */
export interface NodeKindUIDescriptor {
  kind: Node['kind'];
  /** 컨텍스트 메뉴 섹션 라벨. */
  menuSectionLabel: string;
  /** 섹션 표시 순서 (오름차순). */
  menuSectionOrder: number;
  /** 메뉴 아이템들. 함수처럼 동적 목록이면 매번 갱신해 반환. */
  buildMenuItems(instance: TramaInstance): NodeMenuItem[];
  /** 캔버스 노드 컴포넌트. dispatcher가 kind 매칭으로 이 컴포넌트를 렌더한다. */
  View: FC<NodeViewProps>;
}

const registry = new Map<Node['kind'], NodeKindUIDescriptor>();

export function registerNodeKindUI(desc: NodeKindUIDescriptor): void {
  registry.set(desc.kind, desc);
}

export function getNodeKindUI(kind: Node['kind']): NodeKindUIDescriptor | undefined {
  return registry.get(kind);
}

export function listNodeKindUIs(): NodeKindUIDescriptor[] {
  return Array.from(registry.values()).sort(
    (a, b) => a.menuSectionOrder - b.menuSectionOrder,
  );
}
