import type { Edge, ValueKind } from '../../model/index.js';

/**
 * scalar 채널 포트 spec — 한 스텝당 단일 값(+optional 메타) 이 흐른다.
 * `value` 는 알맹이 Value 의 kind, `meta` 는 WrappedValue 의 메타 kind
 * (미정의면 메타 없음). 기본 종류이므로 `kind` 는 생략 가능.
 */
export interface ScalarPortSpec {
  kind?: 'scalar';
  value: ValueKind;
  meta?: ValueKind;
  /** UI/디버깅용 라벨. 없으면 인덱스·value 로 자동 표기. */
  label?: string;
}

/**
 * sequence 채널 포트 spec — 누적된 (value, t) sample 시퀀스가 흐른다.
 * 누적 추출 슬롯(ObserveNode 상단 우측 등) 의 출력 / 통계 노드(AverageNode 등)
 * 의 입력에 쓰인다. scalar 와는 호환되지 않는다(자동 변환 없음 — 명시적 변환 노드 필요).
 */
export interface SequencePortSpec {
  kind: 'sequence';
  /** sample element 의 value kind. 누적원 본체 PortSpec.value 를 따른다. */
  element: ValueKind;
  label?: string;
}

/**
 * 한 포트(입력/출력 슬롯)의 타입 명세. scalar 채널과 sequence 채널의 합집합.
 *
 * 입력 포트는 acceptsList 로 여러 PortSpec 을 OR 매칭.
 * 출력 포트(`OutputSlotSpec`) 는 슬롯당 항상 단일 spec.
 */
export type PortSpec = ScalarPortSpec | SequencePortSpec;

/** scalar/sequence 분기 가드. C4 Sum Type Routing 의 단일 진입점. */
export function isSequencePortSpec(spec: PortSpec): spec is SequencePortSpec {
  return spec.kind === 'sequence';
}

/** 한 출력 슬롯의 명세. 디스크립터는 0..n-1 순서로 반환. */
export type OutputSlotSpec = PortSpec & {
  index: number;
  /**
   * 라우팅이 런타임에만 확정되는 분기 슬롯. true 면 EdgeView 가 이 슬롯에서
   * 나가는 케이블을 항상 dashed 로 그려 "어디로 흐를지 모름" 을 시각화한다.
   * Condition 의 true/false 슬롯, LogicGate 의 출력 슬롯이 해당. 일반 연산
   * 노드의 출력은 입력이 valid 면 항상 발사라 분기가 아니다.
   */
  branching?: boolean;
};

/**
 * 엣지의 shape이 사실상 항등 변환인지 판정. 두 경우:
 *  - kind='none'                : 사용자가 변환을 선택하지 않은 상태
 *  - kind='linear', slope=1, offset=0 : explicit identity linear
 *
 * identity 엣지는 raw passthrough로 다루고 정규화·역정규화·클램프를 건너뛴다.
 * "shape을 적용하지 않으면 raw"라는 의미 모델의 단일 진입점.
 */
export function isIdentityShape(edge: Edge): boolean {
  if (edge.shape.kind === 'none') return true;
  if (edge.shape.kind !== 'linear') return false;
  const p = edge.shape.params as { slope?: unknown; offset?: unknown };
  return p.slope === 1 && p.offset === 0;
}
