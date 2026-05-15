---
version: 1
last_verified: 2026-05-15
---

# NodeView 인터랙티브 자식 (S-node)

## When to Apply
- `packages/projector-web/src/node/**/*.tsx` 파일을 추가·수정할 때
- NodeView 안에 클릭/더블클릭/토글 같은 인터랙션을 얹을 때
- 사이드 라벨·심볼·작은 UI를 노드 위에 새로 그릴 때

## MUST
- 노드 위의 *모든* 인터랙티브 자식은 자체 hit rect(`<rect>`)를 가지고, 그 hit rect의 `onPointerDown`/`onPointerMove`에서 `e.stopPropagation()`을 호출한다.
- 가능하면 `InteractiveArea` 컴포넌트로 감싼다 — hit rect와 stopPropagation·`pointerEvents='none'` 자식 래퍼가 일관 부착된다.
- 노드 본문 시각 요소(텍스트·도형)는 `<g pointer-events="none">` 안에 둔다. 시각이 직접 hit을 받지 않게.
- `NodeBody` 같은 공통 본문 컴포넌트가 있는 카드형 노드는 그것을 그대로 사용한다 (corner radius·state class·selected stroke 통일).

## MUST NOT
- 시각 요소(`<text>`/`<path>`)에 직접 `onClick`/`onPointerDown`을 부착하지 않는다 — drag pointer capture가 본문 rect로 가버린다.
- 인터랙티브 자식에 hit rect 없이 `<g onClick>` 형태로 부착하지 않는다.
- "본문과 같은 인터랙션"을 흉내내려고 `InteractiveArea`를 raw rect 위에 덧씌우지 않는다. `InteractiveArea`는 *본문과 다른 인터랙션* 시맨틱이다 — 라벨처럼 dblclick만 받고 싶다면 raw rect만 쓰고 `pointerdown`·`cursor`는 부착하지 않는다.
- 새 카드형 노드를 만들 때 NodeBody를 우회해 인라인 rect를 그리지 않는다 (corner radius·state class가 어긋남).

## PREFER
- hit rect 자체의 hover 효과는 `hitClassName`으로 부여한다 (예: `trama-condition-operator-hit`).
- 키보드 인터랙션이 필요하면 NodeView 단위로 fizzex EditorHost 같은 격리 호스트 패턴을 참고.

[[C2-scoped-styles]]
