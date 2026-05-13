import {
  defaultUnitCatalog,
  resolveUnit,
  type ResolvedUnit,
  type UnitCatalog,
  type UnitDef,
  type ValueNode,
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
 * 카탈로그에 없는 unitId면 free로 폴백.
 *
 * ValueNode만 단위를 가진다. 식·상수·조건 노드의 출력은 raw로 흐르므로 별도 헬퍼 불필요.
 */
export function resolveNodeUnit(
  node: Pick<ValueNode, 'unitId' | 'unitOverride'>,
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
