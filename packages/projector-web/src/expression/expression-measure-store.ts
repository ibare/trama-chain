import { create } from 'zustand';
import type { NodeId } from '@trama/core';
import type { FizzexMeasure } from './use-fizzex-renderer.js';

/**
 * 식 노드가 fizzex 렌더 후 측정한 실제 픽셀 폭·높이를 노드 id별로 보관.
 *
 * 식 노드의 bbox와 좌·우 핀 좌표는 측정값에 따라 동적으로 변하기 때문에,
 * EdgeView처럼 외부에서 핀 좌표를 다시 계산해야 하는 쪽이 측정값에 접근할
 * 단일 출처가 필요. ExpressionNodeView가 마운트 동안 set/clear를 책임진다.
 */
interface ExpressionMeasureStore {
  measures: Record<NodeId, FizzexMeasure>;
  setMeasure: (id: NodeId, size: FizzexMeasure) => void;
  clearMeasure: (id: NodeId) => void;
}

export const useExpressionMeasureStore = create<ExpressionMeasureStore>((set) => ({
  measures: {},
  setMeasure: (id, size) =>
    set((s) => {
      const prev = s.measures[id];
      if (prev && prev.width === size.width && prev.height === size.height) return {};
      return { measures: { ...s.measures, [id]: size } };
    }),
  clearMeasure: (id) =>
    set((s) => {
      if (!(id in s.measures)) return {};
      const next = { ...s.measures };
      delete next[id];
      return { measures: next };
    }),
}));
