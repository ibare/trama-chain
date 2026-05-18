import { useCallback } from 'react';
import type { NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { completeEdgeDraft } from './edge-draft-actions.js';

interface Options {
  /**
   * 활성 여부. false면 onPointerDown이 무시된다.
   * (예: 식 노드 출력이 invalid일 때 — edge draft 시작 자체를 차단.)
   */
  enabled?: boolean;
  /**
   * 엣지의 시작점 좌표를 캔버스 좌표계로 반환. 핸들러 호출 시점에 호출되므로
   * 노드 위치·layout 등 최신 상태를 그때그때 읽어 계산해야 한다.
   * 안정성이 필요하면 caller가 useCallback으로 감싼다.
   */
  getStartPoint: () => { x: number; y: number };
  /** 출력 슬롯이 여러 개인 노드에서 어느 슬롯이 시작인지. 현재 단일 출력만 사용. */
  sourceSlotIndex?: number;
}

interface Handlers {
  onPointerDown: (e: React.PointerEvent<SVGCircleElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGCircleElement>) => void;
}

/**
 * 노드 출력 소켓에서 엣지-드래프트를 시작·완료하는 핸들러 페어를 만든다.
 *
 * **모든 노드 뷰가 이 훅을 통해 소켓 인터랙션을 구성하도록 강제**하면, 다음을 한
 * 곳에서 보장할 수 있다:
 *  - pointerdown stopPropagation(NodeFrame outer `<g>` 드래그 차단)
 *  - pointer capture(SVG element 위에서 sibling으로 떠나도 move/up 유지)
 *  - alt-key → lag 1 토글
 *  - completeEdgeDraft 호출(드롭 좌표 전달)
 *
 * 노드별로 자유 구현하면 위 보장이 빠지거나 누수되기 쉬워 통합 추상으로 강제.
 */
export function useEdgeDraftSource(nodeId: NodeId, opts: Options): Handlers {
  const instance = useTrama();
  const { uiStore, timeSettingsStore } = instance;
  const startEdgeDraft = uiStore((s) => s.startEdgeDraft);
  const { enabled = true, getStartPoint, sourceSlotIndex } = opts;

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (!enabled) return;
      // 재생 중에는 엣지 편집이 잠겨 있으므로 draft 시작 자체를 차단.
      if (!timeSettingsStore.getState().paused) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      const startPoint = getStartPoint();
      startEdgeDraft({
        fromNodeId: nodeId,
        startPoint,
        pointer: startPoint,
        lag,
        sourceSlotIndex,
      });
    },
    [enabled, getStartPoint, nodeId, sourceSlotIndex, startEdgeDraft, timeSettingsStore],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      completeEdgeDraft(instance, { dropScreen: { x: e.clientX, y: e.clientY } });
    },
    [instance],
  );

  return { onPointerDown, onPointerUp };
}
