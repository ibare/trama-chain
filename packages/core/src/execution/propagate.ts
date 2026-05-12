import type { CombinerRegistry } from '../combiners/index.js';
import type { Model, Node, NodeId } from '../model/index.js';
import { isFunctionNode, isValueNode } from '../model/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import type { FunctionRegistry } from '../node-functions/index.js';
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
import {
  MissingCombinerError,
  MissingFunctionError,
  MissingShapeError,
} from './errors.js';
import { defaultRng } from './rng.js';
import type { ExecutionState } from './state.js';
import { buildTopology, type InstantaneousTopology } from './topology.js';

export interface PropagateOptions {
  shapeRegistry: ShapeRegistry;
  combinerRegistry: CombinerRegistry;
  functionRegistry: FunctionRegistry;
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

function nodeOutputUnit(node: Node, catalog: UnitCatalog): ResolvedUnit {
  if (isValueNode(node)) {
    const def = catalog.get(node.unitId);
    if (!def) return FREE_FALLBACK;
    return resolveUnit(def, node.unitOverride);
  }
  // FunctionNode: outputUnitId 사용. 미지정 시 free.
  if (!node.outputUnitId) return FREE_FALLBACK;
  const def = catalog.get(node.outputUnitId);
  if (!def) return FREE_FALLBACK;
  return resolveUnit(def, node.outputUnitOverride);
}

/**
 * 한 timestep 안에서 lag=0 엣지만 따라 전방 전파.
 * - ValueNode: incoming lag=0 엣지의 shape 변환 결과를 combiner로 결합·클램프.
 * - FunctionNode: incoming 엣지를 slotIndex로 정렬, 모든 슬롯이 채워지고 source가
 *   모두 valid이며 compute 결과가 finite하면 next에 기록·validNodes에 추가.
 *   하나라도 만족 못 하면 validNodes에서 제거(downstream도 자연히 invalid).
 *
 * 입력만 있는 ValueNode(들어오는 lag=0 엣지 없음)는 state 값을 유지.
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
    const incoming = topology.incomingByTarget.get(nid) ?? [];

    if (isFunctionNode(node)) {
      computeFunctionNode(node, incoming, next, validNodes, model, catalog, options);
      continue;
    }

    // ValueNode
    if (incoming.length === 0) continue; // 입력 없음: 기존 값 유지

    const combiner = options.combinerRegistry.get(node.combiner);
    if (!combiner) throw new MissingCombinerError(node.combiner);

    const targetUnit = nodeOutputUnit(node, catalog);

    // 함수 노드를 source로 두는 엣지는 raw passthrough — normalize/denormalize와
    // shape 변환을 건너뛰고 source의 실제 값을 그대로 contribution으로 사용한다.
    // 함수 출력은 단위가 없는 raw number이므로 정규화 의미가 없다(설계 전제).
    let hasFunctionSource = false;
    const contributions: number[] = [];
    for (const edge of incoming) {
      const source = model.nodes[edge.from];
      if (!source) continue;
      if (!validNodes.has(edge.from)) continue; // 무효 source는 기여 없음
      const sourceValue =
        next[edge.from] ?? (isValueNode(source) ? source.initialValue : 0);
      if (isFunctionNode(source)) {
        hasFunctionSource = true;
        // edge.inverted는 0~1 정규화 공간 개념이라 raw에선 의미가 없다 — 무시.
        contributions.push(sourceValue);
        continue;
      }
      const sourceUnit = nodeOutputUnit(source, catalog);
      const normalizedIn = normalize(sourceValue, sourceUnit);
      const shape = options.shapeRegistry.get(edge.shape.kind);
      if (!shape) throw new MissingShapeError(edge.shape.kind);
      const parsed = shape.paramsSchema.safeParse(edge.shape.params);
      const params = parsed.success ? parsed.data : shape.defaultParams;
      let out01 = shape.compute(normalizedIn, params, { rng });
      if (edge.inverted) out01 = clamp01(1 - out01);
      contributions.push(denormalize(out01, targetUnit));
    }

    if (contributions.length === 0) continue; // 모든 source 무효: 값 유지
    const combined = combiner.combine(contributions);
    // 함수 출력이 한 컨트리뷰션이라도 섞여 있으면 raw 통과 — target의 단위
    // 클램프(예: cm의 0~250)에 짓이겨지지 않게 한다.
    next[nid] = hasFunctionSource ? combined : clampToUnit(combined, targetUnit);
    validNodes.add(nid);
  }

  return { values: next, validNodes };
}

function computeFunctionNode(
  node: Extract<Node, { kind: 'function' }>,
  incoming: ReadonlyArray<Model['edges'][string]>,
  next: Record<NodeId, number>,
  validNodes: Set<NodeId>,
  model: Model,
  catalog: UnitCatalog,
  options: PropagateOptions,
): void {
  const def = options.functionRegistry.get(node.functionKey);
  if (!def) throw new MissingFunctionError(node.functionKey);

  const arity = def.slots.length;
  const inputs: number[] = new Array(arity);
  const filled = new Array<boolean>(arity).fill(false);

  for (const edge of incoming) {
    const slot = edge.slotIndex;
    if (typeof slot !== 'number' || slot < 0 || slot >= arity) continue;
    if (filled[slot]) continue; // 중복 엣지 — 첫 것 채택, 나머지 무시
    const source = model.nodes[edge.from];
    if (!source) continue;
    if (!validNodes.has(edge.from)) continue;
    const value =
      next[edge.from] ?? (isValueNode(source) ? source.initialValue : 0);
    inputs[slot] = value;
    filled[slot] = true;
  }

  if (!filled.every((f) => f)) {
    validNodes.delete(node.id);
    return;
  }

  const out = def.compute(inputs);
  if (!Number.isFinite(out)) {
    validNodes.delete(node.id);
    return;
  }

  // 함수 출력은 raw로 통과 — outputUnitId가 명시된 경우에만 그 단위로 클램프.
  // 미지정(설계 기본)이면 raw 그대로 저장. 이 노드의 출력을 받는 엣지도
  // propagateOneStep에서 정규화를 건너뛰도록 분기되어 있다.
  if (node.outputUnitId) {
    const outUnit = nodeOutputUnit(node, catalog);
    next[node.id] = clampToUnit(out, outUnit);
  } else {
    next[node.id] = out;
  }
  validNodes.add(node.id);
}

/**
 * lag=1 엣지를 따라 source의 *현재* 값을 target의 다음 timestep 시작값으로 전달.
 * 단일 target에 여러 feedback이 모이면 노드의 combiner로 결합.
 * FunctionNode는 feedback target이 될 수 없음(슬롯 기반이고 자체 누적 의미 없음).
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
  const fnSourceTargets = new Set<string>();
  for (const edge of topology.feedbackEdges) {
    const target = model.nodes[edge.to];
    const source = model.nodes[edge.from];
    if (!target || !source) continue;
    if (!isValueNode(target)) continue; // FunctionNode는 feedback target 아님
    if (!validNodes.has(edge.from)) continue;
    const sourceValue =
      state.values[edge.from] ?? (isValueNode(source) ? source.initialValue : 0);
    const list = byTarget.get(edge.to) ?? [];
    list.push(sourceValue);
    byTarget.set(edge.to, list);
    if (isFunctionNode(source)) fnSourceTargets.add(edge.to);
  }

  for (const [tid, contribs] of byTarget) {
    const target = model.nodes[tid];
    if (!target || !isValueNode(target)) continue;
    const combiner = options.combinerRegistry.get(target.combiner);
    if (!combiner) throw new MissingCombinerError(target.combiner);
    const baseValue = next[tid] ?? target.initialValue;
    const combined = combiner.combine([baseValue, ...contribs]);
    next[tid] = fnSourceTargets.has(tid)
      ? combined
      : clampToUnit(combined, nodeOutputUnit(target, catalog));
    validNodes.add(tid);
  }

  return { values: next, validNodes };
}
