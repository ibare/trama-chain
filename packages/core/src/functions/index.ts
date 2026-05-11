export * from './types.js';
export * from './registry.js';

import { ShapeRegistry } from './registry.js';
import { linearShape } from './shapes/linear.js';
import { inverseUShape } from './shapes/inverse-u.js';
import { thresholdShape } from './shapes/threshold.js';
import { diminishingShape } from './shapes/diminishing.js';
import { acceleratingShape } from './shapes/accelerating.js';
import { piecewiseShape } from './shapes/piecewise.js';
import { stochasticShape } from './shapes/stochastic.js';

export {
  linearShape,
  inverseUShape,
  thresholdShape,
  diminishingShape,
  acceleratingShape,
  piecewiseShape,
  stochasticShape,
};

/** v1 시작 팔레트가 등록된 registry를 반환. 호출자가 추가 shape를 더 register 가능. */
export function createDefaultShapeRegistry(): ShapeRegistry {
  const r = new ShapeRegistry();
  r.register(linearShape);
  r.register(inverseUShape);
  r.register(thresholdShape);
  r.register(diminishingShape);
  r.register(acceleratingShape);
  r.register(piecewiseShape);
  r.register(stochasticShape);
  return r;
}
