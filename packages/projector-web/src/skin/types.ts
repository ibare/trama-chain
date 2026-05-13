import type { ComponentType } from 'react';
import type { ResolvedUnit, ValueNode } from '@trama/core';

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
  /** 현재 step의 실행값. 입력 노드면 initialValue로 fallback돼서 들어온다. */
  value: number;
  unit: ResolvedUnit;
  halfW: number;
  halfH: number;
  /**
   * 사용자 직접 조작 콜백. drag 중 매 move마다 호출. 외부 입력이 있는 노드면
   * undefined로 들어와 스킨이 자체 핸들을 비활성화해야 한다.
   */
  onScrub?: (value: number) => void;
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
   * 어느 단위에 적용 가능한지. ResolvedUnit 기준으로 자유 판정.
   * 단위 카탈로그를 건드리지 않고 스킨이 자기 적용성을 선언하는 방식.
   */
  appliesTo: (unit: ResolvedUnit) => boolean;
  /** dynamic import — vite가 자동으로 별도 chunk로 분리한다. */
  load: () => Promise<{ Skin: SkinComponent }>;
}
