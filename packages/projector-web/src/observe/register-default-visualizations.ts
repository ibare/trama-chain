import { LastValueVisualization } from './LastValueVisualization.js';
import { SparklineVisualization } from './SparklineVisualization.js';
import { registerObserveVisualization } from './registry.js';

/**
 * 기본 시각화 등록. side-effect import — ObserveNodeView가 카탈로그를 조회하기
 * 전에 등록이 끝나도록 모듈 최상위에서 호출한다.
 */

registerObserveVisualization({
  key: 'last-value',
  labels: { ko: '마지막 값' },
  intent: '가장 최근 값을 크게, 직전 흐름을 옅게 — 한 눈에 현재와 잔상',
  supportedKinds: ['numeric', 'boolean'],
  Render: LastValueVisualization,
});

registerObserveVisualization({
  key: 'sparkline',
  labels: { ko: '스파크라인' },
  intent: '누적 흐름을 작은 그래프로 — 숫자는 라인, 참/거짓은 디지털 신호기',
  supportedKinds: ['numeric', 'boolean'],
  Render: SparklineVisualization,
});
