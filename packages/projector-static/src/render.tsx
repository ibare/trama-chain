import { createElement } from 'react';
import type {
  StaticNodeRendererMap,
  StaticNodeRendererProps,
} from './registry.js';

export type { StaticNodeRendererMap, StaticNodeRendererProps };

/**
 * 정적 디스패처 — node.kind 를 직접 사용해 Record<NodeKind, Component> 에서 1단계
 * 라우팅. Record 의 9 키 형(NodeKind sum type) 이 TypeScript 에서 exhaustive 강제
 * 책임을 가지므로 default 분기는 불필요 — 컴파일 시점에 누락이 잡힌다.
 */
export function renderStaticNode(args: {
  key: string;
  renderers: StaticNodeRendererMap;
  node: StaticNodeRendererProps['node'];
  layout: StaticNodeRendererProps['layout'];
  snapshot: StaticNodeRendererProps['snapshot'];
  slotIndex: StaticNodeRendererProps['slotIndex'];
  model: StaticNodeRendererProps['model'];
  registries: StaticNodeRendererProps['registries'];
}): JSX.Element {
  const Component = args.renderers[args.node.kind];
  return createElement(Component, {
    key: args.key,
    node: args.node,
    layout: args.layout,
    snapshot: args.snapshot,
    slotIndex: args.slotIndex,
    model: args.model,
    registries: args.registries,
  });
}
