import type { StaticNodeRendererMap } from './registry.js';
import { StaticValueNode } from './nodes/StaticValueNode.js';
import { StaticConstantNode } from './nodes/StaticConstantNode.js';
import { StaticUnimplementedNode } from './nodes/StaticUnimplementedNode.js';

/**
 * P4-a 기본 분기 — value/constant 만 정식 컴포넌트, 나머지 7 종은 자리표.
 * P4-b, P4-c 에서 condition/expression/logic-gate/observe/generator/average/stock
 * 각각의 정식 컴포넌트로 교체한다. Record<NodeKind, ...> 형은 새 NodeKind 가 sum
 * type 에 추가되면 type-error 로 누락을 잡는다.
 */
export const defaultStaticRenderers: StaticNodeRendererMap = {
  value: StaticValueNode,
  constant: StaticConstantNode,
  condition: StaticUnimplementedNode,
  expression: StaticUnimplementedNode,
  'logic-gate': StaticUnimplementedNode,
  observe: StaticUnimplementedNode,
  generator: StaticUnimplementedNode,
  average: StaticUnimplementedNode,
  stock: StaticUnimplementedNode,
};
