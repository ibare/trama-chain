export * from './types.js';
export * from './registry.js';

import { ShapeRegistry } from './registry.js';
import { noneShape } from './shapes/none.js';
import { linearShape } from './shapes/linear.js';
import { inverseUShape } from './shapes/inverse-u.js';
import { thresholdShape } from './shapes/threshold.js';
import { diminishingShape } from './shapes/diminishing.js';
import { acceleratingShape } from './shapes/accelerating.js';
import { piecewiseShape } from './shapes/piecewise.js';
import { stochasticShape } from './shapes/stochastic.js';
import { sigmoidShape } from './shapes/sigmoid.js';
import { logShape } from './shapes/log.js';
import { stepShape } from './shapes/step.js';
import { decayShape } from './shapes/decay.js';
import { inverseShape } from './shapes/inverse.js';
import { inverseThresholdShape } from './shapes/inverse-threshold.js';
import { valleyShape } from './shapes/valley.js';
import { sinShape } from './shapes/sin.js';
import { uniformShape } from './shapes/uniform.js';
import { gaussianShape } from './shapes/gaussian.js';

export {
  noneShape,
  linearShape,
  inverseUShape,
  thresholdShape,
  diminishingShape,
  acceleratingShape,
  piecewiseShape,
  stochasticShape,
  sigmoidShape,
  logShape,
  stepShape,
  decayShape,
  inverseShape,
  inverseThresholdShape,
  valleyShape,
  sinShape,
  uniformShape,
  gaussianShape,
};

/** v1 시작 팔레트가 등록된 registry를 반환. 호출자가 추가 shape를 더 register 가능. */
export function createDefaultShapeRegistry(): ShapeRegistry {
  const r = new ShapeRegistry();
  r.register(noneShape);
  r.register(linearShape);
  r.register(inverseUShape);
  r.register(thresholdShape);
  r.register(diminishingShape);
  r.register(acceleratingShape);
  r.register(piecewiseShape);
  r.register(stochasticShape);
  r.register(sigmoidShape);
  r.register(logShape);
  r.register(stepShape);
  r.register(decayShape);
  r.register(inverseShape);
  r.register(inverseThresholdShape);
  r.register(valleyShape);
  r.register(sinShape);
  r.register(uniformShape);
  r.register(gaussianShape);
  return r;
}
