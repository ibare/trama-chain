import type { NodeId } from '@trama/core';
import { tokens } from '@trama/tokens';

/**
 * 노드 flash 트리거 레지스트리.
 *
 * trigger(nodeId) 호출 시 그 노드의 *flashId*를 증가시킨다. 노드 뷰는 자신의
 * flashId를 구독해 값이 바뀔 때마다 단일 flash 사이클을 수행 (CSS keyframe).
 *
 * 토큰: durationNodeFlash (감쇠 총 시간), easingNodeFlash. flashUntil 시점 트래킹은
 * 필요 없음 — CSS animation iteration이 자체 종료.
 *
 * subscribe(nodeId, listener)는 React useSyncExternalStore에 직접 쓰기 좋게
 * snapshot 함수와 함께 노출된다.
 */
export const NODE_FLASH_DURATION_MS = parseFloat(tokens.motion.durationNodeFlash);

type Listener = () => void;

const flashIds = new Map<NodeId, number>();
const listenersByNode = new Map<NodeId, Set<Listener>>();

export function triggerNodeFlash(nodeId: NodeId): void {
  flashIds.set(nodeId, (flashIds.get(nodeId) ?? 0) + 1);
  const set = listenersByNode.get(nodeId);
  if (set) for (const fn of set) fn();
}

export function getNodeFlashId(nodeId: NodeId): number {
  return flashIds.get(nodeId) ?? 0;
}

export function subscribeNodeFlash(nodeId: NodeId, listener: Listener): () => void {
  let set = listenersByNode.get(nodeId);
  if (!set) {
    set = new Set();
    listenersByNode.set(nodeId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listenersByNode.delete(nodeId);
  };
}
