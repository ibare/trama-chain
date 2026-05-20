# 중기 fix 실행 계획 — P6~P10 + 테스트 인프라 (2026-05-20)

> 감사 리포트 `RUNTIME-AUDIT-2026-05-20.md` §6.1 의 P6~P10 + projector-web 테스트 인프라.
> 단기 plan (`RUNTIME-FIX-PLAN-short-term.md`) 의 후속.

---

## 0. 공통 사항

- **순서**: 인프라 셋업(§1) → P6 → P7 → P8 → P9 → P10. 단, **인프라가 단기와 합쳐서 진행**되어도 무방.
- **PR 단위**: 인프라 1 PR + 각 P 독립 PR. 총 6 개.
- **검증 베이스라인**: 동일 — `pnpm -r typecheck` + `pnpm -r test:run`.
- **단기 plan 과의 관계**: 단기 fix 의 회귀 테스트 5 건이 이 단계의 인프라를 *바로 사용*. 즉 인프라 PR 을 단기 PR 들과 *병행* 또는 *바로 직후* 머지하면 효율적.

---

## 1. projector-web 테스트 인프라 셋업

### 1.1 현재 상태
- `packages/projector-web/tests/` 에 `knob-geometry.test.ts` 1 개만 존재 — 순수 함수 기하 계산.
- vitest config: `packages/projector-web/vitest.config.ts` (검토 필요 — 존재 여부와 환경).
- model-store 의 closure 7 개(`unregisterSimulationTicker`/`simAccumMs`/`lastWallNowMs`/`activePlaybackToken`/`playbackTimeoutId`/`nextDirectPulseSerial`/etc.)가 모듈 평가 시 한 번 만들어짐. **모듈 단위 재초기화 어려움**.

### 1.2 목표

| 항목 | 결정 |
|---|---|
| DOM 환경 | `happy-dom` (가벼움, vitest 환경 표준). |
| zustand store 격리 | `create()` 호출이 모듈 평가 시 1 회 — 테스트마다 *별도 store 생성하는 factory* 도입. `model-store.ts` 의 default export 가 그 factory 의 1 회 호출 결과가 되도록 *부분 분리*. 이번 PR 에선 *별도 factory export 만 추가*하고 default 동작은 동일. |
| pulse-registry 격리 | 시간 인터페이스(`now: () => number`) 를 deps 로 받게 — 현재 `performance.now()` 직접 호출. 인프라 PR 에서 deps 추가. |
| animationLoop mock | 테스트 환경에서 RAF 가 안 돎. `animationLoop.register` 의 mock 헬퍼 — `flushFrame()` 으로 수동 진행. |
| Edge/Cable DOM | EdgeView 테스트는 happy-dom + `setProperty` spy 로 검증. JSX 마운트는 `@testing-library/react`. |

### 1.3 의사 결정 — 도입 vs 미루기

- `@testing-library/react` 도입 → 한 패키지의 의존 추가. 가볍지만 *EdgeView/NodeView* 같은 시각 컴포넌트 검증이 가능해진다.
- model-store 의 클로저 7 개를 *순수 함수로 추출* → 본 인프라 PR 의 범위 *너머*. 대신 P9/P10 fix 와 함께 진행.
- 결정: 본 인프라 PR 은 **(a) happy-dom 환경 추가 + (b) animationLoop mock 헬퍼 + (c) timeSettingsStore 격리 헬퍼** 3 개만.

### 1.4 변경 범위
```
packages/projector-web/
  vitest.config.ts                                ← happy-dom 환경 명시
  package.json                                    ← happy-dom + @testing-library/react devDep
  tests/
    helpers/
      animation-loop.ts                           ← createMockAnimationLoop + flushFrame
      pulse-registry-deps.ts                      ← createFakeTimeline (now() 제어)
      time-settings-store.ts                      ← createIsolatedTimeSettingsStore
      test-pulse-registry.ts                      ← createPulseRegistry + deps 한 번에 묶음
```

### 1.5 검증
- 새 helpers 만 import 하는 더미 테스트 1 건 (시간 흐름 mock + flushFrame 한 번 → tick 호출 횟수 1). 인프라 PR 의 self-test.

### 1.6 예상 작업량
- 0.7 일.

---

## 2. P6 — `handlePulseArrival` stock 분기가 슬롯 1·2 pendingOutputs 미정리

