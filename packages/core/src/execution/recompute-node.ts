import type { CombinerRegistry } from '../combiners/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import {
  defaultGeneratorRegistry,
  type GeneratorRegistry,
} from '../generators/index.js';
import type { Model, NodeId, Value } from '../model/index.js';
import { defaultUnitCatalog, type UnitCatalog } from '../units/index.js';
import { unwrap, type ExecValue } from './exec-value.js';
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
  /** Generator paradigm registry. 미지정 시 기본. */
  generatorRegistry?: GeneratorRegistry;
  topology?: InstantaneousTopology;
  /**
   * 특정 source 노드의 값을 임시 대체. 펄스 도착 시 그 펄스가 운반한
   * snapshot 값을 해당 source의 출력으로 간주하기 위함. 다른 입력은
   * 현재 state 그대로 사용. ExecValue — WrappedValue 메타까지 그대로 전달된다.
   */
  sourceValueOverrides?: Readonly<Record<NodeId, ExecValue>>;
  /**
   * ObserveNode 누적 버퍼의 시작 상태. 미지정이면 빈 버퍼로 시작해 hot-path
   * 단발 호출에서 누적을 버릴 수 있다. 펄스 도착 시 누적이 *유지*되어야 하면
   * 호출자가 현재 `state.observeBuffers`를 전달하고 결과의 `newObserveBuffers`
   * 를 다시 state에 반영한다.
   */
  observeBuffers?: Readonly<Record<NodeId, Value[]>>;
}

export interface RecomputeNodeResult {
  /** 재계산 후의 새 target 값. validOutputs에서 빠진 경우 undefined. */
  newValue: Value | undefined;
  /** 단출력 노드 기준 슬롯 0의 valid 여부. */
  isValid: boolean;
  /** 갱신된 validOutputs 집합 (조건 노드 등 다출력 케이스 포함). */
  validOutputs: Set<string>;
  /** target의 모든 출력 슬롯 키. 호출자가 변경 비교에 쓰기 좋게 같이 반환. */
  outputSlotKeys: string[];
  /**
   * 재계산 후의 ObserveNode 누적 버퍼. 호출자가 `observeBuffers`를 넘긴 경우
   * 그 버퍼에 push된 결과가 새 reference로 반환된다 (caller의 입력은 mutate
   * 되지 않음 — 내부에서 clone 후 사용). 미입력이었으면 빈 객체.
   */
  newObserveBuffers: Record<NodeId, Value[]>;
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
  // 입력 버퍼는 clone — descriptor가 mutate해도 caller의 source는 건드리지 않는다.
  const seedBuffers: Record<NodeId, Value[]> = {};
  if (options.observeBuffers) {
    for (const [nid, buf] of Object.entries(options.observeBuffers)) {
      seedBuffers[nid] = [...buf];
    }
  }

  if (!node) {
    return {
      newValue: undefined,
      isValid: false,
      validOutputs: new Set(state.validOutputs),
      outputSlotKeys: [],
      newObserveBuffers: seedBuffers,
    };
  }

  const nodeKindRegistry = options.nodeKindRegistry ?? defaultNodeKindRegistry;
  const desc = nodeKindRegistry.forNode(node);
  if (!desc) {
    const ev = state.values[nodeId];
    return {
      newValue: ev === undefined ? undefined : unwrap(ev),
      isValid: state.validOutputs.has(outputKey(nodeId, 0)),
      validOutputs: new Set(state.validOutputs),
      outputSlotKeys: [outputKey(nodeId, 0)],
      newObserveBuffers: seedBuffers,
    };
  }

  const topology = options.topology ?? buildTopology(model);
  const incoming = topology.incomingByTarget.get(nodeId) ?? [];

  // 작업용 카피. 디스크립터가 mutate해도 caller의 state는 건드리지 않음.
  const workingValues: Record<NodeId, ExecValue> = { ...state.values };
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
    observeBuffers: seedBuffers,
    // recomputeNode는 단일 target만 propagate — generator는 target이 될 수 없으니
    // 빈 runtime + 기본 registry로 충분. ctx 인터페이스 만족을 위해 채워둔다.
    generatorRuntime: {},
    generatorRegistry: options.generatorRegistry ?? defaultGeneratorRegistry,
  };

  desc.propagate(node, ctx);

  // 모든 노드가 출력 슬롯 0 하나만 사용 — 조건 노드도 게이트 시맨틱이라 단일 출력.
  const outputSlotKeys = [outputKey(nodeId, 0)];

  const ev = workingValues[nodeId];
  return {
    // newValue 의 외부 시그니처는 Value — 메타 인식 caller 가 아직 없으므로
    // wrapped 가 저장돼 있으면 알맹이만 노출한다.
    newValue: ev === undefined ? undefined : unwrap(ev),
    isValid: workingValid.has(outputKey(nodeId, 0)),
    validOutputs: workingValid,
    outputSlotKeys,
    newObserveBuffers: seedBuffers,
  };
}
