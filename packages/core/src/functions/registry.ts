import type { ShapeDefinition } from './types.js';

/**
 * Shape는 *runtime에 확장 가능*. 닫힌 enum이 아니다.
 * v1엔 core가 시작 팔레트를 등록하지만, 향후 외부 도메인 패키지가 추가 가능.
 */
export class ShapeRegistry {
  private readonly map = new Map<string, ShapeDefinition<unknown>>();

  register<P>(def: ShapeDefinition<P>): void {
    if (this.map.has(def.key)) {
      throw new Error(`ShapeRegistry: duplicate key "${def.key}"`);
    }
    this.map.set(def.key, def as ShapeDefinition<unknown>);
  }

  get(key: string): ShapeDefinition<unknown> | undefined {
    return this.map.get(key);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  list(): ShapeDefinition<unknown>[] {
    return Array.from(this.map.values());
  }
}
