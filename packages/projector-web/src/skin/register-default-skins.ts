import { registerSkin } from './registry.js';

/**
 * 기본 스킨 메타 등록. 실제 컴포넌트 모듈은 사용자가 노드에 스킨을 적용한
 * 시점에서만 dynamic import로 로드된다. 메인 번들에는 메타만 포함된다.
 */

registerSkin({
  key: 'thermometer-mercury',
  labels: { ko: '상온 온도계' },
  domain: {
    unit: 'celsius',
    range: { min: -50, max: 50, step: 1 },
    intent: '일상 생활에서 느끼는 온도 — 영하 50도부터 영상 50도까지',
  },
  load: () =>
    import('./skins/thermometer-mercury.js').then((m) => ({ Skin: m.ThermometerMercury })),
});