### 2.1 위치
- `packages/projector-web/src/store/model-store.ts:810~853` (stock 분기 본문)
- `spawnStockSlotPulse` (`model-store.ts:454~478`)
- EdgeView 의 `isBranchingInactive` (`EdgeView.tsx:109~121`) — 슬롯 단위 valid 만 검사

### 2.2 현재 코드
- slot 0 (level) 만 validOutputs.add / pendingOutputs.delete (line 815~821).
- slot 1 (overflow) / slot 2 (rate) 는 spawn 만 호출 — valid set 에 들어가지 못함.
- 결과: branching=true 인 Stock 의 슬롯 1/2 에 연결된 케이블이 EdgeView selector 에서 `inactive` 로 판정 → 영구 dashed.

### 2.3 변경
- `spawnStockSlotPulse` 가 *spawn 부작용으로* slot 의 validOutputs 도 add + pendingOutputs delete 하도록 캡슐화.
- 또는 stock 분기에서 slot 1/2 spawn 직전 `setState` 에서 validOutputs.add / pendingOutputs.delete 명시.

→ 권고 **캡슐화** (전자). 호출자 책임을 줄임.

```ts
function spawnStockSlotPulse(model, sourceId, slot, value) {
  // ... 기존 spawn 로직 ...
  store.setState((s) => {
    const newValid = new Set(s.executionState.validOutputs);
    newValid.add(outputKey(sourceId, slot));
    const newPending = new Set(s.executionState.pendingOutputs);
    newPending.delete(outputKey(sourceId, slot));
    return {
      executionState: {
        ...s.executionState,
        validOutputs: newValid,
        pendingOutputs: newPending,
      },
    };
  });
}
```

### 2.4 검증
1. 단위 테스트 — `packages/projector-web/tests/spawn-stock-slot-pulse.test.ts`:
   - `spawnStockSlotPulse(stockId, 1, val)` 후 `validOutputs.has(`${stockId}:1`)` true.
   - 같은 호출 후 `pendingOutputs.has(...)` false.
2. 통합 — Source→Stock + Stock slot 1 → Sink 그래프에서 overflow 발생 시 케이블이 *solid* (dashed 가 아님).

### 2.5 의존성
- 인프라 PR (§1). animationLoop mock 필요.
- 단기 P3 와 commit 형식이 일관 — 단기 머지 후 진행이 깔끔.

### 2.6 예상 작업량
- 0.4 일.

---

## 3. P7 — `pendingOutputs ↔ validOutputs` 상호 배타가 디스크립터 단위 강제 안 됨

### 3.1 위치
- `packages/core/src/execution/kinds.ts` 전반 — 디스크립터들이 `ctx.validOutputs.add(...)` 만 호출하고 `ctx.pendingOutputs.delete(...)` 는 *value/stock* 만.
- ctx 정의: `kinds.ts:130~200` (PropagateContext)
- 인접 fix: 단기 P3 의 commit 9 필드화가 base.

### 3.2 변경 — 두 가지 선택지

**옵션 A — ctx 표면 좁히기 (구조 개편 §6.2 (a) 부분 도입)**:
- ctx 의 `validOutputs`/`pendingOutputs` 를 set 직접 노출에서 *헬퍼 메서드*로 교체.
- `ctx.setSlotValid(slotKey)` — 내부에서 validOutputs.add + pendingOutputs.delete.
- `ctx.setSlotInvalid(slotKey)` — 내부에서 validOutputs.delete.
- `ctx.setInvalidReason(nodeId, reason)` — invalidReasons 갱신.

**옵션 B — 디스크립터 본문 일괄 정정**:
- 7 개 디스크립터에 `pendingOutputs.delete(...)` 호출을 추가.
- 표면 그대로 두고 *모든 add 위치에 delete 동반*하는 규칙을 PR description 에 명시.

→ 권고 **A**. 9 개 디스크립터에 흩어진 규칙을 *컴파일러로 강제*. 표면이 좁아져 향후 fix 가 디스크립터 한 파일만 손대면 됨.

### 3.3 의존성과 순서
- 장기 §6.2 (a) ctx 표면 좁히기의 *첫 단계*가 된다. 다만 P7 이 중기에 들어가 있으므로, 이 부분을 *부분적으로 도입* 한다:
  - ctx 에 헬퍼 *추가* (기존 set 도 그대로 노출).
  - 9 개 디스크립터를 헬퍼 사용으로 교체.
  - 마지막에 ctx 의 set 직접 노출을 *디스크립터 외부 (호스트)* 에만 허용 — 디스크립터는 헬퍼만.

