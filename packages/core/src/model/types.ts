import type { UnitOverride } from '../units/index.js';

export type ModelId = string;
export type NodeId = string;
export type EdgeId = string;

export type EdgeLag = 0 | 1;

export interface Node {
  id: NodeId;
  label: string;
  /** 카탈로그 단위 키 (예: 'kg', 'rating-10', 'confidence'). */
  unitId: string;
  /** 카탈로그 기본값을 노드별로 좁힐 때만 채운다. 비어 있으면 카탈로그 default. */
  unitOverride?: UnitOverride;
  initialValue: number;
  position: { x: number; y: number } | null;
  /** Combiner key, registered in CombinerRegistry */
  combiner: string;
  isFocal: boolean;
  description?: string | null;
}

export interface Edge {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  shape: { kind: string; params: Record<string, unknown> };
  inverted: boolean;
  /** 0: same-timestep instantaneous. 1: feedback to next timestep. */
  lag: EdgeLag;
  description?: string | null;
}

export interface ExecutionConfig {
  steps: number;
  stepUnit: string | null;
}

export interface Model {
  schemaVersion: '1';
  id: ModelId;
  question: string | null;
  execution: ExecutionConfig;
  nodes: Record<NodeId, Node>;
  edges: Record<EdgeId, Edge>;
  nodeOrder: NodeId[];
  edgeOrder: EdgeId[];
  createdAt: number;
  updatedAt: number;
}
