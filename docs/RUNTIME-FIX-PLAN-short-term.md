# 단기 fix 실행 계획 — P1~P5 (2026-05-20)

> 감사 리포트 `RUNTIME-AUDIT-2026-05-20.md` §6.1 의 P1~P5.
> 본 문서는 **각 fix 의 변경 범위·검증 절차·회귀 테스트·의존성**을 정리한다. 실제 코드 변경은 별도 PR.

---

## 0. 공통 사항

- **순서**: P1 → P2 → P3 → P4 → P5. 의존성 표(§7)에 명시된 직접 의존만 있고, 그 외는 순서 자유.
- **PR 단위**: 각 P 를 *독립 PR*. 코드 충돌이 거의 없어 병렬 진행 가능 (단, P3 는 P1 의 commit hook 을 같이 손대므로 P1 후 진행).
- **검증 베이스라인**: 모든 PR 머지 전에 `pnpm -r typecheck` + `pnpm -r test:run` 통과.
- **회귀 테스트**: 각 P 마다 *vitest 1~3 건* 추가. core 는 기존 `packages/core/tests/` 활용. projector-web 은 별도 (§9 참조).
- **scope 가 보고서와 다르면 보고**: 작업 중 영향 범위가 plan 보다 넓어지면 즉시 사용자에게 보고 후 결정.

---

## 1. P1 — `becameInvalid` 분기가 prior 없이 전체 재계산

### 1.1 위치
- `packages/projector-web/src/store/model-store.ts:897~931` (becameInvalid 분기 본문)
- 호출하는 함수: `handlePulseArrival` (일반 노드 경로)
- 관련: `computeExecutionState` 시그니처 (`model-store.ts:191~213`) — 이미 `priorModel` 인자 받음.

### 1.2 변경
```diff
- const recomputed = computeExecutionState(model, undefined, false);
+ const recomputed = computeExecutionState(model, executionState, false, model);
```

- `prior = executionState` (현재 상태 누적 유지)
- `priorModel = model` (모델이 펄스 도착 사이에 바뀌지 않음 — 동일 모델)
- `paused = false` 유지 (펄스 도착은 시간 진행 step).

### 1.3 검증
1. 단위 테스트 — `packages/core/tests/state.merge.test.ts` (신규) — `computeExecutionState` 가 prior 전달 시 Stock level / observe buffer / generator runtime 을 보존하는지.
2. 시나리오 테스트 — `Source → Condition → Stock` 그래프에서 Source 변경으로 Condition 이 다른 슬롯으로 라우팅 전환 시, *전환 전 Stock level 이 유지*되는지. `packages/projector-web/tests/handle-pulse-arrival.test.ts` (신규).
3. 회귀 점검 — 직전 두 fix(`f3179d8`, `7cce279`) 의 시나리오가 여전히 통과.

### 1.4 의존성
- 없음. 독립 PR.

### 1.5 예상 작업량
- 코드 변경 1 줄. 회귀 테스트 1~2 건. 총 0.5 일.

### 1.6 회귀 위험
- **moderate** — `priorModel === model` 의 의미가 "이번 펄스 도착 사이에 모델이 변하지 않았다" 인데, scrubInitialValue 의 setState 와 인터리브되면 priorModel 이 실제로는 *직전 모델*이어야 할 수 있다. mutation 액션에서 펄스 큐 처리 사이의 race 검토 필요. → §7 의 P5 와 관계 검사.

---

## 2. P2 — `recomputeNode` 의 sourceOverride 가 반대 슬롯 stale valid 안 끈다

### 2.1 위치
- `packages/core/src/execution/recompute-node.ts:186~190`

### 2.2 변경 — 두 가지 선택지

**옵션 A**: 같은 source 노드의 *다른 슬롯* 들을 workingValid 에서 제거.
```ts
if (options.sourceOverride) {
  const { sourceNodeId, sourceSlotIndex, value } = options.sourceOverride;
  workingValues[sourceNodeId] = value;
  // 같은 source 의 다른 슬롯 valid 를 모두 제거 — 분기 source 의 stale 슬롯 차단.
  const sourceDesc = nodeKindRegistry.forNode(model.nodes[sourceNodeId]!);
  if (sourceDesc?.branching) {
    const slots = sourceDesc.outputSlots(model.nodes[sourceNodeId]!, {
      model, registry: nodeKindRegistry,
    });
    for (const slot of slots) {
      if (slot.index !== sourceSlotIndex) {
        workingValid.delete(outputKey(sourceNodeId, slot.index));
      }
    }
  }
  workingValid.add(outputKey(sourceNodeId, sourceSlotIndex));
}
```

