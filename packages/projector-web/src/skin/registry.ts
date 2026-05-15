import { lazy, type LazyExoticComponent } from 'react';
import type { ResolvedUnit, ValueKind } from '@trama/core';
import type { SkinComponent, SkinDefinition } from './types.js';

const map = new Map<string, SkinDefinition>();
const lazyCache = new Map<string, LazyExoticComponent<SkinComponent>>();

export function registerSkin(def: SkinDefinition): void {
  map.set(def.key, def);
}

export function getSkin(key: string): SkinDefinition | undefined {
  return map.get(key);
}

export function listAllSkins(): SkinDefinition[] {
  return Array.from(map.values());
}

/**
 * 스킨이 주어진 단위에 적용 가능한지 — 모든 호출처가 이 헬퍼만 거치도록 한다.
 *
 * 매직 비교(`unitId === '...'`)가 여러 곳에 흩어지지 않게 SkinDomain의
 * discriminated union을 exhaustive하게 다룬다.
 */
export function isSkinApplicableToUnit(
  def: SkinDefinition,
  unit: ResolvedUnit,
): boolean {
  const d = def.domain;
  switch (d.valueKind) {
    case 'numeric':
      return d.unitId === unit.id;
    case 'numeric-any-unit':
      return true;
    case 'boolean':
      return false;
  }
}

/**
 * 주어진 numeric ResolvedUnit에 적용 가능한 스킨 목록. 단위 한정 스킨은
 * unitId가 일치해야 하고, 단위 무관(numeric-any-unit) 스킨은 항상 포함된다.
 */
export function listSkinsForUnit(unit: ResolvedUnit): SkinDefinition[] {
  return Array.from(map.values()).filter((s) => isSkinApplicableToUnit(s, unit));
}

/**
 * 주어진 ValueKind에 적용 가능한 스킨 목록. boolean ValueNode가 사용한다 —
 * boolean 스킨은 단위 개념이 없어 unitId 매칭이 불필요하다. numeric 쪽 후보는
 * numeric과 numeric-any-unit을 모두 포함한다.
 */
export function listSkinsForValueKind(kind: ValueKind): SkinDefinition[] {
  return Array.from(map.values()).filter((s) => {
    const v = s.domain.valueKind;
    if (kind === 'boolean') return v === 'boolean';
    return v === 'numeric' || v === 'numeric-any-unit';
  });
}

/**
 * key에 대응하는 React.lazy 컴포넌트를 캐싱해 돌려준다. 매 렌더에서 새 lazy가
 * 생기면 Suspense가 매번 재로딩되므로 module-scope에서 1회만 만든다.
 */
export function getLazySkin(key: string): LazyExoticComponent<SkinComponent> | null {
  const cached = lazyCache.get(key);
  if (cached) return cached;
  const def = map.get(key);
  if (!def) return null;
  const Lazy = lazy(() => def.load().then((m) => ({ default: m.Skin })));
  lazyCache.set(key, Lazy);
  return Lazy;
}
