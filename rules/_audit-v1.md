# AUDIT-v1

- 일자: 2026-05-15
- 대상: `packages/**/src/**/*.{ts,tsx}`, `packages/**/*.css`, `packages/*/package.json`
- 규칙 버전: `principles.md` v1, Concerns C1~C6 v1, Specifics S-node·S-skin·S-expression v1

## 요약

- 총 위반: **0건**
- Critical: 0 / High: 0 / Medium: 0 / Low: 0
- 준수율: **100%**

규칙은 코드베이스가 이미 따르고 있는 패턴을 명문화한 것이므로 위반 없이 통과.

## 규칙별 결과

### C1 — Projector 분리
- `packages/core/src/**`에서 `react`/`react-dom`/`zustand`/`@radix-ui/*`/`fizzex` import 검색: **0건**.
- DOM API(`document`/`window`/`globalThis`) 직접 사용 검색: **0건** (schema 내부 import만 noise로 매치).
- core가 `@trama-chain/projector-*`를 import하지 않음.
- 판정: **PASS**.

### C2 — 스코프된 스타일
- 전역 `:root`/`html, body`/`* {`/`@tailwind`/`@apply` 검색: **0건** (모든 CSS 규칙이 `[data-trama-root]` 스코프).
- 토큰을 외부에서 `:root`에 다시 까는 패턴: **0건**.
- 판정: **PASS**.

### C3 — 디스크립터 + 레지스트리
- `kind ===` 검색 결과 다수 발견되었으나 모두 *sum type narrowing*(value.kind/unit.kind/selection.kind 등)이며 registry를 우회한 라우팅이 아님.
- 새 노드 종류는 모두 `registerNodeKindUI({...})`를 통해 등록(`register-default-kinds.ts`).
- generator paradigm도 `createDefaultGeneratorRegistry().register(...)`로 등록.
- 판정: **PASS**.

### C4 — Sum Type kind-tagged 라우팅
- `GeneratorParams`/`GeneratorCursor`의 case는 `counter`/`uniform`/`normal` 셋이며 schema·registry·테스트 모두 정합.
- `default: throw`로 막아둔 케이스 없음. switch는 exhaustive하게 작성되어 컴파일러가 검사.
- `schemaVersion: '1'` 흔적은 단순 버전 리터럴이며 migration 분기 코드 없음 (마이그레이션 비고려 원칙과 부합).
- 판정: **PASS**.

### C5 — 스키마-모델 정합
- `schema/document.ts`의 `NodeSchema`/`GeneratorParamsSchema`/`ValueSchema`/`ObserveCapacitySchema`가 모두 `z.discriminatedUnion('kind', [...])`이며 model 타입과 1:1 정합.
- `as` 캐스트는 `operations.ts:354`의 `updateNode` 헬퍼에 1건 — `{ ...existing, ...patch, id, kind: existing.kind } as Node`. **kind를 보존하는 bounded 캐스트로 schema 우회가 아님**. 판정 대상 아님.
- 판정: **PASS**.

### C6 — 테스트 작성 원칙
- `Math.random()`/`Date.now()`/`performance.now()`를 테스트에서 호출하는 사례: **0건**.
- 마이그레이션·legacy·schemaVersion 테스트: **0건**.
- 각 패키지 `package.json`에 `"test": "vitest"`(watch)와 `"test:run": "vitest run"`이 분리되어 존재. 규칙은 둘이 분리되어 있을 것을 요구하며 그대로 충족.
- 판정: **PASS**.

### S-node — NodeView 인터랙티브 자식
- `<text>`/`<path>`에 직접 `onClick`/`onPointerDown` 부착 사례: **0건**.
- hit rect 없이 `<g onClick>`로 인터랙션 부착하는 사례: **0건**.
- 인터랙티브 자식은 모두 `InteractiveArea`로 감싸 hit-rect + stopPropagation 일관 적용 (BooleanValueNodeView, LogicGateNodeView, GeneratorNodeView 등).
- 판정: **PASS**.

### S-skin — Skin 도메인·시각·앵커
- 모든 스킨이 `<g pointerEvents="none">` 래퍼로 시각을 격리(thermometer-body/oven/cryogenic/mercury/kiln).
- `pointerEvents="auto"` 사후 패치 사례: **0건**.
- `BooleanSkinDomain` 정의가 `intent`만 가지며 단위·범위 개념 없음 — 규칙 본문과 정합.
- 판정: **PASS**.

### S-expression — ExpressionNode + fizzex
- `Math.PI`/`Math.E` 호스트 상수 자동 바인딩 사례: **0건**. 식 상수는 ConstantNode 엣지 경유.
- `parseLatex` 호출은 `fizzex-evaluator.ts`의 `compile()` 내부 단 1곳 — 캐시 우회 없음.
- 식 노드 EditorView는 `EditorHost`로 wheel/pointerdown을 격리.
- 판정: **PASS**.

## 예외 판정

해당 없음. 위반이 없으므로 예외 등재할 항목 없음.

## 결론

규칙은 코드베이스의 현재 패턴을 명문화한 결과로, AUDIT-v1은 Critical 0 / High 0 / Medium 0 / Low 0의 완전 준수 상태를 확인. 이후 새 규칙을 도입하거나 코드를 더 쌓는 과정에서 회귀 감시가 필요해지면 AUDIT-v2를 재실행한다.
