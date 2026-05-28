---
version: 1
last_verified: 2026-05-15
---

# 스코프된 스타일 (C2)

## When to Apply
- `.css` 파일을 추가·수정할 때
- 새 컴포넌트의 스타일링 방식을 정할 때
- 토큰(`@trama-chain/tokens`)을 정의·소비할 때

## MUST
- 모든 CSS 변수와 클래스는 `[data-trama-root]` 스코프 안에서만 정의·참조한다.
- Trama가 들어가는 외부 호스트 페이지의 스타일과 충돌하지 않도록 글로벌 표면을 봉인한다.
- 토큰은 `@trama-chain/tokens`에서만 정의하고, 다른 패키지는 `css` export로만 소비한다.

## MUST NOT
- `:root { ... }`에 CSS 변수를 정의하지 않는다.
- `html, body { ... }`, 전역 wildcard 셀렉터(`* { ... }`로 reset)를 사용하지 않는다.
- Tailwind(`@tailwind`/`@apply`)·CSS-in-JS 라이브러리·전역 CSS 리셋(normalize.css 등)을 도입하지 않는다.
- 토큰을 다른 패키지에서 import해 `:root`나 전역에 다시 깔지 않는다.

## PREFER
- 새 컴포넌트의 클래스는 `trama-{영역}-{역할}` 네이밍 패턴을 따른다 (예: `trama-unit-inspector-row`).
- 한 컴포넌트의 스타일은 가까이 모은다. styles.css가 비대해지면 영역별로 분할하는 것을 고려.
