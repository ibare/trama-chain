import type { FC } from 'react';
import type { Node, NodeId } from '@trama-chain/core';
import type { TramaInstance } from '../store/trama-instance.js';
import type { PhosphorGlyphName } from '../icon/phosphor.js';

/**
 * NodePicker 타일 아이콘. 두 결을 분리한 union:
 *   - `phosphor`: 노드 종류·생성기·관찰·집계·상태처럼 도메인 추상이 강한 항목.
 *     화이트리스트(`PhosphorGlyphName`)에 등록된 글리프만.
 *   - `latex`: 수학 상수·산술 연산자·논리 게이트·평균(x̄)처럼 표준 기호가 학습된 항목.
 *     fizzex DOMRendererView 로 렌더해 노드 본문 식과 동일한 폰트·자리수 규칙 유지.
 */
export type NodeMenuIcon =
  | { kind: 'phosphor'; name: PhosphorGlyphName }
  | { kind: 'latex'; latex: string };

/**
 * NodePicker에 노출될 단일 항목.
 * - `icon`: 타일 좌측에 표시되는 아이콘 (phosphor 글리프 또는 fizzex latex).
 * - `label`: 사용자에게 보이는 한국어 라벨.
 * - `description`: 우측 프리뷰에 표시할 설명 (선택). 향후 풍부한 설명으로 확장.
 * - `createNode(canvasPos)`: 사용자가 "추가"로 확정한 순간 호출. 생성된 노드의 id를 반환해야 한다 —
 *   엣지-분할 같은 후속 작업이 새 노드 id를 받아 단일 트랜잭션처럼 마무리할 수 있도록.
 *   재생 중에는 모델 편집이 잠겨 `null`을 반환할 수 있다(UI가 진입 차단 못 한 우회 경로).
 */
export interface NodeMenuItem {
  key: string;
  label: string;
  icon: NodeMenuIcon;
  description?: string;
  createNode: (canvasPos: { x: number; y: number }) => NodeId | null;
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
