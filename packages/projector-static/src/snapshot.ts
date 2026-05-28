import type { CapturedExecValue, NodeId, NodeSnapshot } from '@trama-chain/core';

/**
 * NodeSnapshot 의 출력 슬롯 유효성 키 포맷은 `${nodeId}:${slot}` — captureSnapshot
 * 이 생성한 형태와 동일. validSlots/pendingSlots 는 정렬된 배열이므로 Set 화 비용을
 * 한 번만 치르도록 헬퍼로 캐싱한다.
 */
export interface SlotIndex {
  valid: Set<string>;
  pending: Set<string>;
}

export function buildSlotIndex(snapshot: NodeSnapshot): SlotIndex {
  return {
    valid: new Set(snapshot.validSlots),
    pending: new Set(snapshot.pendingSlots),
  };
}

export function slotKey(nodeId: NodeId, slot: number): string {
  return `${nodeId}:${slot}`;
}

export function isSlotValid(idx: SlotIndex, nodeId: NodeId, slot = 0): boolean {
  return idx.valid.has(slotKey(nodeId, slot));
}

export function isSlotPending(idx: SlotIndex, nodeId: NodeId, slot = 0): boolean {
  return idx.pending.has(slotKey(nodeId, slot));
}

/**
 * CapturedExecValue 에서 numeric 값을 끄집어낸다. 직접 numeric 이거나 wrapped 의
 * value 가 numeric 인 경우만 숫자를 반환. boolean·sequence·wrapped(boolean) 은
 * 단일 숫자로 환원되지 않으므로 null.
 */
export function getCapturedNumeric(captured: CapturedExecValue | undefined): number | null {
  if (!captured) return null;
  if (captured.kind === 'numeric') return captured.n;
  if (captured.kind === 'wrapped' && captured.value.kind === 'numeric') {
    return captured.value.n;
  }
  return null;
}

export function getCapturedBoolean(captured: CapturedExecValue | undefined): boolean | null {
  if (!captured) return null;
  if (captured.kind === 'boolean') return captured.b;
  if (captured.kind === 'wrapped' && captured.value.kind === 'boolean') {
    return captured.value.b;
  }
  return null;
}
