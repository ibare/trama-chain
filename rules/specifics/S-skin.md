---
version: 1
last_verified: 2026-05-15
---

# Skin 도메인·시각·앵커 (S-skin)

## When to Apply
- `packages/projector-web/src/skin/**/*.{ts,tsx}` 파일을 추가·수정할 때
- 새 스킨(온도계·전구·게이지 등)을 등록할 때
- ValueNode의 unitOverride·range 결정 로직을 수정할 때

## MUST
- 스킨은 *단위 도메인 전문가*다. `domain.unitId`로 적용 가능한 단위를 한정하고, numeric 스킨은 `range.min/max/step`을 노드의 `unitOverride`로 역제안한다.
- 스킨의 시각(SVG group)은 wrapper `<g pointer-events="none">`에 격리한다. 인터랙티브 핸들(직접 조작 핀·다이얼)만 자체 hit-area를 보유.
- 엣지 앵커는 스킨 visual의 silhouette과 별개로, *공통 원(circle) 보더의 좌·우 끝점*에 정렬한다. 진짜 원이며, 스킨 시각과 다른 추상.
- boolean 스킨은 단위·범위 개념이 없다 — `BooleanSkinDomain`은 `intent`만 가진다.

## MUST NOT
- 스킨 시각이 직접 drag/hit pointer를 받지 않게 한다 (NodeFrame 본문 rect가 capture를 가져가도록).
- 사후 패치(`pointer-events: auto`를 시각 자식에 부여) 같은 우회를 추가하지 않는다.
- 스킨 안에서 `node` mutation·다른 인스턴스의 store 접근을 하지 않는다 — 그래야 같은 스킨이 여러 인스턴스에 안전히 재사용된다.
- 새 스킨이 같은 단위에 두 개 이상 등장하더라도, "도메인이 다른 두 전문가"로만 공존시킨다 (range가 정말 다를 때).

## PREFER
- 직접 조작 핸들이 필요하면 `SkinRenderProps.onCommit`/`onDrag` 콜백을 사용한다. 외부 입력이 있는 노드면 콜백이 `undefined`로 들어와 핸들을 비활성화.
- 같은 ValueKind의 도메인 카탈로그는 `register-default-skins.ts`에 모아 디스크립터 패턴([[C3-descriptor-registry]])으로 등록.

[[S-node]]
[[C3-descriptor-registry]]
