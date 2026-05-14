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
 * - boolean: 단위·범위 개념이 없다. 토글·전구·체크 등 표현 paradigm만 다양.
 */
export type SkinDomain = NumericSkinDomain | BooleanSkinDomain;

export interface NumericSkinDomain {
  valueKind: 'numeric';
  /** 적용 가능한 단위 id (단위 카탈로그와 정확히 일치). */
  unitId: string;
  /** 이 스킨이 권장하는 노드 unit.min/max/step. 적용 시 자동 적용. */
  range: { min: number; max: number; step: number };
  /** 도메인 의도. 사용자가 스킨 카드를 볼 때 보이는 한 줄 설명. */
  intent: string;
}

export interface BooleanSkinDomain {
  valueKind: 'boolean';
  /** 도메인 의도. boolean에는 단위·범위가 없다. */
  intent: string;
}

/**
 * 스킨 컴포넌트가 받는 props.
 *
 * 스킨은 노드 본문(label/value/combiner chip)을 대체하는 SVG group을 그린다.
 * 소켓·NodeFrame·NodeBorderTrack은 ValueNodeView가 계속 책임진다.
 *
 * 영역: (-halfW, -halfH) ~ (halfW, halfH). NodeFrame 안에서 좌표 (0,0)이
 * 노드 중심에 오도록 transform이 이미 걸려 있다.
 */
export interface SkinRenderProps {
  node: ValueNode;
  /**
   * 현재 step의 실행값(numeric 스킨이 보는 number). 입력 노드면 initialValue로
   * fallback돼서 들어온다.
   *
   * 1단계는 모든 스킨이 numeric 도메인이라 이 number 시그니처가 충분.
   * boolean 스킨이 등장하면(5단계 이후) RenderProps를 ValueKind별 props로
   * 분기하거나 Value 객체를 받도록 확장한다.
   */
  value: number;
  /** numeric 스킨에서 의미. boolean 스킨은 무시. */
  unit: ResolvedUnit;
  halfW: number;
  halfH: number;
  /**
   * 사용자 직접 조작 콜백. drag 중 매 move마다 호출. 외부 입력이 있는 노드면
   * undefined로 들어와 스킨이 자체 핸들을 비활성화해야 한다.
   */
  onScrub?: (next: number) => void;
  /** 외부 입력이 있어 직접 조작이 의미 없는 상태. 시각 hint용. */
  disabled?: boolean;
  /**
   * 라벨/타이틀 영역 클릭 — 단위·스킨 인스펙터 진입. 스킨은 상단 라벨 슬롯을
   * InteractiveArea로 감싸 이 callback을 호출한다. (선택 + 인스펙터 열기 합쳐 들어옴)
   */
  onLabelClick?: () => void;
}

export type SkinComponent = ComponentType<SkinRenderProps>;

export interface SkinDefinition {
  /** 모델에 저장되는 skin.kind. */
  key: string;
  labels: { ko: string };
  /**
   * 도메인 영역 선언. 노드의 ValueKind와 domain.valueKind가 일치해야 후보가
   * 되고, numeric이면 추가로 unitId가 노드의 단위와 매치돼야 한다.
   */
  domain: SkinDomain;
  /** dynamic import — vite가 자동으로 별도 chunk로 분리한다. */
  load: () => Promise<{ Skin: SkinComponent }>;
}

/** 스킨이 다루는 ValueKind. registry 필터에 자주 쓰여 별도 헬퍼로 둔다. */
export function skinValueKind(def: SkinDefinition): ValueKind {
  return def.domain.valueKind;
}
