import {
  defaultUnitCatalog,
  isNumericValue,
  resolveUnit,
  type ResolvedUnit,
  type UnitCatalog,
  type UnitDef,
  type ValueNode,
} from '@trama-chain/core';

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
 * 노드의 initialValue.unitId + unitOverride를 effective ResolvedUnit으로 환원.
 * 카탈로그에 없는 unitId면 free로 폴백. boolean ValueNode는 단위 개념이 없어서 free 폴백.
 *
 * ValueNode만 단위를 가진다. 식·상수·조건 노드의 출력은 raw로 흐르므로 별도 헬퍼 불필요.
 */
export function resolveNodeUnit(
  node: Pick<ValueNode, 'initialValue' | 'unitOverride'>,
  catalog: UnitCatalog = defaultUnitCatalog,
): ResolvedUnit {
  if (!isNumericValue(node.initialValue)) return FREE_FALLBACK;
  const def = catalog.get(node.initialValue.unitId);
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
