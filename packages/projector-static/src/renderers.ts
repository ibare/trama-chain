import type { StaticNodeRendererMap } from './registry.js';
import { StaticValueNode } from './nodes/StaticValueNode.js';
import { StaticConstantNode } from './nodes/StaticConstantNode.js';
import { StaticConditionNode } from './nodes/StaticConditionNode.js';
import { StaticExpressionNode } from './nodes/StaticExpressionNode.js';
import { StaticLogicGateNode } from './nodes/StaticLogicGateNode.js';
import { StaticObserveNode } from './nodes/StaticObserveNode.js';
import { StaticGeneratorNode } from './nodes/StaticGeneratorNode.js';
import { StaticAverageNode } from './nodes/StaticAverageNode.js';
import { StaticStockNode } from './nodes/StaticStockNode.js';

/**
 * 9 종 정적 노드 컴포넌트 매핑. Record<NodeKind, ...> 형은 새 NodeKind 가 sum
 * type 에 추가되면 type-error 로 누락을 잡는다.
 */
export const defaultStaticRenderers: StaticNodeRendererMap = {
  value: StaticValueNode,
  constant: StaticConstantNode,
  condition: StaticConditionNode,
  expression: StaticExpressionNode,
  'logic-gate': StaticLogicGateNode,
  observe: StaticObserveNode,
  generator: StaticGeneratorNode,
  average: StaticAverageNode,
  stock: StaticStockNode,
};