다음 장기 PR 에서 set 노출을 완전히 private 화.

### 3.4 변경 범위
- `packages/core/src/execution/kinds.ts` — ctx 정의에 헬퍼 추가 + 디스크립터 9 개 본문 교체.
- 또는 **장기 (a) 와 디스크립터 파일 분리 후로 미루는 것이 더 깔끔**. 그러나 P6 의 stock 슬롯 1/2 fix 와 같은 모티프이므로 *함께* 가는 편이 회귀 검사 효율.

### 3.5 검증
1. 단위 테스트 — `packages/core/tests/descriptor.invariant.test.ts`:
   - 9 개 디스크립터 각각에 대해 fake ctx 로 propagate 호출 → `validOutputs ∩ pendingOutputs === ∅` 확인.
   - 슬롯이 valid 가 되면 pending 에서 자동 제거 확인.

### 3.6 예상 작업량
- 0.8 일 (디스크립터 9 개 본문 교체 + 단위 테스트).

### 3.7 회귀 위험
- moderate-high. 디스크립터 본문 *모두* 손대므로 typecheck/test 압박. 장기 (b) 의 디스크립터 파일 분리 *이후* 진행하면 PR 단위가 줄어드는 이점 — 다만 그러면 중기 일정 늘어남.

→ 최종 권고: P7 을 *장기 (a) 와 묶어* 진행. 본 중기 PR 에서는 **헬퍼 추가만**, 디스크립터 교체는 (a) PR 에서.

---

## 4. P8 — ObserveNode 본체(slot 0) invalid + 추출(slot 1) valid → 노드 단위 isValid=true 오판

### 4.1 위치
- `packages/core/src/execution/recompute-node.ts:228~231` (`isValid = outputSlotKeys.some(...)`)
- `packages/projector-web/src/store/model-store.ts:885~890` (`slotBecameInvalid` + `becameInvalid`)
- ObserveNode propagate 의 슬롯별 valid 분기 (`kinds.ts:894~905`)

### 4.2 현재 동작
- `becameInvalid = (wasValid && !isValid) || slotBecameInvalid` — 둘 중 하나만 true 면 트리거.
- 그런데 *노드 단위 wasValid* 가 slot 0/1 중 하나라도 valid 면 true → ObserveNode 의 slot 0 invalid + slot 1 valid 인 상태에서 wasValid=true.
- 다음 펄스에 slot 0 이 *invalid 그대로* 인 상태에서 `isValid = some(...) === true` (slot 1 이 여전히 valid). `wasValid && !isValid` 가 false.
- `slotBecameInvalid` 가 충분하면 다행이지만, slot 1 도 slot 0 도 valid 변화 없으면 통과.
- 결과: slot 0 의 invalid 상태가 *cascade 트리거를 못 받음* → ValueNode 다운스트림이 stale.

### 4.3 변경
- `becameInvalid = slotBecameInvalid` 로 단순화 — 노드 단위 OR 제거.
- *주석 정정 필수* — `model-store.ts:884~889` 주석이 노드 단위/슬롯 단위 *결합* 이라고 적어 둠. 의도가 슬롯 단위만이면 주석도.

### 4.4 검증
1. 단위 테스트 — `packages/projector-web/tests/observe-slot0-invalid.test.ts`:
   - ObserveNode 본체에 source 가 invalid 가 된 펄스가 도착 → recompute 후 slot 0 invalid 인데 slot 1 valid 유지 → becameInvalid 트리거.
   - slot 0 → ValueNode 의 source 가 cascade 로 invalid 가 되는지 확인.

### 4.5 의존성
- 단기 P1 의 prior 보존이 *이 fix 의 cascade 가 의도대로 동작*하기 위한 전제. P1 이후 진행.

### 4.6 예상 작업량
- 0.3 일.

---

## 5. P9 — `executeModel` 의 `simulationTimeMs` 가 항상 0 → trajectory 시간축 손실

