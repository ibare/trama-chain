import { useCallback } from 'react';
import type { Edge } from '@trama/core';
import { useTrama } from '../store/index.js';

/**
 * shape params 일부를 패치해서 edge에 commit하는 헬퍼.
 *
 *   commit({ slope: 1.2 })  // 기존 params와 머지
 *
 * kind는 edge.shape.kind를 유지한다 — shape 자체를 바꾸는 selectShape와는 분리.
 */
export function useShapeCommit<P extends object>(
  edge: Edge,
): (patch: Partial<P>) => void {
  const { modelStore } = useTrama();
  const updateEdge = modelStore((s) => s.updateEdge);
  const kind = edge.shape.kind;
  const params = edge.shape.params as P;
  return useCallback(
    (patch: Partial<P>) => {
      updateEdge(edge.id, {
        shape: {
          kind,
          params: { ...params, ...patch } as Record<string, unknown>,
        },
      });
    },
    [edge.id, kind, params, updateEdge],
  );
}

/** defaultParams로 통째 복원. Reset 버튼에서 사용. */
export function useShapeReset(
  edge: Edge,
  defaults: Record<string, unknown>,
): () => void {
  const { modelStore } = useTrama();
  const updateEdge = modelStore((s) => s.updateEdge);
  const kind = edge.shape.kind;
  return useCallback(() => {
    updateEdge(edge.id, { shape: { kind, params: { ...defaults } } });
  }, [defaults, edge.id, kind, updateEdge]);
}
