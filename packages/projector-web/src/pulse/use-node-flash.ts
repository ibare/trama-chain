import { useSyncExternalStore } from 'react';
import type { NodeId } from '@trama/core';
import { getNodeFlashId, subscribeNodeFlash } from './node-flash-registry.js';

/**
 * 노드 flash 횟수를 구독. 반환된 숫자가 바뀔 때마다 컴포넌트가 리렌더되며
 * 그 시점에 `key`/className 토글 등으로 단일 flash 사이클을 수행한다.
 */
export function useNodeFlashId(nodeId: NodeId): number {
  return useSyncExternalStore(
    (l) => subscribeNodeFlash(nodeId, l),
    () => getNodeFlashId(nodeId),
    () => 0,
  );
}