### 5.1 위치
- `packages/core/src/execution/execute.ts:14~25` — ExecuteOptions 에 stepIntervalMs 없음.
- `packages/core/src/execution/execute.ts:50~61` — propagateOneStep 호출 시 stepIntervalMs 미전달.
- `packages/core/src/execution/propagate.ts:40~80` (propOpts) — stepIntervalMs 0 기본.
- `packages/projector-web/src/store/model-store.ts:202~208` — executeModel 호출.

### 5.2 변경
- `ExecuteOptions` 에 `stepIntervalMs?: number` 추가 (기본 0 유지 — 기존 호출자 무영향).
- `executeModel` 내부 propOpts 에 stepIntervalMs 전달.
- 매 step 후 propOpts 의 simulationTimeMs (또는 state.simulationTimeMs) 가 누적되도록 propagate.ts 도 함께 확인 — *이미 그렇게 되어 있다면* execute.ts 만 손대면 끝.
- model-store 의 호출자 (`:202`) 가 STEP_TICK_MS (또는 FIXED_DT_MS) 전달.

### 5.3 검증
1. 단위 테스트 — `packages/core/tests/execute-time-axis.test.ts`:
   - executeModel 호출 시 stepIntervalMs=16, steps=10 → trajectory[9].simulationTimeMs === 144 (또는 step*dt 의 결과).
   - 기본 (stepIntervalMs 미전달) 은 0 유지.
2. 통합 — model-store 가 STEP_TICK_MS 전달 시 ObserveNode 의 throttle 비교가 *정상 작동*.

### 5.4 의존성
- 없음. 독립.

### 5.5 예상 작업량
- 0.4 일.

### 5.6 부수 효과
- trajectory[i] 의 simulationTimeMs 가 step 누적으로 박힘. playback step 재생 시 시간 의존 노드가 정확한 시간 컨텍스트로 commit.

---

## 6. P10 — pulse-registry ↔ model-store paused 전이 순서 의존

### 6.1 위치
- `packages/projector-web/src/pulse/pulse-registry.ts:74~89` (paused subscribe — pausedAt 갱신 + pulse startTime 보정)
- `packages/projector-web/src/store/model-store.ts:590~617` (paused subscribe — 시드 분기)
- 두 모듈이 *각각 독립적으로* `timeSettingsStore.subscribe`.

### 6.2 현재 동작
- 두 subscribe 의 호출 순서는 *구독 등록 순서*. 명시되어 있지 않음.
- 우연히 안전: model-store 의 unpause 분기에서 spawn 한 펄스의 `startTime` 이 pulse-registry 의 pausedAt 갱신 후에 박힘.
- 신규 subscriber 추가 시 깨질 수 있음.

### 6.3 변경 — 두 선택지

**옵션 A — 단일 진행자 (orchestrator)**:
- `packages/projector-web/src/store/simulation-orchestrator.ts` (신규) — paused 전이 처리의 *단일 진입점*.
- pulse-registry 와 model-store 는 orchestrator 만 구독.
- orchestrator 내부에서 호출 순서 명시: (1) pausedAt 박제 (2) startTime 보정 (3) model-store 시드 분기.

**옵션 B — 시드 책임을 pulse-registry 로 이관**:
- pulse-registry 가 시드 시점도 책임. model-store 는 spawn 만.
- 책임 경계가 좁아지지만 시드 시 model 조회가 필요해 의존이 늘어남.

→ 권고 **A**. 장기 §6.2 (c) model-store 책임 분리의 *첫 외부 모듈*이 됨.

### 6.4 변경 범위
- 신규 파일 `simulation-orchestrator.ts`.
- model-store 의 timeSettingsStore.subscribe 를 orchestrator.onPausedChange callback 으로 교체.
- pulse-registry 동일.

### 6.5 검증
1. 단위 테스트 — `packages/projector-web/tests/orchestrator.paused-order.test.ts`:
   - paused=true → false 전이 시 (a) pausedAt 갱신 → (b) pulse startTime 보정 → (c) model-store 시드 순으로 호출되는지 spy.
2. 통합 — Source→Sink 그래프, paused 토글 후 첫 펄스의 startTime 이 pausedAt 보정 *후* 박힘.

### 6.6 의존성
- 단기 P5 의 scrub paused 가드와 인접. 단기 후 진행이 깔끔.
- 인프라 PR (§1) 의 createIsolatedTimeSettingsStore 헬퍼 필요.

