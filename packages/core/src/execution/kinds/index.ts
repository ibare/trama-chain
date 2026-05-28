import {
  FREE_FALLBACK,
  type ObserveExtractionRuntime,
  type PortTypeContext,
  type PropagateContext,
} from './context.js';
import {
  isIdentityShape,
  isSequencePortSpec,
  type OutputSlotSpec,
  type PortSpec,
  type ScalarPortSpec,
  type SequencePortSpec,
} from './port-spec.js';
import type { NodeKindDescriptor } from './descriptor.js';

// C1 (kinds-split): 분리된 4 모듈의 심볼을 public surface 보존 위해 re-export.
// 외부 (projector-web/embed) 가 `@trama-chain/core` 에서 보던 이름은 그대로 유효.
export { FREE_FALLBACK, isIdentityShape, isSequencePortSpec };
export type {
  NodeKindDescriptor,
  ObserveExtractionRuntime,
  OutputSlotSpec,
  PortSpec,
  PortTypeContext,
  PropagateContext,
  ScalarPortSpec,
  SequencePortSpec,
};

// C2 (kinds-split): 분리된 3 모듈에서 필요한 심볼을 import.
// public surface 보존: getNodeOutputUnit/isRawOutputNode/canBeFeedbackTarget/
// getOutputSlots/getOutputSlotAt/getInputAccepts/getInputPortType/getOutputPortType
// 그리고 NodeKindRegistry/createNodeKindRegistry 를 그대로 re-export.
import {
  createNodeKindRegistry,
  type NodeKindRegistry,
} from './registry.js';
import {
  getNodeOutputUnit,
  isRawOutputNode,
  canBeFeedbackTarget,
  getOutputSlots,
  getOutputSlotAt,
  getInputAccepts,
  getInputPortType,
  getOutputPortType,
} from './queries.js';

export {
  createNodeKindRegistry,
  getNodeOutputUnit,
  isRawOutputNode,
  canBeFeedbackTarget,
  getOutputSlots,
  getOutputSlotAt,
  getInputAccepts,
  getInputPortType,
  getOutputPortType,
};
export type { NodeKindRegistry };

// C3 (kinds-split): scalar/raw 디스크립터 5종을 descriptors/ 로 분리.
// 디스크립터 본문은 더 이상 이 파일에 없고, register 호출만 createDefault... 에 남는다.
import { valueNodeDescriptor } from './descriptors/value.js';
import { constantNodeDescriptor } from './descriptors/constant.js';
import { conditionNodeDescriptor } from './descriptors/condition.js';
import { expressionNodeDescriptor } from './descriptors/expression.js';
import { logicGateNodeDescriptor } from './descriptors/logic-gate.js';

// C4 (kinds-split): sequence/observe/generator/stock 디스크립터 4종도 분리.
import { observeNodeDescriptor } from './descriptors/observe.js';
import { generatorNodeDescriptor } from './descriptors/generator.js';
import { averageNodeDescriptor } from './descriptors/average.js';
import { stockNodeDescriptor } from './descriptors/stock.js';

export function createDefaultNodeKindRegistry(): NodeKindRegistry {
  return createNodeKindRegistry()
    .register(valueNodeDescriptor)
    .register(constantNodeDescriptor)
    .register(conditionNodeDescriptor)
    .register(logicGateNodeDescriptor)
    .register(observeNodeDescriptor)
    .register(expressionNodeDescriptor)
    .register(generatorNodeDescriptor)
    .register(averageNodeDescriptor)
    .register(stockNodeDescriptor);
}

/**
 * 라이브러리 내부에서 등록 누락을 빠르게 잡기 위해 단일 기본 인스턴스를 제공.
 * 옵션을 통해 명시 주입하지 않은 경로의 폴백.
 */
export const defaultNodeKindRegistry = createDefaultNodeKindRegistry();