**옵션 B**: 인터페이스에 `exclusiveSlot: boolean` 추가, 호출자가 명시.

→ 권고 **A**. 호출자(model-store) 가 source 가 branching 인지 모르고 일관 호출하는 게 깔끔. `NodeKindDescriptor.branching` 필드는 이미 존재 (`kinds.ts:269` 부근).

### 2.3 검증
1. 단위 테스트 — `packages/core/tests/recompute-node.source-override.test.ts` (신규):
   - Condition source → 슬롯 0 펄스로 sourceOverride 호출 → 슬롯 1 valid 가 *없어졌는지* 확인.
   - branching=false 인 source (ValueNode) 는 다른 슬롯이 없으므로 영향 없음을 확인.
2. 시각 회귀 — Source→Condition→{true,false} fan-out 에서 false 케이블이 stale solid 로 남지 않는지 (이미 직전 fix 의 후속 검증).

### 2.4 의존성
- 없음. P1 과 무관.

### 2.5 예상 작업량
- 코드 변경 10~15 줄. 회귀 테스트 2 건. 총 0.5 일.

### 2.6 부수 효과
- `NodeKindDescriptor` 의 `branching` 필드가 *런타임 분기에 정식 참조됨* → 향후 추가되는 디스크립터가 branching 의미를 정확히 선언하도록 압력. 좋다.

---

## 3. P3 — `RecomputeNodeResult` 가 `invalidReasons` 누락

### 3.1 위치
- `packages/core/src/execution/recompute-node.ts:78~110` (`RecomputeNodeResult` 정의)
- `packages/core/src/execution/recompute-node.ts:179~181` (`workingInvalidReasons` 생성)
- `packages/core/src/execution/recompute-node.ts:232~241` (return)
- `packages/projector-web/src/store/model-store.ts:937~944` (호출자가 prev 보존)

### 3.2 변경
- `RecomputeNodeResult` 에 `newInvalidReasons: ExecutionState['invalidReasons']` 추가.
- `recompute-node.ts` return 객체에 `newInvalidReasons: workingInvalidReasons` 포함.
- model-store 의 일반 분기 commit (`model-store.ts:937~944`) 의 `invalidReasons: s.executionState.invalidReasons` → `invalidReasons: result.newInvalidReasons` 로 교체.

### 3.3 검증
1. 단위 테스트 — `packages/core/tests/recompute-node.invalid-reasons.test.ts` (신규):
   - ExpressionNode 에 변수 미정의 펄스 도착 → `newInvalidReasons[expressionId]` 가 EvalDiagnosis 객체.
   - 평가 성공 펄스 도착 → 직전 reason 이 *제거*됨.
2. 통합 — `packages/projector-web/tests/handle-pulse-arrival.test.ts` 에 일반 분기 commit 후 `state.invalidReasons` 가 RecomputeNodeResult 의 값과 동기되는지 추가.

### 3.4 의존성
- 없음. 독립.

### 3.5 예상 작업량
- 코드 변경 ~5 줄. 회귀 테스트 2 건. 총 0.3 일.

### 3.6 부수 효과
- model-store 의 일반 분기 commit 이 8 필드 + 1 = 9 필드로. ExecutionState 의 필드와 1:1. 다음 commit 단일화(§6.2 (e)) 작업의 베이스.

---

## 4. P4 — EdgeView continuous stroke 진동이 `paused` 무시

### 4.1 위치
- `packages/projector-web/src/edge/EdgeView.tsx:262~270`
- 관련 store: `packages/projector-web/src/store/time-settings.ts` (timeSettingsStore.paused)

### 4.2 변경
- ticker 함수 내부에서 paused 검사:
```ts
if (!isContinuousRef.current) return;
const paused = timeSettingsStore.getState().paused;
if (paused) return;
const path = pathRef.current;
if (!path) return;
const intensity = (Math.sin((performance.now() / 1000) * Math.PI * 2) + 1) / 2;
path.style.setProperty('--continuous-intensity', String(intensity));
```

