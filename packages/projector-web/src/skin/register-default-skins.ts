import { registerSkin } from './registry.js';
import { defaultCellArrayParams } from './skins/cell-array.js';
import type { BooleanSkinComponent, NumericSkinComponent } from './types.js';

/**
 * 기본 스킨 메타 등록. 실제 컴포넌트 모듈은 사용자가 노드에 스킨을 적용한
 * 시점에서만 dynamic import로 로드된다. 메인 번들에는 메타만 포함된다.
 */

registerSkin({
  key: 'cell-array',
  labels: { ko: '셀 표시' },
  icon: 'squares-four',
  domain: {
    valueKind: 'numeric-any-unit',
    intent: '셀 배열로 값을 표현 — 게이지·세그먼트·단계·라이트를 한 패러다임으로',
  },
  load: (): Promise<{ Skin: NumericSkinComponent }> =>
    import('./skins/cell-array.js').then((m) => ({ Skin: m.CellArray })),
  defaultParams: () => defaultCellArrayParams() as unknown as Record<string, unknown>,
  defaultScale: 1,
});

registerSkin({
  key: 'thermometer-mercury',
  labels: { ko: '상온 온도계' },
  icon: 'thermometer',
  domain: {
    valueKind: 'numeric',
    unitId: 'celsius',
    range: { min: -50, max: 50, step: 1 },
    intent: '일상 생활에서 느끼는 온도 — 영하 50도부터 영상 50도까지',
  },
  load: (): Promise<{ Skin: NumericSkinComponent }> =>
    import('./skins/thermometer-mercury.js').then((m) => ({ Skin: m.ThermometerMercury })),
  defaultScale: 1,
});

registerSkin({
  key: 'thermometer-body',
  labels: { ko: '체온계' },
  icon: 'thermometer-simple',
  domain: {
    valueKind: 'numeric',
    unitId: 'celsius',
    range: { min: 35, max: 42, step: 0.1 },
    intent: '체온 — 정상·미열·발열 단계가 색으로 즉시 읽힌다',
  },
  load: (): Promise<{ Skin: NumericSkinComponent }> =>
    import('./skins/thermometer-body.js').then((m) => ({ Skin: m.ThermometerBody })),
  defaultScale: 1,
});

registerSkin({
  key: 'thermometer-oven',
  labels: { ko: '오븐 온도계' },
  icon: 'oven',
  domain: {
    valueKind: 'numeric',
    unitId: 'celsius',
    range: { min: 50, max: 300, step: 5 },
    intent: '베이킹·로스팅 — 다이얼이 회전하며 요리법 임계를 가리킨다',
  },
  load: (): Promise<{ Skin: NumericSkinComponent }> =>
    import('./skins/thermometer-oven.js').then((m) => ({ Skin: m.ThermometerOven })),
  defaultScale: 1,
});

registerSkin({
  key: 'thermometer-kiln',
  labels: { ko: '흑체복사 가마' },
  icon: 'flame',
  domain: {
    valueKind: 'numeric',
    unitId: 'celsius',
    range: { min: 500, max: 1500, step: 10 },
    intent: '도자기 가마·금속 단조 — 색이 곧 온도, 노드가 달궈진다',
  },
  load: (): Promise<{ Skin: NumericSkinComponent }> =>
    import('./skins/thermometer-kiln.js').then((m) => ({ Skin: m.ThermometerKiln })),
  defaultScale: 1,
});

registerSkin({
  key: 'incandescent-bulb',
  labels: { ko: '백열전구' },
  icon: 'lightbulb',
  domain: {
    valueKind: 'boolean',
    intent: '전류가 흐르면 필라멘트가 달궈진다 — ON/OFF 의 물리적 의미를 빛으로',
  },
  load: (): Promise<{ Skin: BooleanSkinComponent }> =>
    import('./skins/incandescent-bulb.js').then((m) => ({ Skin: m.IncandescentBulb })),
  defaultScale: 1,
});

registerSkin({
  key: 'audio-jack',
  labels: { ko: '오디오 잭' },
  icon: 'plug',
  domain: {
    valueKind: 'boolean',
    intent: '잭을 꽂으면 회로가 연결된다 — connected/disconnected 를 plug 의 물리적 위치로',
  },
  load: (): Promise<{ Skin: BooleanSkinComponent }> =>
    import('./skins/audio-jack.js').then((m) => ({ Skin: m.AudioJack })),
  defaultScale: 1,
});

registerSkin({
  key: 'thermometer-cryogenic',
  labels: { ko: '극저온 온도계' },
  icon: 'snowflake',
  domain: {
    valueKind: 'numeric',
    unitId: 'celsius',
    range: { min: -273, max: -100, step: 1 },
    intent: '극저온 — 액체질소·액체헬륨·절대영도 임계가 트랙에 새겨진다',
  },
  load: (): Promise<{ Skin: NumericSkinComponent }> =>
    import('./skins/thermometer-cryogenic.js').then((m) => ({ Skin: m.ThermometerCryogenic })),
  defaultScale: 1,
});
