import type { FunctionDefinition } from './types.js';

/**
 * 함수 노드의 함수 정의 레지스트리. shape/combiner와 동일한 패턴.
 * v1엔 core가 시작 팔레트를 등록하지만, 외부 도메인 패키지가 확장 가능.
 */
export class FunctionRegistry {
  private readonly map = new Map<string, FunctionDefinition>();

  register(def: FunctionDefinition): void {
    if (this.map.has(def.key)) {
      throw new Error(`FunctionRegistry: duplicate key "${def.key}"`);
    }
    this.map.set(def.key, def);
  }

  get(key: string): FunctionDefinition | undefined {
    return this.map.get(key);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  list(): FunctionDefinition[] {
    return Array.from(this.map.values());
  }
}
