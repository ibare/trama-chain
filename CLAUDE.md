# Trama — Claude 작업 지침

이 파일은 Claude 에이전트가 trama 저장소에서 작업할 때 따라야 할 지침이다.

## 구현 원칙

- `rules/` 디렉터리에 구현 규칙이 정의되어 있다.
- `rules/INDEX.yaml`에서 현재 작업에 적용되는 규칙을 확인한다.
- `principles.md`는 항상 로드한다. `concerns/C*.md`와 `specifics/S-*.md`는 INDEX의 트리거 조건이 매칭될 때 로드한다.
- **MUST/MUST NOT 위반은 금지**한다. PREFER는 권장.
- 규칙 파일을 먼저 읽는다. 추론하지 않는다.
- 규칙 파일을 수정하지 않는다 (규칙 자체의 갱신이 필요하면 사용자에게 보고 후 별도 PR).

## Rule Guard

- 코드 수정 시 `rule-guard` 서브에이전트를 두 번 호출한다:
  1. 수정 계획 수립 후, 실행 전 → 사전 검토
  2. 수정 완료 후 → 사후 검증
- `task_complete` 보고 전에 반드시 빌드/테스트를 통과시킨다 (`pnpm -r typecheck`, `pnpm -r test:run`).
- 서브에이전트에 복합 작업을 위임하지 않는다. 작업 단위를 분리하여 각각 호출한다.

## 패키지 구조 요약

- `@trama/core` — 모델·실행·스키마. React 비의존.
- `@trama/tokens` — `[data-trama-root]` 스코프 CSS 토큰.
- `@trama/projector-web` — 풀 캔버스 편집기.
- `@trama/projector-embed` — 정적 임베드.
- `@trama/host-tiptap` — Tiptap NodeView 어댑터.
- `@trama/host-tiptap-bundle` — Rollup ESM 번들.
- `@trama/ui-primitives` — 공용 UI 프리미티브.

## 자주 쓰는 명령

```bash
pnpm install
pnpm -r typecheck
pnpm -r test:run          # vitest --run (watch 모드 금지)
pnpm --filter @trama/core test:run
pnpm dev                  # http://localhost:5173/trama/ — 사용자가 직접 실행
```

## 프로젝트 결정 (비협상)

1. **자동 추론 없음.** 사용자가 명시적으로 그린 것만 다룬다.
2. **함수의 형태가 핵심.** +/− 극성이 아니라 shape으로 표현.
3. **물성 시각화.** 데이터 시각화가 아니라 물건의 반응.
4. **관점의 다양성 존중.**
5. **시각적 아름다움은 비협상.**

## 작업 시 주의 사항

- **Methii 저장소 절대 수정 금지** — 호스트 통합도 트라마 측 산출물 + 요청 문서까지만.
- **백그라운드 dev 서버 금지** — vite·watch 등 long-running 프로세스는 사용자가 직접 실행.
- **vitest는 항상 `--run`** — 기본 watch 회피 (`test:run` 스크립트 사용).
- **마이그레이션·하위호환 고려 금지** — 신규 제품. schemaVersion 분기·lazy migration 작성하지 않음.
- **모든 출력은 한국어**.

## Baden Monitoring

- Project Name: `Trama` (Baden id: `bdn_yXErUiHy`)
- 이 프로젝트는 Baden 모니터링 하에서 운영된다. 모든 행동에 대해 해당 baden MCP 도구를 호출한다.
- `rules/INDEX.yaml`는 Baden이 프로젝트 메타데이터로 파싱한다. 대시보드에서 `rules_path`를 `/Users/mintae/Documents/Develop/side-projects/trama/rules`로 설정해야 규칙별 참조/위반 빈도가 추적된다.

### 사용자 지시 수신
- 사용자가 새 지시를 내리면 `baden_start_task`를 호출한다. **작업 시작 전에 호출할 것.**
- 반환된 taskId를 이후 같은 작업의 모든 보고에 사용한다.

### 계획 보고
- 코드를 읽거나 수정하지 않더라도, 접근 방식을 정하거나 계획을 세울 때 `baden_plan`을 호출한다.

### 행동 보고
- `baden_action`을 모든 행동 **실행 전에** 호출한다.
- 규칙 관련 행동에는 `baden_rule`, 검증 행동에는 `baden_verify`를 사용한다.

### 작업 완료 보고
- 작업이 완료되면 `baden_complete_task`를 호출한다.

### 원칙
- **보고 없이 행동하지 않는다.** 모든 읽기, 검색, 테스트는 보고 후 수행한다.
- **계획도 보고한다.** 도구 호출이 아닌 사고 과정도 보고 대상이다.
- **행동을 자유롭게 기술한다.** snake_case 키워드를 직접 만들어 행동을 요약한다.
- **이유를 구체적으로 쓴다.** 나중에 읽었을 때 맥락이 이해되는 수준으로 쓴다.

### Rule Guard의 Baden 보고
서브에이전트(rule-guard)는 MCP 도구에 접근할 수 없다 (알려진 버그). Bash + HTTP로 직접 보고하는 예가 `.claude/agents/rule-guard.md`에 포함되어 있다.
