import type { CombinerRegistry } from '../combiners/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import type { Model, NodeId } from '../model/index.js';
import { defaultUnitCatalog, type UnitCatalog } from '../units/index.js';
import {
  defaultNodeKindRegistry,
  type NodeKindRegistry,
  type PropagateContext,
} from './kinds.js';
import {
  noopExpressionEvaluator,
  type ExpressionEvaluator,
} from './expression-evaluator.js';
import { defaultRng } from './rng.js';
import { outputKey, type ExecutionState } from './state.js';
import { buildTopology, type InstantaneousTopology } from './topology.js';

export interface RecomputeNodeOptions {
  shapeRegistry: ShapeRegistry;
  combinerRegistry: CombinerRegistry;
  nodeKindRegistry?: NodeKindRegistry;
  unitCatalog?: UnitCatalog;
  rng?: Rng;
  /** LaTeX 식 평가자. 미지정이면 noop (식 노드 결과는 항상 undefined). */
  expressionEvaluator?: ExpressionEvaluator;
  topology?: InstantaneousTopology;
  /**
   * 특정 source 노드의 값을 임시 대체. 펄스 도착 시 그 펄스가 운반한
   * snapshot 값을 해당 source의 출력으로 간주하기 위함. 다른 입력은
   * 현재 state 그대로 사용.
   */
  sourceValueOverrides?: Readonly<Record<NodeId, number>>;
}

export interface RecomputeNodeResult {
  /** 재계산 후의 새 target 값. validOutputs에서 빠진 경우 undefined. */
  newValue: number | undefined;
  /** 단출력 노드 기준 슬롯 0의 valid 여부. */
  isValid: boolean;
  /** 갱신된 validOutputs 집합 (조건 노드 등 다출력 케이스 포함). */
  validOutputs: Set<string>;
  /** target의 모든 출력 슬롯 키. 호출자가 변경 비교에 쓰기 좋게 같이 반환. */
  outputSlotKeys: string[];
}

/**
 * 단일 노드의 lag=0 입력만으로 출력을 재계산.
 * 전체 그래프 propagate와 달리 위상 순회 없이 *해당 노드만* 디스크립터를 호출.
 * 펄스 도착 시점의 시각·논리적 단위 갱신용.
 *
 * sourceValueOverrides가 주어지면 그 source 노드들의 출력값은 override 값으로
 * 간주된다. 펄스가 운반한 snapshot을 그 펄스의 source에만 적용하기 위해 쓴다.
 */
export function recomputeNode(
  nodeId: NodeId,
  state: ExecutionState,
  model: Model,
  options: RecomputeNodeOptions,
): RecomputeNodeResult {
  const node = model.nodes[nodeId];
  if (!node) {
    return {
      newValue: undefined,
      isValid: false,
      validOutputs: new Set(state.validOutputs),
      outputSlotKeys: [],
    };
  }

  const nodeKindRegistry = options.nodeKindRegistry ?? defaultNodeKindRegistry;
  const desc = nodeKindRegistry.forNode(node);
  if (!desc) {
    return {
      newValue: state.values[nodeId],
      isValid: state.validOutputs.has(outputKey(nodeId, 0)),
      validOutputs: new Set(state.validOutputs),
      outputSlotKeys: [outputKey(nodeId, 0)],
    };
  }

  const topology = options.topology ?? buildTopology(model);
  const incoming = topology.incomingByTarget.get(nodeId) ?? [];

  // 작업용 카피. 디스크립터가 mutate해도 caller의 state는 건드리지 않음.
  const workingValues: Record<NodeId, number> = { ...state.values };
  const workingValid = new Set(state.validOutputs);
  const workingInvalidReasons: ExecutionState['invalidReasons'] = {
    ...state.invalidReasons,
  };

  // 펄스 snapshot override 적용 (source 노드들의 출력을 임시 치환).
  if (options.sourceValueOverrides) {
    for (const [srcId, v] of Object.entries(options.sourceValueOverrides)) {
      workingValues[srcId] = v;
      // override가 들어왔다는 건 그 source의 슬롯 0이 valid임을 의미. (다중 슬롯
      // override는 펄스 모델 범위 밖.)
      workingValid.add(outputKey(srcId, 0));
    }
  }

  const ctx: PropagateContext = {
    model,
    incoming,
    next: workingValues,
    validOutputs: workingValid,
    invalidReasons: workingInvalidReasons,
    catalog: options.unitCatalog ?? defaultUnitCatalog,
    shapeRegistry: options.shapeRegistry,
    combinerRegistry: options.combinerRegistry,
    nodeKindRegistry,
    expressionEvaluator: options.expressionEvaluator ?? noopExpressionEvaluator,
    rng: options.rng ?? defaultRng,
  };

  desc.propagate(node, ctx);

  // 디스크립터 출력 슬롯 수집: 조건 노드는 0/1 모두, 그 외는 0.
  const outputSlotKeys =
    node.kind === 'conditional'
      ? [outputKey(nodeId, 0), outputKey(nodeId, 1)]
      : [outputKey(nodeId, 0)];

  return {
    newValue: workingValues[nodeId],
    isValid: workingValid.has(outputKey(nodeId, 0)),
    validOutputs: workingValid,
    outputSlotKeys,
  };
}
