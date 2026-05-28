import type { EdgeId, NodeId } from '@trama-chain/core';

/**
 * 드래그 중 React 사이클을 우회해 SVG DOM을 직접 갱신하기 위한 핸들 레지스트리.
 *
 * 일반 흐름은 step 3의 좁은 셀렉터로도 충분히 성능이 나오지만, 한 노드의 인접
 * 엣지가 수십~수백 개인 dense 그래프에서는 매 mousemove의 React 리렌더조차
 * 비용이 커질 수 있다. 이 레지스트리는 그런 경우에 노드 <g>의 transform과
 * 엣지 <path>의 d를 setAttribute로 직접 갱신할 수 있게 한다.
 *
 * 핸들은 EdgeView가 등록한다. NodeView body 드래그 핸들러는 drag 시작 시
 * 자기 노드 + 인접 엣지 핸들을 캐시한 뒤, pointermove마다 직접 호출한다.
 * pointerup에서 model.position을 한 번 commit하면 React가 declarative하게
 * 다시 그려 imperative 상태를 자연스럽게 덮어쓴다.
 */
export interface EdgeHandle {
  /** 드래그된 노드의 누적 오프셋(dx, dy)에 맞춰 path/arrow/hit-path d를 즉시 갱신. */
  applyDrag(draggedNodeId: NodeId, dx: number, dy: number): void;
}

export interface DragRegistry {
  registerNodeEl(id: NodeId, el: SVGGElement): () => void;
  getNodeEl(id: NodeId): SVGGElement | undefined;
  registerEdgeHandle(
    id: EdgeId,
    fromId: NodeId,
    toId: NodeId,
    handle: EdgeHandle,
  ): () => void;
  getIncidentEdgeHandles(nodeId: NodeId): EdgeHandle[];
}

export function createDragRegistry(): DragRegistry {
  const nodeEls = new Map<NodeId, SVGGElement>();
  const edgeHandles = new Map<EdgeId, EdgeHandle>();
  const incidentEdgesByNode = new Map<NodeId, Set<EdgeId>>();

  return {
    registerNodeEl(id, el): () => void {
      nodeEls.set(id, el);
      return () => {
        if (nodeEls.get(id) === el) nodeEls.delete(id);
      };
    },
    getNodeEl(id): SVGGElement | undefined {
      return nodeEls.get(id);
    },
    registerEdgeHandle(id, fromId, toId, handle): () => void {
      edgeHandles.set(id, handle);
      let fromSet = incidentEdgesByNode.get(fromId);
      if (!fromSet) {
        fromSet = new Set();
        incidentEdgesByNode.set(fromId, fromSet);
      }
      fromSet.add(id);
      let toSet = incidentEdgesByNode.get(toId);
      if (!toSet) {
        toSet = new Set();
        incidentEdgesByNode.set(toId, toSet);
      }
      toSet.add(id);
      return () => {
        if (edgeHandles.get(id) === handle) edgeHandles.delete(id);
        incidentEdgesByNode.get(fromId)?.delete(id);
        incidentEdgesByNode.get(toId)?.delete(id);
      };
    },
    getIncidentEdgeHandles(nodeId): EdgeHandle[] {
      const set = incidentEdgesByNode.get(nodeId);
      if (!set) return [];
      const out: EdgeHandle[] = [];
      for (const eid of set) {
        const h = edgeHandles.get(eid);
        if (h) out.push(h);
      }
      return out;
    },
  };
}

