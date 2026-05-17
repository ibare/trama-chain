import type { CombinerRegistry } from '../combiners/index.js';
import type { Model, NodeId, Value } from '../model/index.js';
import { booleanValue, isNumericValue, isValueNode, numericValue } from '../model/index.js';
import { isSequence, unwrap, type ExecValue, type SequenceSample, type SequenceValue } from './exec-value.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import {
  defaultGeneratorRegistry,
  type GeneratorRegistry,
  type GeneratorRuntime,
} from '../generators/index.js';
import {
  clampToUnit,
  defaultUnitCatalog,
  type UnitCatalog,
} from '../units/index.js';
import { MissingCombinerError } from './errors.js';
import {
  canBeFeedbackTarget,
  defaultNodeKindRegistry,
  getNodeOutputUnit,
  isRawOutputNode,
  type NodeKindRegistry,
  type ObserveExtractionRuntime,
  type PropagateContext,
} from './kinds.js';
import {
  noopExpressionEvaluator,
  type ExpressionEvaluator,
} from './expression-evaluator.js';
import { defaultRng } from './rng.js';
import { outputKey, type ExecutionState } from './state.js';
import { buildTopology, type InstantaneousTopology } from './topology.js';

export interface PropagateOptions {
  shapeRegistry: ShapeRegistry;
  combinerRegistry: CombinerRegistry;
  /** 노드 종류 디스크립터 레지스트리. 미지정 시 기본 (value·constant·condition·expression). */
  nodeKindRegistry?: NodeKindRegistry;
  /** 단위 카탈로그. 미지정 시 기본 카탈로그. 알 수 없는 unitId는 free로 폴백. */
  unitCatalog?: UnitCatalog;
  rng?: Rng;
  /** LaTeX 식 평가자. 미지정이면 noop (식 노드 출력은 항상 invalid). */
  expressionEvaluator?: ExpressionEvaluator;
  /** Generator paradigm registry. 미지정 시 기본 (counter·random). */
  generatorRegistry?: GeneratorRegistry;
  /** 이미 계산된 위상을 재사용하려면 전달 */
  topology?: InstantaneousTopology;
  /**
   * 이번 step 에서 누적·throttle 비교의 기준이 될 simulation time(ms) 증가량.
   * 미지정 시 0 — 시간이 흐르지 않는 step (수동 recompute 등) 으로 간주.
   * 정상 ticker 경로는 step 간격(예: STEP_TICK_MS) 을 넘긴다.
   */
  stepIntervalMs?: number;
}

/**
 * 한 timestep 안에서 lag=0 엣지만 따라 전방 전파.
 * 각 노드는 자신의 종류에 등록된 디스크립터의 propagate 훅에서 처리한다.
 * 종류별 분기는 디스크립터 레지스트리(`NodeKindDescriptor`)에 있으므로
 * 이 함수는 위상 순회와 컨텍스트 조립만 담당한다.
 */
