import {
  CombinerRegistry,
  ShapeRegistry,
  createDefaultCombinerRegistry,
  createDefaultShapeRegistry,
} from '@trama/core';

/**
 * Projector 내부에서 공유하는 registry. 호스트가 외부에서 더 등록할 수도 있음.
 * v1엔 모듈 스코프 싱글톤.
 */
export const shapeRegistry: ShapeRegistry = createDefaultShapeRegistry();
export const combinerRegistry: CombinerRegistry = createDefaultCombinerRegistry();
