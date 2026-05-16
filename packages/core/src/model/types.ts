import type { UnitOverride } from '../units/index.js';
import type { Value } from './value.js';

export type ModelId = string;
export type NodeId = string;
export type EdgeId = string;

export type EdgeLag = 0 | 1;

/**
 * 노드 디스플레이 모드 — standard는 패널 안에 모든 요소를 담는 풀 카드,
 * compact는 패널을 데이터 디스플레이로 순수화해 외곽 부속(라벨/슬롯/컨트롤)을
 * 분리한다. 각 kind에는 기본 모드가 있고, 노드 인스턴스에서 이 필드로
 * 오버라이드한다. 비어 있으면 기본 모드를 따른다.
 *
 * compact spec이 정의된 kind(value-boolean / constant / generator / logic-gate)
 * 에서만 의미가 있고, 다른 kind는 무시된다.
 */
export type NodeDisplayMode = 'standard' | 'compact';

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

/**
 * 값 노드 — 사용자가 시작값을 설정하고 입력에 따라 갱신되는 신호 노드.
 * - `initialValue`: 신호 종류(Value sum type). 현재는 numeric만 지원하지만 보일러플레이트
 *   분기 추가 없이 boolean·enum 등으로 확장될 수 있게 sum type을 통과시킨다.
 * - 단위(unitId)는 numeric Value 안에 종속 — boolean·enum에는 단위 개념이 없다.
 * - `unitOverride`는 카탈로그 기본값을 노드별로 좁힐 때만 채운다.
 */
export interface ValueNode {
  kind: 'value';
  id: NodeId;
  label: string;
  /** 카탈로그 기본값을 노드별로 좁힐 때만 채운다. 비어 있으면 카탈로그 default. */
  unitOverride?: UnitOverride;
  initialValue: Value;
  position: { x: number; y: number } | null;
  /** Combiner key, registered in CombinerRegistry */
  combiner: string;
  isFocal: boolean;
  description?: string | null;
  /** 시각 스킨. 비어 있으면 추상 기본 형태로 그려진다. */
  skin?: NodeSkin;
  /** 디스플레이 모드 인스턴스 오버라이드. 비어 있으면 kind 기본을 따른다. */
  displayMode?: NodeDisplayMode;
}

/**
 * 상수 노드 — 사용자/카탈로그가 부여한 고정 값.
 * - `value`: 실행 시 항상 사용되는 값 (π·g 등 카탈로그 값 또는 사용자 단일 값).
 * - `constantKey`: 카탈로그 항목 식별자. 사용자 정의 단일 값이면 비어있다.
 * - 단위는 numeric Value 안에 종속 (raw 흐름이면 'free').
 */
