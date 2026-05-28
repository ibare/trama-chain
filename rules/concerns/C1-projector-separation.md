---
version: 1
last_verified: 2026-05-15
---

# Projector 분리 (C1)

## When to Apply
- `@trama-chain/core`의 코드를 추가·수정할 때
- projector-web/projector-static/host-tiptap이 core API를 사용할 때
- 새 패키지를 만들 때 의존성 방향 결정 시

## MUST
- `@trama-chain/core`는 React·react-dom·zustand·@radix-ui/*·DOM API에 비의존이어야 한다.
- core의 모든 추상(model, execution, schema, units, generators, functions, combiners, history)은 순수 TypeScript + Zod만 사용한다.
- projector-* 패키지는 `@trama-chain/core`를 단방향으로만 import한다. core가 projector를 import해서는 안 된다.
- 새 도메인 개념(노드 종류·shape·combiner 등)은 먼저 `@trama-chain/core`에 추가하고, projector에서 디스크립터로 표면을 만든다.

## MUST NOT
- `packages/core/**`에서 다음을 import하지 않는다: `react`, `react-dom`, `zustand`, `@radix-ui/*`, `fizzex`(현재 projector-web에 묶여 있음), DOM 전용 API(`document`/`window` 등).
- core에 UI 의존을 우회하기 위한 글로벌 인젝션(`globalThis.__react__` 같은) 도입 금지.
- React 컴포넌트가 core 내부 mutable state를 직접 들고 있게 만들지 않는다.

## PREFER
- core가 사용하는 외부 의존은 `zod`처럼 도메인 친화적인 라이브러리로 한정.
- projector-* 사이에 공통 UI 로직이 생기면 `@trama-chain/ui-primitives`로 추출.
