import type { StaticNodeRendererMap } from './registry.js';
import { StaticValueNode } from './nodes/StaticValueNode.js';
import { StaticConstantNode } from './nodes/StaticConstantNode.js';
import { StaticConditionNode } from './nodes/StaticConditionNode.js';
import { StaticExpressionNode } from './nodes/StaticExpressionNode.js';
import { StaticLogicGateNode } from './nodes/StaticLogicGateNode.js';
import { StaticUnimplementedNode } from './nodes/StaticUnimplementedNode.js';

/**
 * P4-a/b 기본 분기 — value/constant/condition/expression/logic-gate 정식 컴포넌트,
 * 나머지 4 종(observe/generator/average/stock) 은 P4-c 가 채울 자리표. Record<NodeKind, ...>
 * 형은 새 NodeKind 가 sum type 에 추가되면 type-error 로 누락을 잡는다.
 */
export const defaultStaticRenderers: StaticNodeRendererMap = {
  value: StaticValueNode,
  constant: StaticConstantNode,
  condition: StaticConditionNode,
  expression: StaticExpressionNode,
  'logic-gate': StaticLogicGateNode,
  observe: StaticUnimplementedNode,
  generator: StaticUnimplementedNode,
  average: StaticUnimplementedNode,
  stock: StaticUnimplementedNode,
};