- 다만 *paused 토글 직후 마지막 frame 까지 의도된 마지막 값으로 freeze* 하려면, paused 전이 시 `--continuous-intensity` 를 0(또는 마지막 값) 으로 박는 step 이 필요. timeSettingsStore.subscribe 로 paused 전이 listener 등록 — `false → true` 일 때 path.style.setProperty 로 마지막 박제.

### 4.3 검증
- DOM 테스트는 비용 큼. 수동 검증 절차:
  1. continuous 소스 흐름 중 ▶ 정지 → stroke 진동이 *즉시 멈춤*.
  2. ▶ 재개 → 다시 진동.
  3. 일시정지 중 노드 드래그 → 케이블 모양은 따라오지만 stroke 진동은 정지 (이전 fix `e93aa4c` 의 paused 중 notifyTick 과 모순 없는지 검토).
- 단위 테스트 — `packages/projector-web/tests/edge-view.paused.test.ts` (신규) — paused=true 시 `setProperty('--continuous-intensity', ...)` 가 호출되지 *않는지* spy 검증.

### 4.4 의존성
- 없음.

### 4.5 예상 작업량
- 코드 변경 ~10 줄. 단위 테스트 1 건. 총 0.3 일.

### 4.6 검토 포인트
- pulse-registry 의 pausedAt 시간축 공유 가능성 — paused 동안 elapsed 시간을 박제. 본 fix 는 단순 가드부터. 시간축 공유는 §6.2 (d) invariant selector 단일화 PR 에서 통합.

---

## 5. P5 — `scrubInitialValue` 가 `assertEditable` 우회

### 5.1 위치
- `packages/projector-web/src/store/model-store.ts:1272~1311`
- 단언 주석: `model-store.ts:340~344`
- UI 가드: `userAuthoredVisible` 가드 (ValueNodeView/Slider 측)

### 5.2 변경 — 두 가지 선택지

**옵션 A — 단순 가드 추가**: 함수 머리에 `if (!get().timeSettings.paused) return;` 류 추가. 단, time-settings 가 zustand store 의 외부 — `timeSettingsStore.getState().paused` 검사.

**옵션 B — scrub 을 별도 store 로 분리**: 박제 값은 model.nodes[id].initialValue 가 아니라 *런타임 scrub buffer* 로. emitValueOutput 시점에 model.initialValue 로 commit. 모델 mutation 은 정지 시에만.

→ **단기에는 A**. B 는 §6.2 (c) model-store 책임 분리 PR 에서 자연스럽게.

### 5.3 변경 (A 안)
```diff
  scrubInitialValue: (id, nextValue) => {
+   // 재생 중에는 scrub 시도 자체를 무시 — UI 가 닫지 못한 경로(키보드/외부)도 차단.
+   if (!timeSettingsStore.getState().paused) return;
    const before = get().model;
    ...
```

- 주석(`model-store.ts:340~344`) 의 "*모든* mutation 은 assertEditable 통과" 를 *부분적으로* 진실에 가깝게 만든다. setQuestion (`:1254`) 는 별도 — 이 plan 범위 밖.

### 5.4 검증
1. 단위 테스트 — `packages/projector-web/tests/scrub-initial-value.paused.test.ts` (신규) — paused=false 상태에서 `scrubInitialValue(id, 5)` 호출 → model 의 initialValue 가 *변하지 않음*.
2. 수동: ValueNodeSlider 드래그 중 ▶ 누름 → slider 가 더 이상 모델을 변경하지 않음 (현재 가드인 `userAuthoredVisible` 이 차단하지만, 외부 진입 경로(키보드·테스트) 에서 회귀 방지).

### 5.5 의존성
- P1 과 *간접 관계* — P1 의 `priorModel === model` 가정이 race 에서 깨질 수 있던 경로가 P5 의 가드로 막힌다. 두 PR 이 동시 머지되면 의미가 견고. 순서는 P1 먼저(읽기 쪽), P5 뒤(쓰기 쪽).

### 5.6 예상 작업량
- 코드 변경 1~2 줄. 회귀 테스트 1 건. 총 0.2 일.

