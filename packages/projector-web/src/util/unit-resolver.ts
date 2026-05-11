import {
  defaultUnitCatalog,
  resolveUnit,
  type Node,
  type ResolvedUnit,
  type UnitCatalog,
  type UnitDef,
} from '@trama/core';

const FREE_FALLBACK: ResolvedUnit = {
  id: 'free',
  kind: 'free',
  suffix: '',
  labels: [],
  min: 0,
  max: 1,
  step: 0.01,
};

/**
 * 노드의 unitId + unitOverride를 effective ResolvedUnit으로 환원.
 * 카탈로그에 없는 unitId면 free로 폴백 — 호환성 보호.
 */
export function resolveNodeUnit(
  node: Pick<Node, 'unitId' | 'unitOverride'>,
  catalog: UnitCatalog = defaultUnitCatalog,
): ResolvedUnit {
  const def = catalog.get(node.unitId);
  if (!def) return FREE_FALLBACK;
  return resolveUnit(def, node.unitOverride);
}

/** 카탈로그에서 def lookup. 없으면 undefined. */
export function getUnitDef(
  unitId: string,
  catalog: UnitCatalog = defaultUnitCatalog,
): UnitDef | undefined {
  return catalog.get(unitId);
}
