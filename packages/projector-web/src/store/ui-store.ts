import { create } from 'zustand';
import type { EdgeId, NodeId } from '@trama/core';

export type Selection =
  | { kind: 'none' }
  | { kind: 'node'; id: NodeId }
  | { kind: 'edge'; id: EdgeId };

export interface EdgeDraft {
  fromNodeId: NodeId;
  /** 출발 소켓의 캔버스 좌표 (source 우측 핀 소켓) */
  startPoint: { x: number; y: number };
  /** 캔버스 좌표계의 현재 포인터 위치 */
  pointer: { x: number; y: number };
  /** Alt 키 등으로 사용자가 feedback 엣지를 그리겠다고 표시 */
  lag: 0 | 1;
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
  /** 인라인 이름 편집 중인 노드 */
  editingNodeId: NodeId | null;
  /** N-step 실행 시 현재 시각화 단계 (애니메이션용) */
  runFlash: RunFlashState | null;

  selectNode: (id: NodeId) => void;
  selectEdge: (id: EdgeId) => void;
  clearSelection: () => void;

  startEdgeDraft: (
    fromNodeId: NodeId,
    startPoint: { x: number; y: number },
    pointer: { x: number; y: number },
    lag?: 0 | 1,
  ) => void;
  updateEdgeDraft: (pointer: { x: number; y: number }, lag?: 0 | 1) => void;
  endEdgeDraft: () => void;

  startInsertNodeFromEdge: (edgeId: EdgeId, position: { x: number; y: number }) => void;
  clearInsertNodeIntent: () => void;

  openFunctionPicker: (edgeId: EdgeId, anchor: { x: number; y: number }) => void;
  closeFunctionPicker: () => void;

  setEditingNode: (id: NodeId | null) => void;
  setRunFlash: (s: RunFlashState | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selection: { kind: 'none' },
  edgeDraft: null,
  insertNodeIntent: null,
  functionPicker: null,
  editingNodeId: null,
  runFlash: null,

  selectNode: (id) => set({ selection: { kind: 'node', id } }),
  selectEdge: (id) => set({ selection: { kind: 'edge', id } }),
  clearSelection: () => set({ selection: { kind: 'none' } }),

  startEdgeDraft: (fromNodeId, startPoint, pointer, lag = 0) =>
    set({ edgeDraft: { fromNodeId, startPoint, pointer, lag } }),
  updateEdgeDraft: (pointer, lag) =>
    set((s) =>
      s.edgeDraft ? { edgeDraft: { ...s.edgeDraft, pointer, lag: lag ?? s.edgeDraft.lag } } : {},
    ),
  endEdgeDraft: () => set({ edgeDraft: null }),

  startInsertNodeFromEdge: (edgeId, position) =>
    set({ insertNodeIntent: { edgeId, position } }),
  clearInsertNodeIntent: () => set({ insertNodeIntent: null }),

  openFunctionPicker: (edgeId, anchor) => set({ functionPicker: { edgeId, anchor } }),
  closeFunctionPicker: () => set({ functionPicker: null }),

  setEditingNode: (id) => set({ editingNodeId: id }),
  setRunFlash: (s) => set({ runFlash: s }),
}));
