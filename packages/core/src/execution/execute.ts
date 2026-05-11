import type { CombinerRegistry } from '../combiners/index.js';
import type { Model } from '../model/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import { defaultRng } from './rng.js';
import { applyFeedbackEdges, propagateOneStep } from './propagate.js';
import { initializeFromInitialValues, type ExecutionState } from './state.js';
import { buildTopology } from './topology.js';

export interface ExecuteOptions {
  shapeRegistry: ShapeRegistry;
  combinerRegistry: CombinerRegistry;
  rng?: Rng;
  /** 매 step 직후 호출. UI 시각 흐름용. */
  onStep?: (state: ExecutionState, step: number) => void;
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
    rng,
    topology,
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
