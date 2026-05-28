import { lazy, type LazyExoticComponent } from 'react';
import type { ResolvedUnit, ValueKind } from '@trama-chain/core';
import type {
  BooleanSkinComponent,
  BooleanSkinDefinition,
  NumericSkinComponent,
  NumericSkinDefinition,
  SkinDefinition,
} from './types.js';

const map = new Map<string, SkinDefinition>();
const numericLazyCache = new Map<string, LazyExoticComponent<NumericSkinComponent>>();
const booleanLazyCache = new Map<string, LazyExoticComponent<BooleanSkinComponent>>();

// Overload — TS 가 union 좁힘 시 load() 의 함수 contravariance 때문에 양쪽
// 도메인의 인자 교집합을 요구하는 문제를 피한다. 호출처는 numeric/boolean
// definition 중 하나로 호출하므로 정확한 도메인 시그니처가 좁혀진다.
export function registerSkin(def: NumericSkinDefinition): void;
export function registerSkin(def: BooleanSkinDefinition): void;
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
 * numeric 스킨용 lazy 컴포넌트를 캐싱해 돌려준다. valueKind 가 'numeric'/
 * 'numeric-any-unit' 인 정의가 아니면 null 을 반환해 호출처에서 폴백을 그릴 수
 * 있게 한다. 매 렌더에서 새 lazy가 생기면 Suspense가 매번 재로딩되므로
 * module-scope에서 1회만 만든다.
 */
export function getLazyNumericSkin(
  key: string,
): LazyExoticComponent<NumericSkinComponent> | null {
  const cached = numericLazyCache.get(key);
  if (cached) return cached;
  const def = map.get(key);
  if (!def) return null;
  if (def.domain.valueKind === 'boolean') return null;
  const numericDef = def as NumericSkinDefinition;
  const Lazy = lazy(() => numericDef.load().then((m) => ({ default: m.Skin })));
  numericLazyCache.set(key, Lazy);
  return Lazy;
}

/**
 * boolean 스킨용 lazy 컴포넌트. domain.valueKind 가 'boolean' 이 아닌 정의는
 * null 을 반환한다.
 */
export function getLazyBooleanSkin(
  key: string,
): LazyExoticComponent<BooleanSkinComponent> | null {
  const cached = booleanLazyCache.get(key);
  if (cached) return cached;
  const def = map.get(key);
  if (!def) return null;
  if (def.domain.valueKind !== 'boolean') return null;
  const booleanDef = def as BooleanSkinDefinition;
  const Lazy = lazy(() => booleanDef.load().then((m) => ({ default: m.Skin })));
  booleanLazyCache.set(key, Lazy);
  return Lazy;
}
