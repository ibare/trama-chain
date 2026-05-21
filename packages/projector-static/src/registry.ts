import type { ComponentType } from 'react';
import type {
  CombinerRegistry,
  Model,
  Node,
  NodeSnapshot,
  ShapeRegistry,
} from '@trama/core';
import type { NodeLayout } from '@trama/layout';
import type { SlotIndex } from './snapshot.js';

/**
 * 정적 노드 렌더러의 공통 props — 시뮬레이션 콜백 없음. 모든 데이터는 NodeSnapshot 에서
 * 끄집어내며, layout 은 @trama/layout 의 getNodeLayout 결과를 사용.
 */
export interface StaticNodeRendererProps {
  node: Node;
  layout: NodeLayout;
  snapshot: NodeSnapshot;
  slotIndex: SlotIndex;
  model: Model;
  registries: {
    shapes: ShapeRegistry;
    combiners: CombinerRegistry;
  };
}

export type StaticNodeRenderer = ComponentType<StaticNodeRendererProps>;

/**
 * 정적 디스패처 — kind 별 컴포넌트 매핑. P4-a 에서는 value/constant 만 채워지고
 * 나머지 7 종은 fallback 으로 그려지지만, sum type exhaustive 강제를 위해
 * Record<NodeKind, ...> 형태로 9 키 전부를 명시한다. 새 NodeKind 가 추가되면
 * 이 자리에 type-error 가 나도록 — 분기 의무가 시스템 라우팅에 명시되도록.
 */
export type NodeKind = Node['kind'];

export type StaticNodeRendererMap = Record<NodeKind, StaticNodeRenderer>;