export interface ConstantNode {
  kind: 'constant';
  id: NodeId;
  label: string;
  value: Value;
  constantKey?: string;
  position: { x: number; y: number } | null;
  isFocal: boolean;
  description?: string | null;
  /** 디스플레이 모드 인스턴스 오버라이드. 비어 있으면 kind 기본을 따른다. */
  displayMode?: NodeDisplayMode;
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
 * 비교 노드 — 단일 numeric 입력을 노드 내장 threshold와 비교해 그 결과를
 * boolean으로 출력하는 *연산자* (게이트가 아니다).
 *
 * ConditionNode와의 구분:
 *   - ConditionNode: 비교 결과를 통과/차단으로만 쓰고 *입력값*을 흘려보낸다.
 *   - ComparisonNode: 비교 결과 자체를 boolean Value로 출력한다.
 *
 * 둘은 의미가 달라 한 노드로 합치지 않는다 — boolean을 가지고 일을 하려면
 * ComparisonNode + boolean ValueNode 조합이 필요하다.
 */
export interface ComparisonNode {
  kind: 'comparison';
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

/**
 * 논리 게이트 연산자 — boolean 입력 N개를 결합해 boolean 출력을 만든다.
 *
 * boolean combiner 레지스트리의 키와 의미가 동일하지만, "노드 자체가 결합
 * 의도를 일급 시맨틱으로 갖는다"는 점에서 ValueNode의 combiner 옵션과 구분된다.
 * ValueNode는 입력성 신호이고 결합은 부수 행동인 반면, LogicGateNode는 결합
 * 그 자체가 정체성.
 */
export type LogicGateOperator = 'and' | 'or' | 'xor' | 'not';

/**
 * 논리 게이트 노드 — boolean 입력 N개를 operator로 결합해 boolean을 출력.
 *
 * - 입력 슬롯 수는 가변. 입력이 0개면 출력 invalid(게이트는 입력이 필수 시맨틱).
 * - 평가는 boolean combiner registry의 동일 함수에 위임 — and/or/xor 계산을
 *   ValueNode의 combiner 경로와 단일 출처에서 공유한다.
 * - ConditionNode/ComparisonNode와 평행한 구조 — boolean 출력 노드 군.
 */
export interface LogicGateNode {
  kind: 'logic-gate';
  id: NodeId;
  label: string;
  operator: LogicGateOperator;
  position: { x: number; y: number } | null;
  isFocal: boolean;
  description?: string | null;
  /** 디스플레이 모드 인스턴스 오버라이드. 비어 있으면 kind 기본을 따른다. */
  displayMode?: NodeDisplayMode;
}

/**
 * Observe 노드 — 입력값을 그대로 출력으로 통과시키는 모니터.
 *
 * - 본체: passthrough. 모델 그래프 계산에는 영향이 없다.
 * - 부가: 통과한 값을 시간순으로 누적해 시각화에 제공. 누적 버퍼는 모델 외부
 *   (`ExecutionState.observeBuffers`)에서 runtime-only로 관리하며 직렬화되지 않는다.
 * - `capacity`: 큐 정책. bounded면 최근 `size`개만, unbounded면 무제한.
 * - `visualization`: 시각화 paradigm key (registry에 등록된 표현 방식).
 *
 * "데이터 흐름 도메인 전문가" — ValueNode + Skin이 단위 도메인 전문가인 것과
 * 평행한 구조. 본체는 단순하고 paradigm이 표현을 책임진다.
 *
 * 입출력은 향후 N:N으로 확장 가능한 구조를 전제로 설계하지만 초기 구현은
 * 1입력 1출력에 한정.
 */
export type ObserveCapacity =
  | { kind: 'bounded'; size: number }
  | { kind: 'unbounded' };

export interface ObserveNode {
  kind: 'observe';
  id: NodeId;
  label: string;
  capacity: ObserveCapacity;
  /** Visualization paradigm key, registered in projector-web visualization registry */
  visualization: string;
  position: { x: number; y: number } | null;
  isFocal: boolean;
  description?: string | null;
}

/**
 * 생성기 노드 — 입력 없이 자신의 데이터를 생성해 출력으로 흘려보낸다.
 *
 * - 입력 0개 / 단일 numeric 출력. 데이터 생성 도메인 전문가.
 * - `params`: 패러다임 + 매개변수. 패러다임이 곧 paradigm registry의 키이며
 *   같은 sum type에서 매개변수 모양이 결정된다.
 * - 시작/정지/리셋 컨트롤러는 UI에서 노드별로 노출되고 ExecutionState.
 *   generatorRuntime이 enabled/cursor를 관리한다 (런타임 전용 — 직렬화 안 됨).
 *
 * 모델에 영속되는 것은 매개변수까지 — counter의 start/step, uniform·normal의
 * 분포 파라미터·seed. 시작/정지 상태, 현재 cursor는 세션 한정 런타임.
 *
 * 단위는 raw('free') — 생성기는 의미적 단위가 없는 raw 수치를 만든다.
 * 단위가 필요하면 다운스트림 ValueNode가 입력으로 받아 흡수.
 */
export type GeneratorParams =
  /** 1,2,3... 증가 카운터. emit마다 cursor += step. */
  | { kind: 'counter'; start: number; step: number }
  /**
   * 균등분포 랜덤. [min, max] 안의 모든 값이 동등 확률. integer=true면 정수
   * (max 포함), false면 표준 실수 균등(min 포함·max 미포함).
   * seed는 모델에 영속 — 같은 seed로 리셋하면 같은 시퀀스 재현.
   */
  | { kind: 'uniform'; min: number; max: number; integer: boolean; seed: number }
  /**
   * 정규분포 랜덤. 평균 mean 근처에서 표준편차 stdev의 종 모양 분포.
   * Box-Muller 변환으로 균등→정규. min/max 같은 hard cutoff 없음.
   */
  | { kind: 'normal'; mean: number; stdev: number; seed: number }
  /**
   * 사인파. y = offset + amplitude * sin(omega * t + phase). t는 emit step.
   * omega는 emit당 라디안 (주기 T = 2π/omega). phase는 라디안. offset은 DC bias.
   * 단진동·일주기·계절 변화 등 결정론적 진동 현상 모델링용. seed 불필요.
   */
  | { kind: 'sine'; amplitude: number; omega: number; phase: number; offset: number };

export interface GeneratorNode {
  kind: 'generator';
  id: NodeId;
  label: string;
  params: GeneratorParams;
  position: { x: number; y: number } | null;
  isFocal: boolean;
  description?: string | null;
  /** 디스플레이 모드 인스턴스 오버라이드. 비어 있으면 kind 기본을 따른다. */
  displayMode?: NodeDisplayMode;
}

export type Node =
  | ValueNode
  | ConstantNode
  | ConditionNode
  | ComparisonNode
  | LogicGateNode
  | ExpressionNode
  | ObserveNode
  | GeneratorNode;

export function isValueNode(n: Node): n is ValueNode {
  return n.kind === 'value';
}
export function isConstantNode(n: Node): n is ConstantNode {
  return n.kind === 'constant';
}
export function isConditionNode(n: Node): n is ConditionNode {
  return n.kind === 'condition';
}
export function isComparisonNode(n: Node): n is ComparisonNode {
  return n.kind === 'comparison';
}
export function isLogicGateNode(n: Node): n is LogicGateNode {
  return n.kind === 'logic-gate';
}
export function isExpressionNode(n: Node): n is ExpressionNode {
  return n.kind === 'expression';
}
export function isObserveNode(n: Node): n is ObserveNode {
  return n.kind === 'observe';
}
export function isGeneratorNode(n: Node): n is GeneratorNode {
  return n.kind === 'generator';
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
