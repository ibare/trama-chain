import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { EdgeId, NodeId } from '@trama/core';

export type Selection =
  | { kind: 'none' }
  | { kind: 'node'; id: NodeId }
  | { kind: 'edge'; id: EdgeId };

export interface EdgeDraftSnap {
  toNodeId: NodeId;
  /** function·condition 등 슬롯 의미가 있는 target에서만 정의됨. ValueNode면 undefined. */
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
  /** 출력 노드가 다중 출력일 때 선택된 슬롯. 현재 단일 출력만 사용. */
  sourceSlotIndex?: number;
  /** 현재 5px 안에 잡힌 입력 소켓. null이면 미스냅 상태. */
  snap: EdgeDraftSnap | null;
  /**
   * 기존 엣지의 target end를 잡아 떼어 옮기는 중인 경우, 그 엣지의 id.
   * null이면 "처음부터 새 엣지를 그리는 중".
   */
  detachingEdgeId: EdgeId | null;
}

export interface FunctionPickerState {
  edgeId: EdgeId;
  /** 캔버스 좌표 — 화면에 띄울 위치 결정용 */
  anchor: { x: number; y: number };
}

export interface UnitInspectorState {
  nodeId: NodeId;
}

/**
 * NodePicker — 빈 캔버스 dblclick·우클릭·엣지 중간 클릭 3가지 진입을 통합한다.
 * 사용자가 칩을 고르고 "추가"를 누르기 전엔 노드도 엣지 분할도 실제로 일어나지 않는다.
 *
 * - `canvas` 진입: 단일 노드 생성. 새 노드 position = canvasPos.
 * - `edge-split` 진입: 새 노드 생성 + 원래 엣지를 두 갈래로 분할. edgeId 필수.
 */
export type NodePickerIntent =
  | {
      origin: 'canvas';
      /** 화면 좌표 — Dialog 패널 배치용 */
      screenPos: { x: number; y: number };
      /** 캔버스(SVG) 좌표 — 새 노드 position에 쓰임 */
      canvasPos: { x: number; y: number };
    }
  | {
      origin: 'edge-split';
      screenPos: { x: number; y: number };
      canvasPos: { x: number; y: number };
      edgeId: EdgeId;
    };

export interface RunFlashState {
  step: number;
  total: number;
}

export interface UIStore {
  selection: Selection;
  /**
   * 읽기 전용 모드. 호스트(Tiptap 등) 임배딩에서 마운트 어댑터가 set.
   * 진실 출처는 단일 — 이 플래그가 켜지면 mutator setter들이 일찍 no-op하고
   * 인터랙티브 진입점(노드 드래그·컨텍스트 메뉴·키보드 삭제 등)에서도 가드한다.
   * pan/zoom·셀렉션·플래시 같은 비파괴 인터랙션은 그대로 유지.
   */
  readOnly: boolean;
  /** 진행 중인 엣지 드래그 */
  edgeDraft: EdgeDraft | null;
  /** 노드 추가 패널(NodePicker) 열림 의도. 캔버스/엣지-분할 진입을 단일 상태로 통합. */
  nodePickerIntent: NodePickerIntent | null;
  /** 함수 picker 열림 상태 */
  functionPicker: FunctionPickerState | null;
  /** 단위 인스펙터 열림 상태 (선택된 노드의 단위·범위 편집) */
  unitInspector: UnitInspectorState | null;
  /**
   * 인라인 편집 중인 노드와 그 안의 어떤 영역을 편집 중인지.
   *
   * target은 노드가 자유롭게 정의하는 문자열 키 — 단일 영역만 편집하는
   * ValueNode·ConstantNode는 'body'로 두고, ExpressionNode는 'label'·'latex'를
   * 구분해 라벨 input과 fizzex editor 중 어느 쪽을 활성화할지 결정한다.
   *
   * 이 값을 단일 진실로 두면 노드 뷰가 별도 로컬 state(editTarget 등)로 동일
   * 정보를 중복 추적할 필요가 없어진다.
   */
  editingNode: { id: NodeId; target: string } | null;
  /** N-step 실행 시 현재 시각화 단계 (애니메이션용) */
  runFlash: RunFlashState | null;

  setReadOnly: (v: boolean) => void;

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

  openNodePickerAtCanvas: (
    screenPos: { x: number; y: number },
    canvasPos: { x: number; y: number },
  ) => void;
  openNodePickerAtEdge: (
    edgeId: EdgeId,
    screenPos: { x: number; y: number },
    canvasPos: { x: number; y: number },
  ) => void;
  closeNodePicker: () => void;

  openFunctionPicker: (edgeId: EdgeId, anchor: { x: number; y: number }) => void;
  closeFunctionPicker: () => void;

  openUnitInspector: (nodeId: NodeId) => void;
  closeUnitInspector: () => void;

  setEditingNode: (id: NodeId | null, target?: string) => void;
  setRunFlash: (s: RunFlashState | null) => void;
}

export type UIStoreInstance = UseBoundStore<StoreApi<UIStore>>;

export function createUIStore(): UIStoreInstance {
  return create<UIStore>((set, get) => ({
    selection: { kind: 'none' },
    readOnly: false,
    edgeDraft: null,
    nodePickerIntent: null,
    functionPicker: null,
    unitInspector: null,
    editingNode: null,
    runFlash: null,

    setReadOnly: (v) => {
      if (get().readOnly === v) return;
      if (v) {
        set({
          readOnly: true,
          edgeDraft: null,
          nodePickerIntent: null,
          functionPicker: null,
          unitInspector: null,
          editingNode: null,
        });
      } else {
        set({ readOnly: false });
      }
    },

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
    }) => {
      if (get().readOnly) return;
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
      });
    },
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

    openNodePickerAtCanvas: (screenPos, canvasPos) => {
      if (get().readOnly) return;
      set({ nodePickerIntent: { origin: 'canvas', screenPos, canvasPos } });
    },
    openNodePickerAtEdge: (edgeId, screenPos, canvasPos) => {
      if (get().readOnly) return;
      set({
        nodePickerIntent: { origin: 'edge-split', edgeId, screenPos, canvasPos },
      });
    },
    closeNodePicker: () => set({ nodePickerIntent: null }),

    openFunctionPicker: (edgeId, anchor) => {
      if (get().readOnly) return;
      set({ functionPicker: { edgeId, anchor } });
    },
    closeFunctionPicker: () => set({ functionPicker: null }),

    openUnitInspector: (nodeId) => {
      if (get().readOnly) return;
      set({ unitInspector: { nodeId } });
    },
    closeUnitInspector: () => set({ unitInspector: null }),

    setEditingNode: (id, target = 'body') => {
      if (id !== null && get().readOnly) return;
      set({ editingNode: id === null ? null : { id, target } });
    },
    setRunFlash: (s) => set({ runFlash: s }),
  }));
}

