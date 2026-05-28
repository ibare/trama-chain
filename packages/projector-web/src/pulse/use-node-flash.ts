import { useSyncExternalStore } from 'react';
import type { NodeId } from '@trama-chain/core';
import { useTrama } from '../store/index.js';

/**
 * 노드 flash 횟수를 구독. 반환된 숫자가 바뀔 때마다 컴포넌트가 리렌더되며
 * 그 시점에 `key`/className 토글 등으로 단일 flash 사이클을 수행한다.
 */
export function useNodeFlashId(nodeId: NodeId): number {
  const { nodeFlashRegistry } = useTrama();
  return useSyncExternalStore(
    (l) => nodeFlashRegistry.subscribe(nodeId, l),
    () => nodeFlashRegistry.getFlashId(nodeId),
    () => 0,
  );
}
