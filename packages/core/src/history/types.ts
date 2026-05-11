import type { Edge, Model, Node, NodeId, EdgeId } from '../model/index.js';

/**
 * Operation은 *invertible* 형태. before/after 스냅샷을 들고 있다가
 * undo 시 before를, redo 시 after를 적용한다.
 *
 * 모델 전체 스냅샷을 들고 있는 게 가장 단순하고 안전 (copy-on-write로 메모리 부담 없음).
 * v1은 이 방식으로 시작.
 */
export type OperationKind =
  | 'add-node'
  | 'remove-node'
  | 'update-node'
  | 'add-edge'
  | 'remove-edge'
  | 'update-edge'
  | 'set-execution'
  | 'set-question'
  | 'scrub-value'
  | 'rename-node'
  | 'move-node'
  | 'change-shape'
  | 'change-combiner'
  | 'change-lag';

export interface Operation {
  kind: OperationKind;
  /** 이 op이 만든 변화에 대한 사람이 읽을 라벨 (UI에 노출 가능) */
  label: string;
  /** 모델 상태 before */
  before: Model;
  /** 모델 상태 after */
  after: Model;
  /** 부수 정보 (값 스크럽이라면 어느 노드인지 등) */
  meta?: {
    nodeId?: NodeId;
    edgeId?: EdgeId;
    node?: Node;
    edge?: Edge;
  };
}
