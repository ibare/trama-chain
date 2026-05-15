---
version: 1
last_verified: 2026-05-15
---

# 테스트 작성 원칙 (C6)

## When to Apply
- `*.test.ts`/`*.test.tsx` 파일 추가·수정 시
- 테스트 실행 명령을 작성·문서화할 때
- 새 paradigm/case를 추가하면서 테스트 보강이 필요할 때

## MUST
- 테스트는 결정론적이어야 한다. `Math.random()`을 직접 호출하지 않고 seed를 명시한다.
- 분포·통계 테스트는 충분한 N으로 평균/표준편차 근사를 검증하되, tolerance를 명시적으로 둔다.
- `vitest`는 항상 `--run` 플래그로 일회성 실행한다 — 문서·스크립트·README에 watch 모드를 기본으로 적지 않는다.
- 새 sum type case가 등장하면 그 case를 다루는 테스트도 추가한다 ([[C4-sum-type-routing]]).

## MUST NOT
- `package.json` 스크립트의 `test`를 watch 기본으로 두고 그 위에서 CI를 돌리지 않는다 (`test:run`을 따로 둔다).
- **마이그레이션·하위호환 테스트를 작성하지 않는다.** schemaVersion 분기·lazy migration 경로 자체가 없으므로 그 테스트도 없다.
- 비결정론적 시간(`Date.now()`/`performance.now()`)에 결과가 의존하는 테스트를 작성하지 않는다 (mock 또는 fixed time 사용).
- 백그라운드 dev/test 서버를 띄우는 테스트 스크립트를 작성하지 않는다.

## PREFER
- 한 paradigm당 최소 4가지 테스트: 결정론적 시퀀스, 분포/평균 근사, 극단값(0/dirac/min/max), peek=emit 일관성.
- describe 블록 라벨은 한국어로 명확히 — 예: `'GeneratorNode — normal paradigm'`.
