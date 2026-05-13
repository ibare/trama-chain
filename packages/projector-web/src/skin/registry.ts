import { lazy, type LazyExoticComponent } from 'react';
import type { ResolvedUnit } from '@trama/core';
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

export function listSkinsForUnit(unit: ResolvedUnit): SkinDefinition[] {
  return Array.from(map.values()).filter((s) => s.appliesTo(unit));
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
