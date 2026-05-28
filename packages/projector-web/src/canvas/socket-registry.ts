import type { NodeId } from '@trama-chain/core';

/**
 * 입력 소켓(엣지 target 후보) 좌표 레지스트리.
 *
 * 엣지 드래프트가 진행 중일 때 "지금 커서 가까이에 어떤 입력 소켓이 있는가?"를
 * 5px 스냅 판정에 쓰기 위해 둔다. 좌표는 노드 중심 기준의 정적 offset만 저장하고,
 * 절대 캔버스 좌표는 질의 시점에 model의 노드 position과 합쳐 구한다.
 *
 * 이렇게 분리한 이유: 노드 이동 중에도 model.position이 변하면 자동으로 최신 좌표가
 * 잡힌다. 등록·해제는 마운트/언마운트 라이프사이클로만 관리하면 된다.
 *
 * slotIndex가 `undefined`이면 "특정 슬롯이 없는" 입력(예: ValueNode의 좌측 핀
 * 묶음). 함수 노드·조건 노드는 슬롯별로 개별 등록.
 */
export interface InputSocketEntry {
  nodeId: NodeId;
  slotIndex?: number;
  offset: { x: number; y: number };
}

export interface SnapCandidate {
  entry: InputSocketEntry;
  /** 캔버스 좌표 — 노드 position + offset 결과 */
  point: { x: number; y: number };
  /** 캔버스 좌표 기준 거리 */
  distance: number;
}

export interface SocketRegistry {
  register(entry: InputSocketEntry): () => void;
  findNearest(
    canvasPoint: { x: number; y: number },
    nodePositions: Record<NodeId, { x: number; y: number } | undefined>,
    filter?: (entry: InputSocketEntry) => boolean,
  ): SnapCandidate | null;
}

function keyFor(nodeId: NodeId, slotIndex: number | undefined): string {
  return slotIndex === undefined ? `${nodeId}:*` : `${nodeId}:${slotIndex}`;
}

export function createSocketRegistry(): SocketRegistry {
  const sockets = new Map<string, InputSocketEntry>();

  return {
    register(entry: InputSocketEntry): () => void {
      const k = keyFor(entry.nodeId, entry.slotIndex);
      sockets.set(k, entry);
      return () => {
        if (sockets.get(k) === entry) sockets.delete(k);
      };
    },
    findNearest(
      canvasPoint,
      nodePositions,
      filter,
    ): SnapCandidate | null {
      let best: SnapCandidate | null = null;
      for (const entry of sockets.values()) {
        if (filter && !filter(entry)) continue;
        const nodePos = nodePositions[entry.nodeId];
        if (!nodePos) continue;
        const pt = { x: nodePos.x + entry.offset.x, y: nodePos.y + entry.offset.y };
        const dx = pt.x - canvasPoint.x;
        const dy = pt.y - canvasPoint.y;
        const d = Math.hypot(dx, dy);
        if (best === null || d < best.distance) {
          best = { entry, point: pt, distance: d };
        }
      }
      return best;
    },
  };
}

