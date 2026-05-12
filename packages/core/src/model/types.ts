import type { UnitOverride } from '../units/index.js';

export type ModelId = string;
export type NodeId = string;
export type EdgeId = string;

export type EdgeLag = 0 | 1;

export interface ValueNode {
  kind: 'value';
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

export interface FunctionNode {
  kind: 'function';
  id: NodeId;
  label: string;
  /** FunctionRegistry 키 (예: 'multiply', 'add'). */
  functionKey: string;
  /** 출력 단위. 함수가 자동 도출하지 못하거나 사용자가 덮어쓸 때 채움. */
  outputUnitId?: string;
  outputUnitOverride?: UnitOverride;
  position: { x: number; y: number } | null;
  isFocal: boolean;
  description?: string | null;
}

/**
 * 상수 노드 — 사용자/카탈로그가 부여한 고정 수치.
 * - `value`: 실행 시 항상 사용되는 수치 (π·g 등 카탈로그 값 또는 사용자 임의 수).
 * - `constantKey`: 카탈로그 항목 식별자. 사용자 정의 임의 수면 비어있다.
 * - 단위는 raw 통과 — 하류 ValueNode는 자동 단위 폴백.
 */
export interface ConstantNode {
  kind: 'constant';
  id: NodeId;
  label: string;
  value: number;
  constantKey?: string;
  position: { x: number; y: number } | null;
  isFocal: boolean;
  description?: string | null;
}

/**
 * 비교 연산자. A·B 두 입력에 대해 어느 식으로 비교할지.
 */
export type ConditionalOperator = '>' | '==' | '!=';

/**
 * 조건 노드 — A·B 두 입력을 비교해 A의 값을 참/거짓 두 출력 슬롯 중 하나로 라우팅.
 * - slot 0(A) / slot 1(B) 입력. 둘 다 연결돼야 valid.
 * - 출력 슬롯 0(참) / 1(거짓). 한 시점에 하나만 valid이며 값은 둘 다 A의 값.
 * - boolean을 만들지 않는다 — 분기 라우터 의미.
 */
export interface ConditionalNode {
  kind: 'conditional';
  id: NodeId;
  label: string;
  operator: ConditionalOperator;
  position: { x: number; y: number } | null;
  isFocal: boolean;
  description?: string | null;
}

export type Node = ValueNode | FunctionNode | ConstantNode | ConditionalNode;

export function isValueNode(n: Node): n is ValueNode {
  return n.kind === 'value';
}
export function isFunctionNode(n: Node): n is FunctionNode {
  return n.kind === 'function';
}
export function isConstantNode(n: Node): n is ConstantNode {
  return n.kind === 'constant';
}
export function isConditionalNode(n: Node): n is ConditionalNode {
  return n.kind === 'conditional';
}

export interface Edge {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  shape: { kind: string; params: Record<string, unknown> };
  inverted: boolean;
  /** 0: same-timestep instantaneous. 1: feedback to next timestep. */
  lag: EdgeLag;
  /** target이 FunctionNode일 때 슬롯 인덱스(0-based). ValueNode target에선 무시. */
  slotIndex?: number;
  /**
   * source가 다출력 노드(예: ConditionalNode — 0=참, 1=거짓)일 때 어느 출력에서 시작한
   * 엣지인지. 단일 출력 노드(value·function·constant)에선 무시되고 0으로 취급.
   */
  sourceSlotIndex?: number;
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
