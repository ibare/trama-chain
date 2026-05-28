# Trama 프로젝트 분석

## 프로젝트 구조 분석

### 기본 정보
- 언어: TypeScript (strict)
- 주요 프레임워크/라이브러리: React 19, Zustand 5, Radix UI, Zod, fizzex (수식 엔진), d3-shape, Tiptap (호스트)
- 모노레포 여부: 예 (pnpm workspace)
- 모듈/패키지/앱 목록:
  - `@trama-chain/core` — 모델·실행·스키마·단위·생성기. React 비의존.
  - `@trama-chain/tokens` — JSON 토큰 → TS 상수 + `[data-trama-root]` 스코프 CSS
  - `@trama-chain/projector-web` — 풀 캔버스 인터랙티브 편집기 (UI/zustand)
  - `@trama-chain/projector-static` — 정적 임베드 (NodeSnapshot 기반 zero-compute SVG)
  - `@trama-chain/host-tiptap` — Tiptap NodeView 어댑터
  - `@trama-chain/host-tiptap-bundle` — Rollup ESM 번들 (외부 호스트 배포용)
  - `@trama-chain/ui-primitives` — 공용 UI 프리미티브
  - `website` — GitHub Pages 소개 사이트
- 빌드 시스템: tsc + Rollup (bundle만), pnpm
- 테스트 프레임워크: Vitest 2.x
- 사용 중인 정적 분석 도구: TypeScript 컴파일러 (`tsc --noEmit`). **ESLint/Prettier 미설치.**

### 규모
- 소스 파일 수: 약 185개 (`.ts`/`.tsx`, dist/node_modules 제외)
- 대략적 코드 라인 수: 약 22,234 lines
  - `@trama-chain/core` src: 5,850
  - `@trama-chain/projector-web` src: 3,638 (단, model-store.ts 단일 파일 752줄)
- 테스트 파일 수: 15개 (대부분 core)
- styles.css 한 파일: 52KB (projector-web)

### 핵심 도메인
- **Model**: 노드/엣지/단위/값 — `packages/core/src/model/`
- **Execution**: topological propagation, 식 평가, generator runtime — `packages/core/src/execution/`
- **Functions/Shapes**: 함수 모양(linear/log/decay/none/...) 카탈로그 — `packages/core/src/functions/`
- **Generators**: counter·uniform·normal paradigm — `packages/core/src/generators/`
- **Schema**: Zod 기반 직렬화/파싱 (`trama` 펜스 JSON) — `packages/core/src/schema/`
- **Stores (UI)**: zustand `modelStore`/`uiStore`, 인스턴스 단위 격리 — `projector-web/src/store/`
- **Canvas/Node/Edge**: SVG 캔버스, NodeView 디스크립터 카탈로그, 엣지 물리 — `projector-web/src/{canvas,node,edge}/`
- **Skin/FunctionPicker**: 단위 도메인 전문가 시각·함수 모양 편집기 — `projector-web/src/{skin,function-picker}/`
- **Pulse/Execution-control**: 펄스/실행 UI — `projector-web/src/{pulse,execution-control}/`

### 발견된 공통 패턴 (좋은 신호)

- **Projector 패턴**: 도메인 로직은 React/zustand 비의존. core가 단일 source-of-truth, projector-* 가 표면.
- **레지스트리 + 디스크립터**: `kind-catalog`, `shape registry`, `combiner registry`, `constant registry`, `generator registry`. 새 종류 추가는 디스크립터 한 개 + sum type case 한 개로 라우팅.
- **Side-effect import 기반 등록**: `register-default-kinds.ts` 같은 모듈이 최상위에서 register를 호출해 NodeView/Menu가 카탈로그 조회 시점에 이미 채워진 상태.
- **Sum type + kind 디스패치**: `GeneratorParams`, `GeneratorCursor`, `Value` 등이 `kind`-tagged 합타입. 라우팅은 `params.kind`로 일관.
- **스코프된 CSS 토큰**: `[data-trama-root]` 안에서만 변수가 노출. 호스트 페이지의 `:root`/Tailwind와 충돌 없음.
- **TramaInstance 격리**: `instance.modelStore`/`instance.uiStore` 형태로 인스턴스마다 store가 분리됨. 모듈 스코프 싱글톤은 registry 한정.
- **Zod 스키마 ↔ TS 타입 정합**: 모델의 sum type을 그대로 schema에 반영해 round-trip 결정성 확보.

### 발견된 안티패턴 / 잠재 핫스팟

- **`store/model-store.ts` 단일 파일 752줄** — 도메인 액션(노드/엣지/실행/패치)이 한 파일에 누적. 책임 분리 후보.
- **`projector-web/src/styles.css` 단일 파일 52KB** — 컴포넌트별 CSS 모듈/스코프 분할이 없음. 한 파일에 클래스가 평면적으로 쌓임.
- **`packages/core/src/index.ts`가 wildcard re-export**(`export * from ...`) — 외부 표면 통제가 약함. core의 공개 API 표면이 의도와 다르게 넓어질 수 있음.
- **모듈 스코프 registry 싱글톤**(`shapeRegistry`/`combinerRegistry`/`constantRegistry`)이 `store/registries.ts`에 직접 import-time 생성. 호스트가 외부에서 더 등록할 여지가 있지만 인스턴스별 격리는 안 됨 (의도된 트레이드오프).

### 정적 분석 현황

- TypeScript는 모든 패키지에서 `tsc --noEmit`로 검증 중. 타입 안전은 컴파일러에 위임.
- `as any`/`: any` 사용은 약 11건 — 대부분 제네릭 paradigm 라우팅(`as never`) 등 합리적 경계. 별도 추적 불필요.
- **ESLint/Prettier 미설치** — 포매팅/네이밍/unused-import 같은 기계적 검증은 현재 도구가 없음. 도입을 권장하나 본 부트스트랩에서는 다루지 않음.
- `console.*` 호출: src에서 1건만 발견(노이즈 없음).

### 비협상 도메인 결정 (README의 "다섯 가지 결정" 요약)

규칙 작성 시 반드시 반영해야 하는 상위 제약:
1. **자동 추론 없음** — 명시적으로 그린 것만 다룬다.
2. **함수의 형태가 핵심** — +/− 극성이 아니라 shape으로 표현.
3. **물성 시각화** — 데이터 시각화가 아니라 물건의 반응으로 보여준다.
4. **관점의 다양성 존중**.
5. **시각적 아름다움은 비협상**.

명시적으로 *하지 않는* 것들: AI 자동 노드 제안, 합성 함수 자동 계산, "검증된 모델" 점수, force-directed 자동 레이아웃, 자동 병합·추천, 자동 감도 분석, 한 timestep 내부의 사이클, 협업·실시간 편집(v1), 클라우드 동기화, **글로벌 CSS·Tailwind 의존**.

### 외부 통합 제약

- **Methii 저장소 수정 금지** — 호스트 통합 작업도 트라마 측 산출물 + 요청 문서까지만.
- **백그라운드 dev 서버 금지** — vite·watch 등 long-running 프로세스는 사용자가 직접 실행.
- **vitest는 항상 `--run` 플래그** — 기본 watch 회피.
- **마이그레이션·하위호환 고려 금지** — 신규 제품, schemaVersion 분기/lazy migration 같은 작업을 계획에 넣지 않음.
