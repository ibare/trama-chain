---
version: 1
last_verified: 2026-05-15
---

# 디스크립터 + 레지스트리 (C3)

## When to Apply
- 새 노드 종류(value/condition/comparison/logic-gate/expression/generator/observe/constant 등)를 추가할 때
- 새 shape/combiner/constant/generator paradigm을 추가할 때
- 새 skin이나 함수 모양 편집기를 추가할 때

## MUST
- 새 종류는 *디스크립터 객체 한 개*로 정의한다. core 측에는 paradigm/registry 항목, UI 측에는 `registerNodeKindUI({...})` 호출.
- 디스크립터는 그 종류의 모든 표면(메뉴 라벨·심볼·View 컴포넌트·기본값·라우팅 함수)을 한 곳에서 묶는다.
- 라우팅은 registry가 `kind`로 디스패치한다. 호출처에 `switch (node.kind)`·`if (kind === 'foo')`를 새로 추가하지 않는다.
- 모듈 최상위 side-effect import로 register 호출이 한 번 일어나도록 한다 (`register-default-kinds.ts` 패턴).

## MUST NOT
- 라우터(예: NodeView, CanvasContextMenu, propagate)에 새 종류용 분기를 직접 추가하지 않는다.
- 같은 종류에 대한 표면을 여러 파일에 흩어놓지 않는다 — View는 한 파일에서, 등록은 한 곳에서.
- registry를 우회하고 `node.kind === 'mything' ? ... : ...` 형태의 inline 디스패치를 작성하지 않는다 (디스크립터를 거치도록).

## PREFER
- 디스크립터에 LaTeX·심볼·기본 라벨 같은 메뉴 메타데이터를 함께 둔다.
- paradigm/registry는 sum type([[C4-sum-type-routing]])과 함께 진화한다.

[[C4-sum-type-routing]]
