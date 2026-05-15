---
version: 1
last_verified: 2026-05-15
---

# Sum Type kind-tagged 라우팅 (C4)

## When to Apply
- `GeneratorParams`/`GeneratorCursor`/`Value`/`Node` 같은 discriminated union을 수정·확장할 때
- 새 paradigm/case를 추가할 때
- propagation·execution·schema에서 kind 디스패치를 작성할 때

## MUST
- 모든 discriminated union case는 `kind: '...'` 리터럴을 첫 필드로 가진다.
- 새 case를 추가하면 그 case를 다루는 모든 라우팅(`registry.emit`/`peek`/`initCursor`, `propagate`, `schema`, `view` 컴포넌트, 테스트)에 동시 반영한다.
- `switch (x.kind)`는 *모든* case를 다뤄 exhaustive 해야 한다. 빠진 case에서 컴파일 에러가 나도록 `never` 보장.
- runtime cursor와 params의 `kind`가 어긋날 수 있는 경계(사용자가 paradigm을 바꾼 직후)는 명시적으로 재초기화한다 (`ensureRuntimeMatchesParams` 패턴).

## MUST NOT
- 새 union case를 schema(`Zod discriminatedUnion`)에 반영하지 않은 채 추가하지 않는다.
- `switch (kind)` 안에서 `default: throw`를 흉터로 두지 않는다. `default`는 unreachable로 두고 컴파일러가 exhaustive를 강제하게 한다.
- 빈 case나 fall-through로 다른 paradigm 동작에 묻어가지 않는다. 각 case는 자기 paradigm으로 분리.

## PREFER
- runtime cursor는 paradigm마다 별도 `kind`를 가져 다른 paradigm의 cursor와 헷갈리지 않게 한다.
- registry의 `emit`/`peek`이 cursor.kind 불일치를 만나면 자동 재초기화하도록 일관 처리.

[[C3-descriptor-registry]]
[[C5-schema-model-parity]]