---

## 6. 단기 합계

- 코드 변경 약 30 줄. 회귀 테스트 7~9 건.
- 총 예상 작업량 **2.0 일** (5 PR × 0.2~0.5 일).
- PR 5 개 — 각각 독립 검토 가능.

---

## 7. 의존성 표

| 후행 | 선행 | 이유 |
|---|---|---|
| P3 | (없음) | P1 과 동일 commit hook 손대므로 *충돌 줄이려면* P1 후 진행. 의미상 의존 X. |
| P5 | P1 | P1 의 `priorModel===model` 가정의 안전성을 P5 의 가드가 보강. |

그 외 P2 / P4 는 독립. 4 명이 병렬 작업해도 conflict 없음.

---

## 8. 회귀 테스트 슬릇 (단기 합계 9 건)

| # | 위치 | 대상 |
|---|---|---|
| T1 | `packages/core/tests/state.merge.test.ts` | computeExecutionState prior 보존 — Stock level |
| T2 | `packages/projector-web/tests/handle-pulse-arrival.test.ts` | becameInvalid 후 Stock level 유지 (P1 회귀 방어) |
| T3 | `packages/core/tests/recompute-node.source-override.test.ts` | branching source 의 반대 슬롯 stale valid 차단 (P2) |
| T4 | 같은 파일 | branching=false source 는 영향 없음 (P2 반증) |
| T5 | `packages/core/tests/recompute-node.invalid-reasons.test.ts` | invalidReasons 추가/제거 (P3) |
| T6 | `packages/projector-web/tests/handle-pulse-arrival.test.ts` | 일반 분기 commit 후 invalidReasons 동기 (P3) |
| T7 | `packages/projector-web/tests/edge-view.paused.test.ts` | paused=true 시 stroke setProperty 호출 0 (P4) |
| T8 | `packages/projector-web/tests/scrub-initial-value.paused.test.ts` | paused=false 시 scrub 무시 (P5) |
| T9 | `packages/projector-web/tests/scrub-initial-value.paused.test.ts` | paused=true 시 scrub 정상 동작 (P5 반증) |

---

## 9. projector-web 테스트 인프라 — 단기 슬릇

`packages/projector-web/tests/` 는 현재 `knob-geometry.test.ts` 1 개만. 단기 fix 의 T2/T6/T7/T8/T9 가 *projector-web 테스트 인프라*를 의존.

**단기에는 최소 셋업**:
- vitest 설정은 `@trama-chain/projector-embed` 의 vitest config 를 참조 (이미 동작).
- DOM 의존: `@testing-library/react` 또는 `happy-dom` — 두 후보 중 happy-dom 권고 (이미 monorepo 의 다른 패키지가 쓰면 그대로).
- model-store 의 *클로저 7 개*가 격리 어려움 → 단기 테스트는 *zustand store 생성 후 mutation/검증* 수준만. 시뮬 ticker 검증은 중기로 미룸.

상세 인프라 설계는 **중기 plan** 의 §1 에서.

---

## 10. 검증 절차 (각 PR)

```
1. typecheck 패키지 단위
   pnpm --filter @trama-chain/core typecheck
   pnpm --filter @trama-chain/projector-web typecheck
2. typecheck 전체
   pnpm -r typecheck
3. 단위 테스트 (영향 패키지)
   pnpm --filter @trama-chain/core test:run
   pnpm --filter @trama-chain/projector-web test:run
4. 통합 테스트
   pnpm -r test:run
5. rule-guard 사전 검토 + 사후 검증
6. 수동 시각 검증 (P4)
```

---

## 11. 이 단계가 끝나면 열리는 것

- **중기 (P6~P10 + 테스트 인프라)** — 같은 패턴으로 진행. 단기 fix 의 회귀 테스트가 *projector-web 테스트 인프라* 의 첫 클라이언트가 되므로, 중기에서 인프라 확장이 자연스럽다.
- **장기** — P3 의 commit 9 필드화가 §6.2 (e) `commitExecutionState` 헬퍼의 base. P5 의 단순 가드가 §6.2 (c) scrub-store 분리의 base. P2 의 branching 필드 정식 참조가 §6.2 (d) selector 단일화의 base.

---

(끝)
