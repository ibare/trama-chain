import type { EdgeId } from '@trama/core';
import type { Cable } from './cable-physics.js';

/**
 * 엣지별 *현재* 케이블 인스턴스 레지스트리. EdgeView가 mount 시 자신의 Cable을
 * 등록하고 unmount/엣지 제거 시 해제한다. PulseLayer 등 매 프레임 케이블 좌표가
 * 필요한 소비자가 여기를 통해 읽는다.
 *
 * Cable 자체를 보관하므로 polyline 점배열을 별도로 캐시할 필요가 없다 —
 * 호출자가 cablePointAt(cable, t)를 직접 호출하면 그 시점의 좌표를 얻는다.
 */
export interface CableRegistry {
  register(edgeId: EdgeId, cable: Cable): () => void;
  get(edgeId: EdgeId): Cable | undefined;
}

export function createCableRegistry(): CableRegistry {
  const cables = new Map<EdgeId, Cable>();
  return {
    register(edgeId, cable): () => void {
      cables.set(edgeId, cable);
      return () => {
        if (cables.get(edgeId) === cable) cables.delete(edgeId);
      };
    },
    get(edgeId): Cable | undefined {
      return cables.get(edgeId);
    },
  };
}

