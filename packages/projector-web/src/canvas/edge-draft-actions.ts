import { isValueNode } from '@trama/core';
import type { TramaInstance } from '../store/trama-instance.js';

/**
 * 진행 중인 edge draft를 완료한다.
 *
 * - 새 엣지 그리는 중(`detachingEdgeId === null`):
 *   - snap이 잡혀 있으면 addEdge → 성공 시 value→value 사이엔 function picker.
 *   - snap이 없으면 아무것도 안 함(빈 공간 드롭).
 * - 기존 엣지를 떼는 중(`detachingEdgeId !== null`):
 *   - snap이 있고 원래 target과 다르면 updateEdge(`to`, `slotIndex`).
 *   - snap이 있고 원래 target과 같으면 no-op(원위치).
 *   - snap이 없으면 removeEdge.
 *
 * 어떤 경로든 마지막에 `endEdgeDraft()`.
 */
export function completeEdgeDraft(
  instance: TramaInstance,
  opts?: { dropScreen?: { x: number; y: number } },
): void {
  const ui = instance.uiStore.getState();
  const draft = ui.edgeDraft;
  if (!draft) return;

  const { fromNodeId, lag, sourceSlotIndex, snap, detachingEdgeId } = draft;
  const modelStore = instance.modelStore.getState();
  const model = modelStore.model;

  if (detachingEdgeId) {
    const edge = model.edges[detachingEdgeId];
    if (!edge) {
      ui.endEdgeDraft();
      return;
    }
    if (snap) {
      const sameTarget =
        snap.toNodeId === edge.to &&
        (snap.slotIndex ?? undefined) === (edge.slotIndex ?? undefined);
      if (!sameTarget) {
        modelStore.updateEdge(detachingEdgeId, {
          to: snap.toNodeId,
          slotIndex: snap.slotIndex,
        });
      }
    } else {
      modelStore.removeEdge(detachingEdgeId);
    }
    ui.endEdgeDraft();
    return;
  }

  // 새 엣지
  if (snap && snap.toNodeId !== fromNodeId) {
    const targetNode = model.nodes[snap.toNodeId];
    const created = modelStore.addEdge({
      from: fromNodeId,
      to: snap.toNodeId,
      shape: { kind: 'none', params: {} },
      lag,
      slotIndex: snap.slotIndex,
      sourceSlotIndex,
    });
    // ValueNode→ValueNode 사이엔 함수가 필요하다는 신호로 function picker 자동 오픈.
    // (값에서 값으로 가는 직접 엣지는 보통 함수 노드 삽입을 거친다는 v1 메타포.)
    if (created && opts?.dropScreen) {
      const fromNode = model.nodes[fromNodeId];
      const fromIsValue = fromNode && isValueNode(fromNode);
      const targetIsBranching = targetNode && targetNode.kind === 'condition';
      if (fromIsValue && !targetIsBranching) {
        ui.openFunctionPicker(created.id, opts.dropScreen);
      }
    }
  }
  ui.endEdgeDraft();
}
