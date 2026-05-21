import type { ComponentType } from 'react';
import type { ResolvedUnit, ValueKind, ValueNode } from '@trama/core';

/**
 * 스킨이 다루는 도메인 영역 선언.
 *
 * 스킨은 "특정 단위에 대응하는 표현"이 아니라 **그 ValueKind 안에서 특정 영역을
 * 전문으로 다루는** 도메인 전문가다.
 *
 * - numeric: 같은 단위(예: celsius)에도 영역이 다른 여러 스킨이 공존한다.
 *     상온 온도계(−50..50 °C), 조리 온도계(0..200 °C), 절대온도 디스플레이(−273..0 °C).
 *     사용자가 적용하면 노드의 unitOverride.min/max/step이 이 range로 역제안된다.
 * - numeric-any-unit: 단위를 가리지 않는 일반 표현 도구(셀 배열 등).
 *     사용자가 params로 직접 범위·셀을 정의하므로 노드 단위·범위에 역제안하지 않는다.
 *     도메인 전문가 원칙의 예외 — "표현 도구" 카테고리로 명시.
 * - boolean: 단위·범위 개념이 없다. 토글·전구·체크 등 표현 paradigm만 다양.
 */
export type SkinDomain =
  | NumericSkinDomain
  | NumericAnyUnitSkinDomain
  | BooleanSkinDomain;

export interface NumericSkinDomain {
  valueKind: 'numeric';
  /** 적용 가능한 단위 id (단위 카탈로그와 정확히 일치). */
  unitId: string;
  /** 이 스킨이 권장하는 노드 unit.min/max/step. 적용 시 자동 적용. */
  range: { min: number; max: number; step: number };
  /** 도메인 의도. 사용자가 스킨 카드를 볼 때 보이는 한 줄 설명. */
  intent: string;
}

export interface NumericAnyUnitSkinDomain {
  valueKind: 'numeric-any-unit';
  /** 도메인 의도. 단위·범위 역제안 없이 표현만 책임지는 일반 도구. */
  intent: string;
}

export interface BooleanSkinDomain {
  valueKind: 'boolean';
  /** 도메인 의도. boolean에는 단위·범위가 없다. */
  intent: string;
}

/**
 * 스킨 컴포넌트가 받는 props 공통 필드. 노드 본문(label/value/combiner chip)을
 * 대체하는 SVG group을 그린다. 소켓·NodeFrame·공통 원 보더는 view 가 책임진다.
 *
 * 영역: (-halfW, -halfH) ~ (halfW, halfH). NodeFrame 안에서 좌표 (0,0)이
 * 노드 중심에 오도록 transform이 이미 걸려 있다.
 */
interface SkinRenderPropsBase {
  node: ValueNode;
  halfW: number;
  halfH: number;
  /** 외부 입력이 있어 직접 조작이 의미 없는 상태. 시각 hint용. */
  disabled?: boolean;
  /**
   * 라벨/타이틀 영역 클릭 — 인스펙터 진입. 스킨은 상단 라벨 슬롯을 InteractiveArea
   * 로 감싸 이 callback을 호출한다. (선택 + 인스펙터 열기 합쳐 들어옴)
   */
  onLabelClick?: () => void;
}

/**
 * numeric 도메인 스킨 props — 슬라이더·다이얼·게이지 등이 사용.
 */
export interface NumericSkinRenderProps extends SkinRenderPropsBase {
  /**
   * 현재 step의 실행값. 입력 노드면 initialValue로 fallback돼서 들어온다.
   */
  value: number;
  unit: ResolvedUnit;
  /**
   * 사용자 직접 조작 콜백. drag 중 매 move마다 호출. 외부 입력이 있는 노드면
   * undefined로 들어와 스킨이 자체 핸들을 비활성화해야 한다.
   */
  onScrub?: (next: number) => void;
}

/**
 * boolean 도메인 스킨 props — 토글·전구·체크 등이 사용.
 *
 * numeric의 scrub(드래그 중 연속 값) 대신 toggle(클릭 1회 ON↔OFF) 시맨틱.
 * 단위·범위 개념 자체가 없으므로 unit·range는 받지 않는다.
 */
export interface BooleanSkinRenderProps extends SkinRenderPropsBase {
  on: boolean;
  /** 본체 클릭 등으로 호출. 외부 입력이 있으면 undefined로 들어와 스킨이 비활성화. */
  onToggle?: () => void;
}

export type NumericSkinComponent = ComponentType<NumericSkinRenderProps>;
export type BooleanSkinComponent = ComponentType<BooleanSkinRenderProps>;

/**
 * 스킨 정의 — 도메인 ValueKind에 따라 컴포넌트 시그니처가 달라지므로 discriminated
 * union으로 묶는다. registry는 key로 lookup하지만, 사용처(ValueNodeSkin/
 * BooleanValueNodeSkin)는 자신이 다룰 도메인의 SkinComponent 타입을 받아야 prop
 * 전달이 안전하다.
 */
export type SkinDefinition = NumericSkinDefinition | BooleanSkinDefinition;

interface SkinDefinitionBase {
  /** 모델에 저장되는 skin.kind. */
  key: string;
  labels: { ko: string };
  /** 인스펙터 카드의 phosphor 아이콘 이름. */
  icon?: import('../icon/phosphor.js').PhosphorGlyphName;
  /**
   * 새로 적용 시 초기 params. 비어 있으면 빈 객체로 시작.
   * params 형태는 스킨이 자체 검증한다 — core schema는 unknown record로 통과시킨다.
   */
  defaultParams?: () => Record<string, unknown>;
  /**
   * 스킨이 노드에 처음 적용될 때 부여되는 기본 비율 (1 = 100%).
   * SKIN_LAYOUTS 의 spec(width/height/circleR/circleCy)에 곱해진다. 작게(0.5) 두면
   * 동일 spec 의 미니어처로 생성되고, 사용자가 resize 핸들로 조정하면
   * `node.skin.params.scale` 이 갱신되어 이 기본값을 덮어쓴다.
   */
  defaultScale: number;
}

export interface NumericSkinDefinition extends SkinDefinitionBase {
  domain: NumericSkinDomain | NumericAnyUnitSkinDomain;
  load: () => Promise<{ Skin: NumericSkinComponent }>;
}

export interface BooleanSkinDefinition extends SkinDefinitionBase {
  domain: BooleanSkinDomain;
  load: () => Promise<{ Skin: BooleanSkinComponent }>;
}

/** 스킨이 다루는 ValueKind. registry 필터에 자주 쓰여 별도 헬퍼로 둔다. */
export function skinValueKind(def: SkinDefinition): ValueKind {
  switch (def.domain.valueKind) {
    case 'numeric':
    case 'numeric-any-unit':
      return 'numeric';
    case 'boolean':
      return 'boolean';
  }
}