export function propagateOneStep(
  state: ExecutionState,
  model: Model,
  options: PropagateOptions,
): ExecutionState {
  const topology = options.topology ?? buildTopology(model);
  const rng = options.rng ?? defaultRng;
  const catalog = options.unitCatalog ?? defaultUnitCatalog;
  const nodeKindRegistry = options.nodeKindRegistry ?? defaultNodeKindRegistry;
  const next: Record<string, ExecValue> = { ...state.values };
  const validOutputs = new Set(state.validOutputs);
  const invalidReasons: ExecutionState['invalidReasons'] = {
    ...state.invalidReasons,
  };
  // ObserveNode 누적 버퍼는 step 간에 이어진다 — 직전 step의 버퍼를 그대로
  // 카피해 디스크립터가 새 값을 push하면 잘림 정책까지 디스크립터가 적용한다.
  const observeBuffers: Record<string, SequenceSample[]> = {};
  for (const [nid, buf] of Object.entries(state.observeBuffers ?? {})) {
    observeBuffers[nid] = [...buf];
  }
  const observeExtractionRuntime: Record<NodeId, ObserveExtractionRuntime> = {
    ...(state.observeExtractionRuntime ?? {}),
  };
  // GeneratorRuntime도 step 간에 이어진다 — clone-in/out으로 caller state는 안전.
  const generatorRuntime: Record<NodeId, GeneratorRuntime> = {};
  for (const [nid, rt] of Object.entries(state.generatorRuntime ?? {})) {
    generatorRuntime[nid] = {
      enabled: rt.enabled,
      cursor: { ...rt.cursor },
      gateOpen: rt.gateOpen,
    };
  }
  const generatorRegistry = options.generatorRegistry ?? defaultGeneratorRegistry;
  // Sequence 채널 출력 — 이전 step 의 슬롯별 SequenceValue 를 카피해 두고,
  // 디스크립터가 이번 step 의 emit 결정에 따라 덮어쓰거나 그대로 둔다.
  const sequenceNext: Record<string, SequenceValue> = { ...(state.sequenceOutputs ?? {}) };
  // 이번 step 에서 사용할 simulation time — 이전 시각 + 옵션 증분.
  const stepDelta = options.stepIntervalMs ?? 0;
  const simulationTimeMs = (state.simulationTimeMs ?? 0) + stepDelta;

  for (const nid of topology.order) {
    const node = model.nodes[nid];
    if (!node) continue;
    const desc = nodeKindRegistry.forNode(node);
    if (!desc) continue; // 미등록 종류: 통과
    const incoming = topology.incomingByTarget.get(nid) ?? [];
    const ctx: PropagateContext = {
      model,
      incoming,
      next,
      validOutputs,
      invalidReasons,
      catalog,
      shapeRegistry: options.shapeRegistry,
      combinerRegistry: options.combinerRegistry,
      nodeKindRegistry,
      expressionEvaluator:
        options.expressionEvaluator ?? noopExpressionEvaluator,
      rng,
      observeBuffers,
      observeExtractionRuntime,
      generatorRuntime,
      generatorRegistry,
      sequenceNext,
      simulationTimeMs,
    };
    desc.propagate(node, ctx);
  }

  return {
    values: next,
    sequenceOutputs: sequenceNext,
    validOutputs,
    invalidReasons,
    observeBuffers,
    observeExtractionRuntime,
    generatorRuntime,
    simulationTimeMs,
  };
}

/**
 * lag=1 엣지를 따라 source의 *현재* 값을 target의 다음 timestep 시작값으로 전달.
 * 단일 target에 여러 feedback이 모이면 노드의 combiner로 결합.
 * 디스크립터의 `canBeFeedbackTarget`이 false인 종류는 target이 될 수 없다.
 * 디스크립터의 `outputsRaw`가 true인 source가 한 컨트리뷰션이라도 섞이면
 * 타깃 단위 클램프를 건너뛴다 (raw 의미 보존).
 */
