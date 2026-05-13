import { useCallback } from 'react';
import type { Edge } from '@trama/core';
import { useModelStore } from '../store/index.js';

/**
 * shape params 일부를 패치해서 edge에 commit하는 헬퍼.
 *
 *   commit({ slope: 1.2 })  // 기존 params와 머지
 *
 * kind는 edge.shape.kind를 유지한다 — shape 자체를 바꾸는 selectShape와는 분리.
 * 모든 에디터가 같은 이름의 'change-shape' 메타로 history에 남긴다.
 */
export function useShapeCommit<P extends object>(
  edge: Edge,
  label = '곡선 조정',
): (patch: Partial<P>) => void {
  const updateEdge = useModelStore((s) => s.updateEdge);
  const kind = edge.shape.kind;
  const params = edge.shape.params as P;
  return useCallback(
    (patch: Partial<P>) => {
      updateEdge(
        edge.id,
        {
          shape: {
            kind,
            params: { ...params, ...patch } as Record<string, unknown>,
          },
        },
        'change-shape',
        label,
      );
    },
    [edge.id, kind, label, params, updateEdge],
  );
}

/** defaultParams로 통째 복원. Reset 버튼에서 사용. */
export function useShapeReset(
  edge: Edge,
  defaults: Record<string, unknown>,
): () => void {
  const updateEdge = useModelStore((s) => s.updateEdge);
  const kind = edge.shape.kind;
  return useCallback(() => {
    updateEdge(
      edge.id,
      { shape: { kind, params: { ...defaults } } },
      'change-shape',
      '기본값으로',
    );
  }, [defaults, edge.id, kind, updateEdge]);
}
