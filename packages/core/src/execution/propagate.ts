import type { CombinerRegistry } from '../combiners/index.js';
import type { Model, Node } from '../model/index.js';
import { isValueNode } from '../model/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import {
  clamp01,
  clampToUnit,
  defaultUnitCatalog,
  denormalize,
  normalize,
  resolveUnit,
  type ResolvedUnit,
  type UnitCatalog,
} from '../units/index.js';
import { MissingCombinerError, MissingShapeError } from './errors.js';
import { defaultRng } from './rng.js';
import type { ExecutionState } from './state.js';
import { buildTopology, type InstantaneousTopology } from './topology.js';

export interface PropagateOptions {
  shapeRegistry: ShapeRegistry;
  combinerRegistry: CombinerRegistry;
  /** 단위 카탈로그. 미지정 시 기본 카탈로그. 알 수 없는 unitId는 free로 폴백. */
  unitCatalog?: UnitCatalog;
  rng?: Rng;
  /** 이미 계산된 위상을 재사용하려면 전달 */
  topology?: InstantaneousTopology;
}

const FREE_FALLBACK: ResolvedUnit = {
  id: 'free',
  kind: 'free',
  suffix: '',
  labels: [],
  min: 0,
  max: 1,
  step: 0.01,
};

function valueNodeUnit(node: Node, catalog: UnitCatalog): ResolvedUnit {
  if (!isValueNode(node)) return FREE_FALLBACK;
  const def = catalog.get(node.unitId);
  if (!def) return FREE_FALLBACK;
  return resolveUnit(def, node.unitOverride);
}

/**
 * 한 timestep 안에서 lag=0 엣지만 따라 전방 전파.
 * - 입력만 있는 노드(들어오는 lag=0 엣지 없음)는 state 값을 유지.
 * - 들어오는 lag=0 엣지가 있는 노드는 각 엣지의 출력을 combiner로 결합, unit으로 클램프.
 *
 * NOTE: FunctionNode 처리는 Phase 3에서 추가됨. 현재는 ValueNode만 갱신.
 */
export function propagateOneStep(
  state: ExecutionState,
  model: Model,
  options: PropagateOptions,
): ExecutionState {
  const topology = options.topology ?? buildTopology(model);
  const rng = options.rng ?? defaultRng;
  const catalog = options.unitCatalog ?? defaultUnitCatalog;
  const next: Record<string, number> = { ...state.values };
  const validNodes = new Set(state.validNodes);

  for (const nid of topology.order) {
    const node = model.nodes[nid];
    if (!node) continue;
    if (!isValueNode(node)) continue; // FunctionNode는 Phase 3에서

    const incoming = topology.incomingByTarget.get(nid) ?? [];
    if (incoming.length === 0) {
      // 입력 없음: 기존 값 유지
      continue;
    }

    const combiner = options.combinerRegistry.get(node.combiner);
    if (!combiner) throw new MissingCombinerError(node.combiner);

    const targetUnit = valueNodeUnit(node, catalog);

    const contributions: number[] = [];
    for (const edge of incoming) {
      const source = model.nodes[edge.from];
      if (!source || !isValueNode(source)) continue;
      const sourceUnit = valueNodeUnit(source, catalog);
      const sourceValue = next[edge.from] ?? source.initialValue;
      const normalizedIn = normalize(sourceValue, sourceUnit);
      const shape = options.shapeRegistry.get(edge.shape.kind);
      if (!shape) throw new MissingShapeError(edge.shape.kind);
      const parsed = shape.paramsSchema.safeParse(edge.shape.params);
      const params = parsed.success ? parsed.data : shape.defaultParams;
      let out01 = shape.compute(normalizedIn, params, { rng });
      if (edge.inverted) out01 = clamp01(1 - out01);
      contributions.push(denormalize(out01, targetUnit));
    }

    const combined = combiner.combine(contributions);
    next[nid] = clampToUnit(combined, targetUnit);
    validNodes.add(nid);
  }

  return { values: next, validNodes };
}

/**
 * lag=1 엣지를 따라 source의 *현재* 값을 target의 다음 timestep 시작값으로 전달.
 * 단일 target에 여러 feedback이 모이면 노드의 combiner로 결합.
 */
export function applyFeedbackEdges(
  state: ExecutionState,
  model: Model,
  options: Pick<PropagateOptions, 'combinerRegistry' | 'topology' | 'unitCatalog'>,
): ExecutionState {
  const topology = options.topology ?? buildTopology(model);
  if (topology.feedbackEdges.length === 0) return state;
  const catalog = options.unitCatalog ?? defaultUnitCatalog;
  const next: Record<string, number> = { ...state.values };
  const validNodes = new Set(state.validNodes);

  const byTarget = new Map<string, number[]>();
  for (const edge of topology.feedbackEdges) {
    const target = model.nodes[edge.to];
    const source = model.nodes[edge.from];
    if (!target || !source) continue;
    if (!isValueNode(target) || !isValueNode(source)) continue;
    const sourceValue = state.values[edge.from] ?? source.initialValue;
    const list = byTarget.get(edge.to) ?? [];
    list.push(sourceValue);
    byTarget.set(edge.to, list);
  }

  for (const [tid, contribs] of byTarget) {
    const target = model.nodes[tid];
    if (!target || !isValueNode(target)) continue;
    const combiner = options.combinerRegistry.get(target.combiner);
    if (!combiner) throw new MissingCombinerError(target.combiner);
    const baseValue = next[tid] ?? target.initialValue;
    const combined = combiner.combine([baseValue, ...contribs]);
    next[tid] = clampToUnit(combined, valueNodeUnit(target, catalog));
    validNodes.add(tid);
  }

  return { values: next, validNodes };
}
