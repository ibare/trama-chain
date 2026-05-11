import type { CombinerRegistry } from '../combiners/index.js';
import type { Model } from '../model/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import { clamp01, clampToUnit, denormalize, normalize } from '../units/index.js';
import { MissingCombinerError, MissingShapeError } from './errors.js';
import { defaultRng } from './rng.js';
import type { ExecutionState } from './state.js';
import { buildTopology, type InstantaneousTopology } from './topology.js';

export interface PropagateOptions {
  shapeRegistry: ShapeRegistry;
  combinerRegistry: CombinerRegistry;
  rng?: Rng;
  /** 이미 계산된 위상을 재사용하려면 전달 */
  topology?: InstantaneousTopology;
}

/**
 * 한 timestep 안에서 lag=0 엣지만 따라 전방 전파.
 * - 입력만 있는 노드(들어오는 lag=0 엣지 없음)는 state 값을 유지.
 * - 들어오는 lag=0 엣지가 있는 노드는 각 엣지의 출력을 combiner로 결합, unit으로 클램프.
 */
export function propagateOneStep(
  state: ExecutionState,
  model: Model,
  options: PropagateOptions,
): ExecutionState {
  const topology = options.topology ?? buildTopology(model);
  const rng = options.rng ?? defaultRng;
  const next: Record<string, number> = { ...state.values };

  for (const nid of topology.order) {
    const node = model.nodes[nid];
    if (!node) continue;
    const incoming = topology.incomingByTarget.get(nid) ?? [];
    if (incoming.length === 0) {
      // 입력 없음: 기존 값 유지
      continue;
    }

    const combiner = options.combinerRegistry.get(node.combiner);
    if (!combiner) throw new MissingCombinerError(node.combiner);

    const contributions: number[] = [];
    for (const edge of incoming) {
      const source = model.nodes[edge.from];
      if (!source) continue;
      const sourceValue = next[edge.from] ?? source.initialValue;
      const normalizedIn = normalize(sourceValue, source.unit);
      const shape = options.shapeRegistry.get(edge.shape.kind);
      if (!shape) throw new MissingShapeError(edge.shape.kind);
      const parsed = shape.paramsSchema.safeParse(edge.shape.params);
      const params = parsed.success ? parsed.data : shape.defaultParams;
      let out01 = shape.compute(normalizedIn, params, { rng });
      if (edge.inverted) out01 = clamp01(1 - out01);
      // target unit 스케일로 환원
      contributions.push(denormalize(out01, node.unit));
    }

    const combined = combiner.combine(contributions);
    next[nid] = clampToUnit(combined, node.unit);
  }

  return { values: next };
}

/**
 * lag=1 엣지를 따라 source의 *현재* 값을 target의 다음 timestep 시작값으로 전달.
 * 단일 target에 여러 feedback이 모이면 노드의 combiner로 결합.
 * 일반 엣지가 함께 들어오는 target은 두 단계(feedback 먼저로 시작값을 갱신 → 다음 timestep propagation에서 일반 엣지가 다시 덮어쓰기)로 처리됨.
 */
export function applyFeedbackEdges(
  state: ExecutionState,
  model: Model,
  options: Pick<PropagateOptions, 'combinerRegistry' | 'topology'>,
): ExecutionState {
  const topology = options.topology ?? buildTopology(model);
  if (topology.feedbackEdges.length === 0) return state;
  const next: Record<string, number> = { ...state.values };

  // target별로 feedback contributions 모으기
  const byTarget = new Map<string, number[]>();
  for (const edge of topology.feedbackEdges) {
    const target = model.nodes[edge.to];
    const source = model.nodes[edge.from];
    if (!target || !source) continue;
    const sourceValue = state.values[edge.from] ?? source.initialValue;
    // feedback은 source의 *현재 실제 값* 을 그대로 target 스케일로 옮김.
    // 단, shape도 적용 (slope/offset이 의미를 가질 수 있음).
    // 단순화를 위해 v1엔 linear-like passthrough만 가정하지 않고,
    // 일반 propagation과 동일하게 shape를 통과시킨다.
    // 하지만 그러려면 shapeRegistry가 필요 — 호출부에서 옵션으로 받아야.
    // 여기서는 우선 normalize/denormalize 없이 단순 통과로 구현하고,
    // feedback에 shape 적용은 propagateOneStep에 통합 처리하는 게 깔끔.
    const list = byTarget.get(edge.to) ?? [];
    list.push(sourceValue);
    byTarget.set(edge.to, list);
  }

  for (const [tid, contribs] of byTarget) {
    const target = model.nodes[tid];
    if (!target) continue;
    const combiner = options.combinerRegistry.get(target.combiner);
    if (!combiner) throw new MissingCombinerError(target.combiner);
    // feedback은 일반적으로 *누적* 시맨틱이 흔함 (잔액 += outcome).
    // v1 단순화: 노드 combiner로 (현재 target 값 + feedback contributions) 결합.
    // sum이면 누적, average면 평균 등 사용자가 의도 표현 가능.
    const baseValue = next[tid] ?? target.initialValue;
    const combined = combiner.combine([baseValue, ...contribs]);
    next[tid] = clampToUnit(combined, target.unit);
  }

  return { values: next };
}
