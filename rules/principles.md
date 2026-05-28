---
version: 2
last_verified: 2026-05-20
---

# Principles

모든 코드에 항상 적용되는 핵심 원칙. Tier 1.
이 원칙들은 Concerns·Specifics에서 구체화된다.

## 1. Projector 분리

도메인 로직은 UI 프레임워크에 의존하지 않는다.

- `@trama-chain/core`는 React·zustand·DOM·Radix·CSS에 비의존이다.
- 같은 모델 JSON이 여러 projector(web 편집기·embed·host-tiptap)에서 각각 렌더링된다.
- core가 만든 추상은 projector가 소비한다. 역방향 import 금지.

## 2. 단일 책임

하나의 함수/모듈/디렉터리는 하나의 역할만 수행한다.

- 디스크립터, 라우팅, 렌더링, 영속화 같은 횡단 관심사는 분리.
- "한 파일에 모두 모아둔 라우팅 + 상태 + 액션" 패턴은 분할한다.
- 모듈은 factory + closure 로 상태를 캡슐화한다. 모듈 전역 가변 변수 금지 — 다중 인스턴스가 token/상태를 공유하면 안 된다.
- 단일 클락/타이머 소유: 시뮬레이션 RAF 와 재생 setTimeout 은 각각 책임 모듈만 소유한다. 다른 곳에서 직접 등록/해제 금지.

## 3. 디스크립터 + 레지스트리로 확장

새 종류(노드/shape/combiner/constant/generator/skin)를 추가할 때는 디스크립터 객체 하나 + sum type case 하나로 라우팅이 완결되어야 한다.

- 라우터에 if/switch를 분기하지 않는다. registry가 `kind`로 디스패치.
- 디스크립터는 데이터 형태로 정의한다. 라우터 내부에 하드코딩 금지.

## 4. 스코프된 표면

외부에 노출되는 표면(공개 export·CSS 선택자·전역 객체)을 최소화한다.

- CSS는 `[data-trama-root]` 스코프 안에서만. 글로벌 `:root`/`html, body`/Tailwind 금지.
- 모듈 스코프 싱글톤(registry)은 정당화될 때만 사용. 인스턴스 상태는 `TramaInstance.store` 경유.
- `index.ts`의 wildcard re-export는 의도된 표면만 노출하도록 제어한다.

## 5. 타입·스키마 정합

TypeScript 타입과 Zod 스키마는 같은 형태를 공유한다.

- model의 sum type case 추가는 schema에 동시에 반영. 변환·직렬화·역직렬화 round-trip이 결정적.
- 외부 입력(파싱·디시리얼라이즈)은 schema로 검증, 내부 코드는 타입을 신뢰한다.
- `as any`/`as never`는 paradigm 디스패치 같은 합리적 경계에서만.

## 6. 결정론

같은 입력이 같은 출력을 만든다.

- PRNG는 seed 기반(예: `mulberry32`). `Math.random()` 직접 호출은 금지(메뉴 클릭 시 초기 seed 생성처럼 한정된 경우만 허용).
- 실행 propagation은 topological order에 따라 deterministic.
- 직렬화는 stable key ordering으로 round-trip 가능.
- 테스트는 항상 결정적 입력으로 작성.
