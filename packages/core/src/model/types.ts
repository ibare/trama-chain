import type { UnitOverride } from '../units/index.js';

export type ModelId = string;
export type NodeId = string;
export type EdgeId = string;

export type EdgeLag = 0 | 1;

/**
 * 노드 시각 스킨 — 추상 기본 형태를 도메인 친화 형상으로 대체한다.
 * core는 kind/params의 의미를 해석하지 않으며, projector가 자체 레지스트리에서
 * kind를 해석해 컴포넌트를 (lazy) 로드한다. 모델 값은 항상 스칼라로 유지되고
 * 스킨은 표면 표현만 담당한다.
 */
export interface NodeSkin {
  kind: string;
  params: Record<string, unknown>;
}

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
  /** 시각 스킨. 비어 있으면 추상 기본 형태로 그려진다. */
  skin?: NodeSkin;
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
 * 비교 연산자. 입력값을 노드 내장 threshold와 비교한다.
 */
export type ConditionOperator = '>' | '<' | '>=' | '<=' | '==' | '!=';

/**
 * 조건 노드 — 단일 입력을 노드 내장 임계값과 비교해 통과 여부를 결정하는 게이트.
 * - 입력 슬롯 1개. 연결되고 source가 valid해야 동작.
 * - `value op threshold`가 참이면 입력값을 단위까지 보존한 채 출력으로 흘려보낸다.
 *   거짓이면 출력 invalid — 다음 노드에 값이 도달하지 않는다.
 * - boolean을 만들지 않는다 — 데이터 통과 게이트 의미.
 *   참/거짓을 신호로 쓰려면 별도의 Comparator 노드(추후 도입)를 사용.
 */
export interface ConditionNode {
  kind: 'condition';
  id: NodeId;
  label: string;
  operator: ConditionOperator;
  /** 비교 임계값. 입력 단위 도메인의 raw 수치로 해석된다. */
  threshold: number;
  position: { x: number; y: number } | null;
  isFocal: boolean;
  description?: string | null;
}

/**
 * 식 노드 — LaTeX 수식을 받고 자유변수·수학 상수를 모두 입력 슬롯으로 노출.
 * - `latex`: 원본 LaTeX 문자열 (fizzex parseLatex로 AST 변환).
 * - `variables`: 식이 요구하는 바인딩 이름 배열. 슬롯 인덱스 = 배열 인덱스.
 *   자유변수(예: `x`, `y`)와 수학 상수(예: `π`, `e`) 모두를 포함한다.
 *   수학 상수도 자동 바인딩하지 않고 ConstantNode 엣지로만 값을 공급받는 정책.
 *   비결정성 회피를 위해 변수 순서가 고정된 채 저장된다.
 * - `preset`: 시스템이 포장 추가한 식(곱셈/덧셈 등)의 식별 키. 사용자가 본문을
 *   편집하면 자유식으로 전환되며 해당 필드는 제거된다. 없으면 자유식.
 * - 출력 단위는 raw.
 */
export interface ExpressionNode {
  kind: 'expression';
  id: NodeId;
  label: string;
  latex: string;
  variables: string[];
  preset?: { key: string };
  position: { x: number; y: number } | null;
  isFocal: boolean;
  description?: string | null;
}

export type Node =
  | ValueNode
  | ConstantNode
  | ConditionNode
  | ExpressionNode;

export function isValueNode(n: Node): n is ValueNode {
  return n.kind === 'value';
}
export function isConstantNode(n: Node): n is ConstantNode {
  return n.kind === 'constant';
}
export function isConditionNode(n: Node): n is ConditionNode {
  return n.kind === 'condition';
}
export function isExpressionNode(n: Node): n is ExpressionNode {
  return n.kind === 'expression';
}

export interface Edge {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  shape: { kind: string; params: Record<string, unknown> };
  inverted: boolean;
  /** 0: same-timestep instantaneous. 1: feedback to next timestep. */
  lag: EdgeLag;
  /** target이 다입력 노드(ExpressionNode)일 때 슬롯 인덱스(0-based). 단일 입력 노드에선 무시. */
  slotIndex?: number;
  /**
   * source가 다출력 노드일 때 어느 출력에서 시작한 엣지인지.
   * 현재 모든 노드가 단일 출력이라 0/생략으로 취급되지만, 향후 확장을 위해 필드는 유지.
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