### 6.7 예상 작업량
- 0.8 일 (orchestrator 설계 + 두 모듈 교체 + 테스트).

---

## 7. 중기 합계

- 코드 변경 약 200~300 줄 (인프라 + P6/P7 헬퍼/P8/P9/P10 orchestrator).
- 회귀 테스트 11~13 건.
- 총 예상 작업량 **3.4 일** (인프라 0.7 + P6 0.4 + P7 헬퍼만 0.3 + P8 0.3 + P9 0.4 + P10 0.8 + 통합 0.5).
- PR 7 개 — 인프라 1 / P6 / P7-헬퍼-only / P8 / P9 / P10 / 통합 검토.

P7 의 디스크립터 본문 교체는 **장기 (a) 와 묶음** — 본 중기에선 헬퍼 추가만.

---

## 8. 의존성 표 (단기 → 중기 → 장기)

| 후행 | 선행 | 이유 |
|---|---|---|
| 인프라 PR | (없음) | 단기와 병행 가능. |
| P6 | 인프라 + 단기 P3 | animationLoop mock + commit 형식 일관 |
| P7 헬퍼 | 인프라 | ctx 헬퍼는 core 영역이지만 테스트 인프라가 도움. |
| P8 | 단기 P1 | prior 보존이 cascade 의 전제. |
| P9 | (없음) | 독립. |
| P10 | 단기 P5 + 인프라 | scrub 가드 + isolatedTimeSettingsStore |
| 장기 (a) | P7 헬퍼 | 디스크립터 교체의 base. |
| 장기 (c) | P10 | orchestrator 가 책임 분리의 base. |
| 장기 (e) | 단기 P3 | commit 9 필드화가 base. |

---

## 9. 회귀 테스트 슬릇 (중기 합계 11 건)

| # | 위치 | 대상 |
|---|---|---|
| T10 | `packages/projector-web/tests/spawn-stock-slot-pulse.test.ts` | spawnStockSlotPulse 가 valid add + pending delete (P6) |
| T11 | `packages/projector-web/tests/spawn-stock-slot-pulse.test.ts` | Stock slot 1/2 케이블이 solid (P6 통합) |
| T12 | `packages/core/tests/descriptor.invariant.test.ts` | 9 개 디스크립터 valid ∩ pending = ∅ (P7 헬퍼) |
| T13 | 같은 파일 | setSlotValid 호출 후 pending 자동 제거 (P7 헬퍼) |
| T14 | `packages/projector-web/tests/observe-slot0-invalid.test.ts` | ObserveNode slot 0 invalid 시 cascade 트리거 (P8) |
| T15 | 같은 파일 | slot 1 valid 유지 (P8 반증) |
| T16 | `packages/core/tests/execute-time-axis.test.ts` | stepIntervalMs 전달 시 trajectory 시간축 누적 (P9) |
| T17 | 같은 파일 | stepIntervalMs 미전달 시 0 유지 (P9 기본 호환) |
| T18 | `packages/projector-web/tests/orchestrator.paused-order.test.ts` | unpause 시 (a)(b)(c) 호출 순서 (P10) |
| T19 | 같은 파일 | 신규 subscriber 추가가 순서 깨뜨리지 않음 (P10 회귀) |
| T20 | `packages/projector-web/tests/integration.short-term-mid-term.test.ts` | 단기+중기 fix 통합 검증 (전체) |

---

## 10. 인프라 PR 의 산출물 사용처

- 단기 plan §8 의 T2/T6/T7/T8/T9 가 모두 *projector-web/tests/* 에 새로 들어옴.
- 중기의 T10/T11/T14/T15/T18/T19 도 동일.
- 즉 단기 PR 머지 *직전* 또는 *동시*에 인프라 PR 이 머지되어야 단기의 회귀 테스트가 깨끗하게 추가.

---

## 11. 이 단계가 끝나면 열리는 것

- **장기** 의 (a) ctx 표면 좁히기 완전 도입 — P7 의 헬퍼가 base.
- **장기** 의 (c) model-store 책임 분리 — P10 의 orchestrator 가 base.
- **장기** 의 (e) ExecutionState commit 단일 진입 — 단기 P3 + 중기 P6 의 commit 형식 일관이 base.
- 감사 §4.8 의 11 개 테스트 슬릇 중 단기+중기로 7 개 채움. 나머지 4 개는 장기에서.

---

(끝)
