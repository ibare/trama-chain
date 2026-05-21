import type { ComponentType } from 'react';
import type {
  FunctionHandle,
  ObserveNode,
  SequenceSample,
  Value,
  ValueKind,
} from '@trama/core';

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
  samples: readonly SequenceSample[];
  /** 현재 step 출력 값. 누적 버퍼가 비어 있어도 invalid가 아니면 들어온다. */
  current: Value | null;
  /** 현재 step 의 simulation time (ms). 시간축이 필요한 시각이 current 를 sample
   *  처럼 다룰 때의 t. paused 상태라면 직전 step 의 t 가 그대로 유지된다. */
  currentT: number;
  /**
   * source 가 시간 의존 closure(FunctionHandle) 면 그 핸들. 시각은 임의 시각의
   * Value 를 peek 해 sub-frame 매끄러운 곡선을 그릴 수 있다. propagate 가 매
   * step 새 핸들 객체를 만들므로 ref 가 step 마다 갱신된다. scalar/sequence
   * source 는 null.
   */
  functionSource: FunctionHandle | null;
  /**
   * 신호 동결 상태 — 상류 continuous 패러다임의 gate 가 닫혀 closure 가 scalar 로
   * 환원된 직후를 표시. 시간은 흐르고 있지만 새 sample 이 더 들어오지 않는
   * 시점을 시각화가 인지해 sliding 정지·halo 표식 같은 표현을 분기할 수 있다.
   * discrete source(counter 등) 는 항상 false.
   */
  frozen: boolean;
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
