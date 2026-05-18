import type { CombinerRegistry } from '../combiners/index.js';
import type { Model } from '../model/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import type { ExpressionEvaluator } from './expression-evaluator.js';
import { defaultRng } from './rng.js';
import { applyFeedbackEdges, propagateOneStep } from './propagate.js';
import { initializeFromInitialValues, type ExecutionState } from './state.js';
import { buildTopology } from './topology.js';

export interface ExecuteOptions {
  shapeRegistry: ShapeRegistry;
  combinerRegistry: CombinerRegistry;
  /** LaTeX 식 평가자. 미지정이면 noop. */
  expressionEvaluator?: ExpressionEvaluator;
  rng?: Rng;
  /** 매 step 직후 호출. UI 시각 흐름용. */
  onStep?: (state: ExecutionState, step: number) => void;
  /**
   * 멈춤 상태에서 트리거된 재계산인지. true 면 ValueNode 처럼 펄스 도착으로만
   * 갱신되는 노드의 source 흡수를 건너뛰어, 모델 편집 시 즉시 다운스트림에
   * 효과가 가는 "시각 우선" 오작동을 막는다.
   */
  paused?: boolean;
}

/**
 * N-step iteration.
 *   for t in 0..N-1:
 *     1. propagateOneStep (lag=0 forward)
 *     2. applyFeedbackEdges (lag=1 → 다음 timestep 시작값 갱신)
 *
 * N=1이면 단일 propagation. Feedback 엣지가 없으면 N을 늘려도 결과가 안정 상태에 머문다.
 */
export function executeModel(model: Model, options: ExecuteOptions): ExecutionState[] {
  const topology = buildTopology(model);
  const rng = options.rng ?? defaultRng;
  const propOpts = {
    shapeRegistry: options.shapeRegistry,
    combinerRegistry: options.combinerRegistry,
    expressionEvaluator: options.expressionEvaluator,
    rng,
    topology,
    paused: options.paused ?? false,
  };
  const N = Math.max(1, model.execution.steps | 0);
  let state = initializeFromInitialValues(model);
  const trajectory: ExecutionState[] = [state];

  for (let t = 0; t < N; t++) {
    state = propagateOneStep(state, model, propOpts);
    if (t < N - 1) {
      state = applyFeedbackEdges(state, model, {
        combinerRegistry: options.combinerRegistry,
        topology,
      });
    }
    trajectory.push(state);
    options.onStep?.(state, t);
  }

  return trajectory;
}
