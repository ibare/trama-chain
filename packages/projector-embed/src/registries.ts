import {
  type CombinerRegistry,
  type ShapeRegistry,
  createDefaultCombinerRegistry,
  createDefaultShapeRegistry,
} from '@trama/core';

export const shapeRegistry: ShapeRegistry = createDefaultShapeRegistry();
export const combinerRegistry: CombinerRegistry = createDefaultCombinerRegistry();