export function applyFeedbackEdges(
  state: ExecutionState,
  model: Model,
  options: Pick<
    PropagateOptions,
    'combinerRegistry' | 'topology' | 'unitCatalog' | 'nodeKindRegistry'
  >,
): ExecutionState {
  const topology = options.topology ?? buildTopology(model);
  if (topology.feedbackEdges.length === 0) return state;
  const catalog = options.unitCatalog ?? defaultUnitCatalog;
  const nodeKindRegistry = options.nodeKindRegistry ?? defaultNodeKindRegistry;
  const next: Record<string, ExecValue> = { ...state.values };
  const validOutputs = new Set(state.validOutputs);

  // ValueKind별 buckets — numeric은 단위 클램프와 raw passthrough를 따지고
  // boolean은 그저 boolean combiner로 합친다.
  const byTargetNumeric = new Map<string, number[]>();
  const byTargetBoolean = new Map<string, boolean[]>();
  const rawSourceTargets = new Set<string>();
  for (const edge of topology.feedbackEdges) {
    const target = model.nodes[edge.to];
    const source = model.nodes[edge.from];
    if (!target || !source) continue;
    if (!canBeFeedbackTarget(target, nodeKindRegistry)) continue;
    if (!isValueNode(target)) continue;
    const srcSlot = edge.sourceSlotIndex ?? 0;
    if (!validOutputs.has(outputKey(edge.from, srcSlot))) continue;
    // ExecValue 가 저장된 경우 unwrap 으로 알맹이 Value 만 본다 — feedback 결합은
    // 메타 인식 동작이 아니므로 wrapped 여부와 무관하게 alue 만 필요.
    const sourceExec =
      state.values[edge.from] ?? (isValueNode(source) ? source.initialValue : undefined);
    if (!sourceExec) continue;
    // feedback combiner는 스칼라만 — sequence source는 단위/극성 결합에 의미가 없어
    // 기여하지 않는다 (port-compat이 차단해야 정상이지만 안전망).
    if (isSequence(sourceExec)) continue;
    const sourceVal: Value = unwrap(sourceExec);
    // PortType 호환: source ValueKind ≠ target ValueKind면 기여하지 않음.
    if (sourceVal.kind !== target.initialValue.kind) continue;
    if (sourceVal.kind === 'numeric') {
      const list = byTargetNumeric.get(edge.to) ?? [];
      list.push(edge.inverted ? -sourceVal.n : sourceVal.n);
      byTargetNumeric.set(edge.to, list);
      if (isRawOutputNode(source, nodeKindRegistry)) rawSourceTargets.add(edge.to);
    } else {
      const list = byTargetBoolean.get(edge.to) ?? [];
      list.push(edge.inverted ? !sourceVal.b : sourceVal.b);
      byTargetBoolean.set(edge.to, list);
    }
  }

  for (const [tid, contribs] of byTargetNumeric) {
    const target = model.nodes[tid];
    if (!target || !isValueNode(target)) continue;
    if (!isNumericValue(target.initialValue)) continue;
    const combiner = options.combinerRegistry.getOfKind(target.combiner, 'numeric');
    if (!combiner) throw new MissingCombinerError(target.combiner);
    const baseExec = next[tid];
    const baseVal = baseExec && !isSequence(baseExec) ? unwrap(baseExec) : undefined;
    const baseNumber =
      baseVal && baseVal.kind === 'numeric' ? baseVal.n : target.initialValue.n;
    const combined = combiner.combine([baseNumber, ...contribs]);
    const finalNumber = rawSourceTargets.has(tid)
      ? combined
      : clampToUnit(combined, getNodeOutputUnit(target, catalog, nodeKindRegistry));
    next[tid] = numericValue(finalNumber, target.initialValue.unitId);
    validOutputs.add(outputKey(tid, 0));
  }

  for (const [tid, contribs] of byTargetBoolean) {
    const target = model.nodes[tid];
    if (!target || !isValueNode(target)) continue;
    if (target.initialValue.kind !== 'boolean') continue;
    const combiner = options.combinerRegistry.getOfKind(target.combiner, 'boolean');
    if (!combiner) throw new MissingCombinerError(target.combiner);
    const baseExec = next[tid];
    const baseVal = baseExec && !isSequence(baseExec) ? unwrap(baseExec) : undefined;
    const baseBool =
      baseVal && baseVal.kind === 'boolean' ? baseVal.b : target.initialValue.b;
    next[tid] = booleanValue(combiner.combine([baseBool, ...contribs]));
    validOutputs.add(outputKey(tid, 0));
  }

  return {
    values: next,
    sequenceOutputs: { ...state.sequenceOutputs },
    validOutputs,
    invalidReasons: { ...state.invalidReasons },
    observeBuffers: { ...state.observeBuffers },
    observeExtractionRuntime: { ...state.observeExtractionRuntime },
    generatorRuntime: { ...state.generatorRuntime },
    simulationTimeMs: state.simulationTimeMs ?? 0,
  };
}
