---
version: 1
last_verified: 2026-05-15
---

# 스키마-모델 정합 (C5)

## When to Apply
- `packages/core/src/model/types.ts` 수정 시
- `packages/core/src/schema/document.ts` 수정 시
- 모델의 새 필드·case·파라미터 추가 시
- 직렬화/역직렬화 코드(`parse`/`serialize`/`convert`) 수정 시

## MUST
- model의 TypeScript 타입 한 곳을 바꿨다면 schema의 대응 정의도 같은 PR에서 바꾼다.
- 외부 입력(JSON 파싱, 펜스 디시리얼라이즈)은 schema로 검증한 뒤 내부 코드에 전달한다.
- 직렬화는 stable key ordering으로 round-trip 결정성을 보장한다.
- 새 sum type case는 `z.discriminatedUnion` 또는 동등한 구조에 반영한다.

## MUST NOT
- model 타입은 늘리고 schema는 늘리지 않은 채 commit하지 않는다 (직렬화/역직렬화가 비정합 상태로 남음).
- schema에 없는 형태를 model 코드에서 `as` 캐스팅으로 우회 생성하지 않는다.
- **schemaVersion 분기·lazy migration·하위호환 코드 경로를 작성하지 않는다.** 신규 제품이므로 모델 변경 시 데이터는 새로 작성.
- 외부 입력을 schema를 거치지 않고 그대로 내부 데이터로 사용하지 않는다.

## PREFER
- schema 정의는 model 타입 옆에 단순 매핑으로 둔다. 변환 로직은 `schema/convert.ts`에 모은다.
- 테스트로 round-trip(`parse(serialize(model)) === model`)을 보호한다.

[[C4-sum-type-routing]]
