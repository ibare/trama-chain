import { FunctionRegistry } from './registry.js';

/**
 * 기본 함수 레지스트리. Phase 6에서 multiply/add/subtract/divide/min/max 등록 예정.
 * 현재는 빈 레지스트리 — propagate가 functionRegistry를 필요로 하나 함수 노드가
 * 등록되지 않은 상태에선 함수 노드를 만들 일이 없으므로 빈 채로 둬도 안전.
 */
export function createDefaultFunctionRegistry(): FunctionRegistry {
  return new FunctionRegistry();
}
