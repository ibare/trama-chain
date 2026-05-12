import { create } from 'zustand';
import type { EdgeId, NodeId } from '@trama/core';

export type Selection =
  | { kind: 'none' }
  | { kind: 'node'; id: NodeId }
  | { kind: 'edge'; id: EdgeId };

export interface EdgeDraftSnap {
  toNodeId: NodeId;
  /** function·conditional 등 슬롯 의미가 있는 target에서만 정의됨. ValueNode면 undefined. */
  slotIndex?: number;
  /** 캔버스 좌표 — 소켓 중심 */
  point: { x: number; y: number };
}

export interface EdgeDraft {
  fromNodeId: NodeId;
  /** 출발 소켓의 캔버스 좌표 (source 우측 핀 소켓) */
  startPoint: { x: number; y: number };
  /** 캔버스 좌표계의 현재 포인터 위치 — 스냅이 잡혀 있어도 실제 커서는 여기에. */
  pointer: { x: number; y: number };
  /** Alt 키 등으로 사용자가 feedback 엣지를 그리겠다고 표시 */
  lag: 0 | 1;
  /** 출력 노드가 다중 출력일 때 선택된 슬롯 (Conditional 참/거짓). */
  sourceSlotIndex?: number;
  /** 현재 5px 안에 잡힌 입력 소켓. null이면 미스냅 상태. */
  snap: EdgeDraftSnap | null;
  /**
   * 기존 엣지의 target end를 잡아 떼어 옮기는 중인 경우, 그 엣지의 id.
   * null이면 "처음부터 새 엣지를 그리는 중".
   */
  detachingEdgeId: EdgeId | null;
}

export interface InsertNodeFromEdgeIntent {
  edgeId: EdgeId;
  /** 클릭 위치 (캔버스 좌표) */
  position: { x: number; y: number };
}

export interface FunctionPickerState {
  edgeId: EdgeId;
  /** 캔버스 좌표 — 화면에 띄울 위치 결정용 */
  anchor: { x: number; y: number };
}

export interface UnitInspectorState {
  nodeId: NodeId;
}

export interface CanvasContextMenuState {
  /** 화면 좌표 — 메뉴 div 배치용 */
  screen: { x: number; y: number };
  /** 캔버스(SVG) 좌표 — 새로 만드는 노드의 position에 쓰임 */
  canvas: { x: number; y: number };
}

export interface RunFlashState {
  step: number;
  total: number;
}

export interface UIStore {
  selection: Selection;
  /** 진행 중인 엣지 드래그 */
  edgeDraft: EdgeDraft | null;
  /** 엣지에 새 노드 끼워넣기 의도 */
  insertNodeIntent: InsertNodeFromEdgeIntent | null;
  /** 함수 picker 열림 상태 */
  functionPicker: FunctionPickerState | null;
  /** 단위 인스펙터 열림 상태 (선택된 노드의 단위·범위 편집) */
  unitInspector: UnitInspectorState | null;
  /** 캔버스 우클릭 컨텍스트 메뉴 */
  canvasContextMenu: CanvasContextMenuState | null;
  /** 인라인 이름 편집 중인 노드 */
  editingNodeId: NodeId | null;
  /** N-step 실행 시 현재 시각화 단계 (애니메이션용) */
  runFlash: RunFlashState | null;

  selectNode: (id: NodeId) => void;
  selectEdge: (id: EdgeId) => void;
  clearSelection: () => void;

  startEdgeDraft: (input: {
    fromNodeId: NodeId;
    startPoint: { x: number; y: number };
    pointer: { x: number; y: number };
    lag?: 0 | 1;
    sourceSlotIndex?: number;
    detachingEdgeId?: EdgeId;
  }) => void;
  updateEdgeDraft: (patch: {
    pointer?: { x: number; y: number };
    lag?: 0 | 1;
    snap?: EdgeDraftSnap | null;
  }) => void;
  endEdgeDraft: () => void;

  startInsertNodeFromEdge: (edgeId: EdgeId, position: { x: number; y: number }) => void;
  clearInsertNodeIntent: () => void;

  openFunctionPicker: (edgeId: EdgeId, anchor: { x: number; y: number }) => void;
  closeFunctionPicker: () => void;

  openUnitInspector: (nodeId: NodeId) => void;
  closeUnitInspector: () => void;

  openCanvasContextMenu: (
    screen: { x: number; y: number },
    canvas: { x: number; y: number },
  ) => void;
  closeCanvasContextMenu: () => void;

  setEditingNode: (id: NodeId | null) => void;
  setRunFlash: (s: RunFlashState | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selection: { kind: 'none' },
  edgeDraft: null,
  insertNodeIntent: null,
  functionPicker: null,
  unitInspector: null,
  canvasContextMenu: null,
  editingNodeId: null,
  runFlash: null,

  selectNode: (id) => set({ selection: { kind: 'node', id } }),
  selectEdge: (id) => set({ selection: { kind: 'edge', id } }),
  clearSelection: () => set({ selection: { kind: 'none' } }),

  startEdgeDraft: ({
    fromNodeId,
    startPoint,
    pointer,
    lag = 0,
    sourceSlotIndex,
    detachingEdgeId,
  }) =>
    set({
      edgeDraft: {
        fromNodeId,
        startPoint,
        pointer,
        lag,
        sourceSlotIndex,
        snap: null,
        detachingEdgeId: detachingEdgeId ?? null,
      },
    }),
  updateEdgeDraft: (patch) =>
    set((s) => {
      if (!s.edgeDraft) return {};
      const next = { ...s.edgeDraft };
      if (patch.pointer) next.pointer = patch.pointer;
      if (patch.lag !== undefined) next.lag = patch.lag;
      if (patch.snap !== undefined) next.snap = patch.snap;
      return { edgeDraft: next };
    }),
  endEdgeDraft: () => set({ edgeDraft: null }),

  startInsertNodeFromEdge: (edgeId, position) =>
    set({ insertNodeIntent: { edgeId, position } }),
  clearInsertNodeIntent: () => set({ insertNodeIntent: null }),

  openFunctionPicker: (edgeId, anchor) => set({ functionPicker: { edgeId, anchor } }),
  closeFunctionPicker: () => set({ functionPicker: null }),

  openUnitInspector: (nodeId) => set({ unitInspector: { nodeId } }),
  closeUnitInspector: () => set({ unitInspector: null }),

  openCanvasContextMenu: (screen, canvas) =>
    set({ canvasContextMenu: { screen, canvas } }),
  closeCanvasContextMenu: () => set({ canvasContextMenu: null }),

  setEditingNode: (id) => set({ editingNodeId: id }),
  setRunFlash: (s) => set({ runFlash: s }),
}));
