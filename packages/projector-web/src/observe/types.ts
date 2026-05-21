import type { ComponentType } from 'react';
import type { ObserveNode, SequenceSample, Value, ValueKind } from '@trama/core';

/**
 * Observe 시각화 패러다임.
 *
 * 스킨이 *단위 도메인 전문가*라면 이 시각화는 *데이터 흐름 전문가*다. 같은 누적
 * 버퍼를 다양한 시각으로 풀어내는 표현 단위. ValueKind마다 적용 가능한 시각이
 * 다르므로 `supportedKinds`로 후보군을 좁힌다.
 *
 * 모든 시각은 본문(원형 보더) 안쪽에서 (-halfW, -halfH) ~ (halfW, halfH) 영역에
 * 그린다. 좌상 라벨 슬롯과 좌·우 핀은 ObserveNodeView가 따로 책임진다.
 */
export interface ObserveVisualizationRenderProps {
  node: ObserveNode;
  /**
   * 누적 sample 버퍼. 시간 오름차순 — 가장 최근이 마지막.
   * 각 sample 은 `{ value, t }` — t 는 누적 시점 simulation time(ms).
   * 시간축이 필요 없는 시각은 `s.value` 만 보고, sparkline 같이 시간 분포가
   * 필요한 시각은 t 까지 사용.
   */
  samples: SequenceSample[];
  /** 현재 step 출력 값. 누적 버퍼가 비어 있어도 invalid가 아니면 들어온다. */
  current: Value | null;
  /** 현재 step 의 simulation time (ms). 시간축이 필요한 시각이 current 를 sample
   *  처럼 다룰 때의 t. paused 상태라면 직전 step 의 t 가 그대로 유지된다. */
  currentT: number;
  halfW: number;
  halfH: number;
  /** compact 모드 여부. 시각화는 자체 폰트/패딩을 이 값에 맞게 줄여야 한다. */
  compact: boolean;
}

export type ObserveVisualizationComponent = ComponentType<ObserveVisualizationRenderProps>;

export interface ObserveVisualizationDefinition {
  /** 모델에 저장되는 visualization key (ObserveNode.visualization). */
  key: string;
  labels: { ko: string };
  /** 인스펙터 카드의 phosphor 아이콘 이름. */
  icon?: import('../icon/phosphor.js').PhosphorGlyphName;
  /** 사용자에게 보이는 한 줄 설명. */
  intent: string;
  /** 이 시각이 다룰 수 있는 ValueKind 목록. 빈 배열이면 모든 kind 허용. */
  supportedKinds: ValueKind[];
  Render: ObserveVisualizationComponent;
}
