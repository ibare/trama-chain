import { useTrama } from '../store/index.js';
import type { NodeId } from '@trama/core';

/**
 * 노드의 출력 소켓이 어딘가에 연결되어 있는지.
 * 현재 모든 노드가 단일 출력 슬롯이라 sourceSlotIndex는 0/생략 — 인자는 향후 확장용.
 */
export function useOutputConnected(nodeId: NodeId, sourceSlotIndex?: number): boolean {
  const { modelStore } = useTrama();
  return modelStore((s) => {
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (!e || e.from !== nodeId) continue;
      if (typeof sourceSlotIndex === 'number') {
        if ((e.sourceSlotIndex ?? 0) === sourceSlotIndex) return true;
      } else {
        return true;
      }
    }
    return false;
  });
}

/**
 * 노드의 입력 슬롯이 연결되어 있는지. slotIndex가 없으면 to 매칭만으로 판정.
 */
export function useInputConnected(nodeId: NodeId, slotIndex?: number): boolean {
  const { modelStore } = useTrama();
  return modelStore((s) => {
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (!e || e.to !== nodeId) continue;
      if (typeof slotIndex === 'number') {
        if (e.slotIndex === slotIndex) return true;
      } else {
        return true;
      }
    }
    return false;
  });
}

/**
 * 입력 슬롯 N개의 연결 여부를 비트마스크로 반환. 슬롯 i 연결 여부는
 * `(mask & (1 << i)) !== 0`. number 반환이라 store 비교가 안정적.
 */
export function useInputConnectionMask(nodeId: NodeId): number {
  const { modelStore } = useTrama();
  return modelStore((s) => {
    let mask = 0;
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (!e || e.to !== nodeId) continue;
      if (typeof e.slotIndex === 'number' && e.slotIndex >= 0 && e.slotIndex < 32) {
        mask |= 1 << e.slotIndex;
      }
    }
    return mask;
  });
}
