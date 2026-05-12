import {
  defaultUnitCatalog,
  resolveUnit,
  type ResolvedUnit,
  type UnitCatalog,
  type UnitDef,
  type UnitOverride,
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
 * ValueNode만 단위를 가진다. FunctionNode는 호출 전에 outputUnitId/Override를
 * 풀어서 별도 헬퍼로 처리한다(또는 호출부에서 직접 resolveUnit).
 */
export function resolveNodeUnit(
  node: Pick<ValueNode, 'unitId' | 'unitOverride'>,
  catalog: UnitCatalog = defaultUnitCatalog,
): ResolvedUnit {
  const def = catalog.get(node.unitId);
  if (!def) return FREE_FALLBACK;
  return resolveUnit(def, node.unitOverride);
}

/**
 * 함수 노드의 출력 단위 환원. outputUnitId가 없으면 free로 폴백.
 */
export function resolveFunctionOutputUnit(
  outputUnitId: string | undefined,
  outputUnitOverride: UnitOverride | undefined,
  catalog: UnitCatalog = defaultUnitCatalog,
): ResolvedUnit {
  if (!outputUnitId) return FREE_FALLBACK;
  const def = catalog.get(outputUnitId);
  if (!def) return FREE_FALLBACK;
  return resolveUnit(def, outputUnitOverride);
}

/** 카탈로그에서 def lookup. 없으면 undefined. */
export function getUnitDef(
  unitId: string,
  catalog: UnitCatalog = defaultUnitCatalog,
): UnitDef | undefined {
  return catalog.get(unitId);
}
