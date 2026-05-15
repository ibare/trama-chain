import type { ValueKind } from '@trama/core';
import type { ObserveVisualizationDefinition } from './types.js';

const map = new Map<string, ObserveVisualizationDefinition>();

export function registerObserveVisualization(
  def: ObserveVisualizationDefinition,
): void {
  map.set(def.key, def);
}

export function getObserveVisualization(
  key: string,
): ObserveVisualizationDefinition | undefined {
  return map.get(key);
}

export function listObserveVisualizations(): ObserveVisualizationDefinition[] {
  return Array.from(map.values());
}

/** 특정 ValueKind에 적용 가능한 시각 목록. supportedKinds가 비면 모두 통과. */
export function listObserveVisualizationsForKind(
  kind: ValueKind,
): ObserveVisualizationDefinition[] {
  return Array.from(map.values()).filter(
    (v) => v.supportedKinds.length === 0 || v.supportedKinds.includes(kind),
  );
}
