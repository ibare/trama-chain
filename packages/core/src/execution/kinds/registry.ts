import type { Node } from '../../model/index.js';
import type { NodeKindDescriptor } from './descriptor.js';

/**
 * NodeKind → Descriptor 매핑. 한 NodeKind 당 단일 디스크립터.
 *
 * 외부에서는 [[NodeKindRegistry]] 별칭으로만 접근. impl class 자체는 비공개.
 */
export class NodeKindRegistryImpl {
  private readonly map = new Map<string, NodeKindDescriptor<Node>>();

  register<N extends Node>(desc: NodeKindDescriptor<N>): this {
    this.map.set(desc.kind, desc as unknown as NodeKindDescriptor<Node>);
    return this;
  }

  get(kind: Node['kind']): NodeKindDescriptor<Node> | undefined {
    return this.map.get(kind);
  }

  forNode(node: Node): NodeKindDescriptor<Node> | undefined {
    return this.map.get(node.kind);
  }

  kinds(): string[] {
    return Array.from(this.map.keys());
  }
}

export type NodeKindRegistry = NodeKindRegistryImpl;

export function createNodeKindRegistry(): NodeKindRegistry {
  return new NodeKindRegistryImpl();
}
