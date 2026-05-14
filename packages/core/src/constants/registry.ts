import type { ValueKind } from '../model/value.js';
import type { ConstantDefinition } from './types.js';

/**
 * 상수 정의 레지스트리. shape/combiner/function과 동일한 패턴.
 * core가 기본 세트를 등록하고, 외부 도메인 패키지가 자유롭게 확장 가능.
 */
export class ConstantRegistry {
  private readonly map = new Map<string, ConstantDefinition>();

  register(def: ConstantDefinition): void {
    if (this.map.has(def.key)) {
      throw new Error(`ConstantRegistry: duplicate key "${def.key}"`);
    }
    this.map.set(def.key, def);
  }

  get(key: string): ConstantDefinition | undefined {
    return this.map.get(key);
  }

  /** key + valueKind 모두 일치하는 정의만 반환. 잘못된 kind면 undefined. */
  getOfKind<K extends ValueKind>(
    key: string,
    kind: K,
  ): Extract<ConstantDefinition, { valueKind: K }> | undefined {
    const def = this.map.get(key);
    if (!def || def.valueKind !== kind) return undefined;
    return def as Extract<ConstantDefinition, { valueKind: K }>;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  list(): ConstantDefinition[] {
    return Array.from(this.map.values());
  }

  listForKind<K extends ValueKind>(
    kind: K,
  ): Array<Extract<ConstantDefinition, { valueKind: K }>> {
    const out: Array<Extract<ConstantDefinition, { valueKind: K }>> = [];
    for (const def of this.map.values()) {
      if (def.valueKind === kind) {
        out.push(def as Extract<ConstantDefinition, { valueKind: K }>);
      }
    }
    return out;
  }

  listByCategory(category: ConstantDefinition['category']): ConstantDefinition[] {
    return this.list().filter((d) => d.category === category);
  }
}
