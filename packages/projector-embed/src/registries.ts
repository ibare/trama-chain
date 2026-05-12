import {
  type CombinerRegistry,
  type FunctionRegistry,
  type ShapeRegistry,
  createDefaultCombinerRegistry,
  createDefaultFunctionRegistry,
  createDefaultShapeRegistry,
} from '@trama/core';

export const shapeRegistry: ShapeRegistry = createDefaultShapeRegistry();
export const combinerRegistry: CombinerRegistry = createDefaultCombinerRegistry();
export const functionRegistry: FunctionRegistry = createDefaultFunctionRegistry();
