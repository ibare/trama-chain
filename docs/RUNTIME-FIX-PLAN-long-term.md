# 장기 구조 개편 실행 계획 — §6.2 (a)~(f) 통합 (2026-05-20)

> 감사 리포트 `RUNTIME-AUDIT-2026-05-20.md` §6.2 의 6 트랙.
> 단기 (`RUNTIME-FIX-PLAN-short-term.md`) / 중기 (`RUNTIME-FIX-PLAN-mid-term.md`) plan 의 후속.
> §6.2 (b) 디스크립터 파일 분리 plan 은 별도 (`RUNTIME-REFACTOR-PLAN-kinds-split.md`).

---

## 0. 공통 사항

- **목표**: 감사 리포트 §1 의 "invariant 가 코드 구조로 강제되지 않은 채 주석/관행으로만" 상황을 *코드 구조*로 옮긴다.
- **순서 결정 원리**: 의존 그래프 + 회귀 위험 분포 + *사용자 가시 영향이 적은 트랙부터*.
- **PR 단위**: 트랙당 1~3 PR. 총 12 ~ 15 PR.
- **검증**: 트랙별 검증 절차는 각 §에. 공통: `pnpm -r typecheck` + `pnpm -r test:run` + (해당 시) `.d.ts` export diff.
- **사용자 가시 영향**: 모든 트랙이 *내부 구조* 변경. 외부 surface 동작은 동일. UX 변화 0 목표.
- **단기·중기 완료 가정**: 단기 P1~P5 + 중기 인프라/P6/P8/P9/P10 + 중기 P7 헬퍼 추가가 모두 머지된 상태에서 시작.

---

## 1. 트랙 개요와 순서

| 순서 | 트랙 | 감사 §6.2 | 별도 plan | 핵심 가치 |
|---|---|---|---|---|
| L1 | 디스크립터 파일 분리 | (b) | `RUNTIME-REFACTOR-PLAN-kinds-split.md` | 후속 트랙들의 단위를 좁힌다. |
| L2 | ctx 표면 좁히기 | (a) | 본 문서 §3 | 디스크립터 invariant 컴파일러 강제. P7 의 완전한 도입. |
| L3 | ExecutionState commit 단일 진입 | (e) | 본 문서 §4 | 11 곳 commit 의 누락 위험 차단. |
| L4 | invariant selector 단일 진실 | (d) | 본 문서 §5 | EdgeView ↔ spawn 의 이중 진실 통합. |
| L5 | model-store 책임 분리 | (c) | 본 문서 §6 | handlePulseArrival 분기 폭주 해체. |
| L6 | 주석은 진실이 아님 — 코드 강제 | (f) | 본 문서 §7 | assertEditable / 죽은 토글 / 죽은 호출 제거. |

### 1.1 순서 결정 근거
- **L1 먼저** — 후속 모든 트랙이 *한 파일만 손대게* 줄여줌. PR 단위 축소 효과 최대.
- **L2 (ctx 좁히기)** — 디스크립터 파일이 9 개로 분산된 직후 헬퍼 교체. 한 파일씩 진행 가능.
- **L3 (commit 단일 진입)** — model-store 책임 분리(L5) 의 전제 — 11 곳 commit 을 *하나의 헬퍼*로 모은 뒤 분리.
- **L4 (selector 단일 진실)** — EdgeView 의 selector 와 spawn 의 가드가 같은 invariant 를 두 번 표현. L5 의 spawn 분리 전에 selector 화.
- **L5 (model-store 분리)** — 가장 큰 트랙. L2~L4 의 단단함 위에서 진행.
- **L6 (주석 ↔ 코드 일치)** — 마지막. 위 트랙이 만든 *정확한* 코드 위에서 주석 정정 + 죽은 코드 제거.

---

## 2. 의존성 그래프

```
[단기 P1~P5] ──┐
[중기 인프라] ──┼──> L1 (kinds-split) ──┬──> L2 (ctx 좁히기)
[중기 P6~P10] ─┘                       │
                                       ├──> L3 (commit 단일) ──> L5 (model-store 분리)
                                       │                        │
                                       └──> L4 (selector 단일) ─┘
                                                                ↓
                                                              L6 (주석 ↔ 코드)
```

- L2/L3/L4 는 **L1 후 병렬 가능**. 단 L2 가 P7 헬퍼 도입의 완성이라 우선.
- L5 는 L3/L4 *둘 다* 끝나야 깔끔.
- L6 은 마지막.

---

## 3. L2 — ctx 표면 좁히기 (감사 §6.2 (a))

### 3.1 목표
- 디스크립터가 ctx 의 *set 객체*(validOutputs/pendingOutputs/invalidReasons/observeBuffers/...)에 직접 mutate 못 하게.
- 대신 ctx 가 제공하는 *명시 헬퍼*만 사용:
  - `setSlotValid(slot)` / `setSlotInvalid(slot, reason?)`
  - `pushObserveSample(node, sample)`
  - `emitSequence(slotKey, seq)`
  - `advanceGeneratorCursor(node, runtime)`
  - `appendInvalidReason(node, reason)` — drop in 시 set 어디서나.

### 3.2 전제
- 중기 P7 의 헬퍼 *추가*가 이미 머지된 상태.

### 3.3 진행 단계
| 단계 | 내용 |
|---|---|
| L2-1 | ctx 정의 (`kinds/context.ts` — L1 후) 에 헬퍼 시그니처 + 기본 구현 추가. set 직접 노출은 아직 유지 (혼재). |
| L2-2 | 9 개 디스크립터 (`kinds/descriptors/*.ts`) 의 본문을 헬퍼 사용으로 교체. PR 9 개로 *디스크립터 1 개당 1 PR* — 진행 동안 그래프 시각·실행 회귀 검사. |
| L2-3 | ctx 의 set 직접 노출을 *디스크립터 외부 (호스트 propagate)* 에만 허용. 즉 PropagateContext 의 `validOutputs` 등을 `readonly` 로 표면 변경. 디스크립터는 readonly 만 봄. |
| L2-4 | typescript strict: 디스크립터가 set 에 add/delete 호출 시 컴파일 에러. |

### 3.4 검증
- **단위 테스트**: 중기 T12/T13 의 invariant 테스트가 *9 개 디스크립터 전부에 대해 통과* 하도록 확장.
- **회귀**: 디스크립터 교체 PR 마다 시각 회귀 손 검증 (해당 노드 종류만).

### 3.5 예상 작업량
- L2-1: 0.3 일. L2-2: 9 PR × 0.3 일 ≈ 2.7 일. L2-3: 0.5 일. L2-4: 0.3 일. 합 **3.8 일**.

### 3.6 회귀 위험
- moderate. 디스크립터 본문 변경이라 시각·인과 회귀 가능. L1 후 *디스크립터 1 개씩* 진행하면 PR 단위로 격리.

---

## 4. L3 — ExecutionState commit 단일 진입 (감사 §6.2 (e))

### 4.1 목표
- 현재 model-store 의 *11 곳* 에서 setState 가 ExecutionState 의 부분/전체를 갱신.
- 단일 헬퍼 `commitExecutionState(partial: Partial<ExecutionState>)` 로 강제.
- 새 ExecutionState 필드 추가 시 *어디서 빠뜨렸는지* 자동 검출.

### 4.2 진행 단계
| 단계 | 내용 |
|---|---|
| L3-1 | `commitExecutionState` 헬퍼 도입 (`packages/projector-web/src/store/execution-commit.ts`). 인터페이스: `commitExecutionState(set, partial) → newState`. |
| L3-2 | 11 곳을 헬퍼 호출로 교체. 한 PR 에 모두 — diff 크지만 mechanic 변환. |
| L3-3 | snapshot 비교 테스트 추가 — partial 누락 시 alarm. |

### 4.3 검증
- 단위 테스트 `commit-execution-state.test.ts` — 8 필드 partial 갱신 시 prev state 의 다른 필드 보존.
- 통합 — 단기/중기 회귀 테스트 전체 재실행.

### 4.4 예상 작업량
- 1.0 일.

### 4.5 부수 효과
- L5 의 분리가 깔끔해짐. handlePulseArrival 의 3 분기가 모두 같은 헬퍼 호출.

---

## 5. L4 — invariant selector 단일 진실 (감사 §6.2 (d))

### 5.1 목표
- 같은 invariant 가 EdgeView selector 와 spawn 의 valid 가드 양쪽에 표현되어 있는 *3 개* 항목을 단일 selector 로:
  - branching slot 의 active 여부.
  - continuous source 여부.
  - source value resolve (`unwrap` 한 스칼라).
- 그 selector 가 *유일한 진실*. EdgeView 와 spawn 모두 호출.

### 5.2 위치
- `packages/projector-web/src/edge/EdgeView.tsx:109~121, 198~204, 90~101`
- `packages/projector-web/src/store/model-store.ts:639~660` (spawnOutgoingPulses 의 가드)

### 5.3 진행 단계
| 단계 | 내용 |
|---|---|
| L4-1 | selector 모듈 `packages/projector-web/src/store/edge-selectors.ts` 도입 — `selectIsSlotActive(state, nodeId, slot)`, `selectIsContinuousSource(state, nodeId)`, `selectResolvedSourceValue(state, nodeId, slot)`. |
| L4-2 | EdgeView 의 useSyncExternalStore selector 를 위 selector 호출로 교체. |
| L4-3 | spawnOutgoingPulses 의 가드를 같은 selector 로 교체. |
| L4-4 | 시각·인과 회귀 손 검증 (단기 P4 와 인접). |

### 5.4 검증
- 단위 테스트 `edge-selectors.test.ts` — 9 디스크립터 각각의 slot 에 대해 selector 가 일관 반환.
- 시각 회귀 — 단기 P4 의 paused 가드와 통합 후 stroke 동작.

### 5.5 예상 작업량
- 1.2 일.

### 5.6 부수 효과
- EdgeView 의 selector 와 spawn 의 가드가 같은 모듈을 호출 → 변경 시 *한 곳만* 손대면 됨. 감사 §4.5 의 이중 진실 해소.

---

## 6. L5 — model-store 책임 분리 (감사 §6.2 (c))

### 6.1 목표
- 1370 줄 model-store 를 5 파일로 분리:
```
store/
  model-store.ts          # model state + mutation actions
  execution-store.ts      # executionState commit 경로 단일화 (L3 의 헬퍼 사용)
  simulation/
    simulation-loop.ts    # RAF 펌프
    pulse-arrival.ts      # handlePulseArrival 의 3 분기 분리
    spawn-policy.ts       # spawnOutgoingPulses / spawnStockSlotPulse
    execution-merge.ts    # computeExecutionState prior/fresh 머지
    orchestrator.ts       # paused/playback 전이 (중기 P10 의 결과)
```

### 6.2 진행 단계
| 단계 | 내용 |
|---|---|
| L5-1 | `execution-merge.ts` 분리 — 순수 함수. PR 작음. |
| L5-2 | `spawn-policy.ts` 분리 — L4 의 selector 사용. |
| L5-3 | `pulse-arrival.ts` 분리 — generator/stock/일반 3 분기를 각각 *별도 함수*. handlePulseArrival 은 dispatcher 만. |
| L5-4 | `simulation-loop.ts` 분리 — RAF / accumulator / ticker. |
| L5-5 | `orchestrator.ts` 는 중기 P10 결과를 흡수. |
| L5-6 | `execution-store.ts` — executionState 만 책임. mutation 액션은 model-store 에서 commit 헬퍼 호출. |
| L5-7 | 남은 model-store 는 mutation 액션 + assertEditable 만. |

### 6.3 검증
- 단계마다 typecheck + test 전체.
- 시각·인과 회귀 손 검증.

### 6.4 예상 작업량
- L5-1 ~ L5-7 합 **4.5 일** (L5-3 의 분기 분리가 가장 큼 1.5 일).

### 6.5 회귀 위험
- **high**. 책임 분리는 mechanic 변환이지만 closure 7 개의 의미 보존이 까다로움. PR 별로 *해당 closure 만 노출 → import* 형태.

---

## 7. L6 — 주석은 진실이 아님 — 코드 강제 (감사 §6.2 (f))

### 7.1 목표
- 감사 §5 의 A~T 20 건 + §9 73 건 중 *코드 변경* 그룹을 정리.
- 죽은 토글 / 죽은 호출 / 주석 vs 실제 불일치 제거.
- *주석이 단언하는 invariant* 는 런타임 assert 또는 타입으로 강제.

### 7.2 진행 단계
| 단계 | 내용 |
|---|---|
| L6-1 | 죽은 코드 제거 — `EDGE_PHYSICS_ENABLED` 토글 (`cable-physics.ts:42~43`), `updateNode:1156` 의 죽은 `spawnOutgoingPulses` 호출. |
| L6-2 | 주석 정정 — §5 표의 D/E/K/O/T (한 줄 주석 변경). |
| L6-3 | invariant 의 런타임 assert — `assertEditable` 의 단언처럼 *주석이 단언하는* invariant 를 *진입점에 검증*. 예: PropagateContext 의 set 직접 노출이 (L2-4 의 readonly 강제로) 컴파일러로 보장됨. ObserveExtractionRuntime 의 lifecycle 가정도 runtime assert. |
| L6-4 | 감사 §9 전체 항목 중 *남은 73 - 위 단계 처리분* 을 PR 1~2 개로 처리. 각각은 *한 줄* 정정. |

### 7.3 검증
- 단위 테스트는 *없음 → 추가하지 않음*. 코드/주석 일치는 코드 리뷰 + grep.
- `grep -rn "EDGE_PHYSICS_ENABLED" packages/` → L6-1 후 0 건.

### 7.4 예상 작업량
- 1.5 일.

---

## 8. 장기 합계

- 트랙 6 개. PR 12 ~ 15 개.
- 코드 변경 1000 ~ 1500 줄 (mechanic 변환 다수).
- 회귀 테스트 추가 ~20 건 (장기에서).
- 총 예상 작업량 **12 ~ 16 일** (L1 1 일 + L2 3.8 일 + L3 1 일 + L4 1.2 일 + L5 4.5 일 + L6 1.5 일 = 13 일).

---

## 9. 단기 + 중기 + 장기 통합 작업량

| 단계 | 예상 작업량 |
|---|---|
| 단기 (P1~P5) | 2.0 일 |
| 중기 (인프라 + P6~P10) | 3.4 일 |
| 장기 (L1 ~ L6) | 13 일 |
| **합계** | **약 18 ~ 20 일** |

분배 권고:
- 단기 → 중기 인프라/P6/P8/P9/P10 → 중기 P7 헬퍼 → 장기 L1 → 장기 L2~L4 (병렬) → 장기 L5 → 장기 L6.
- 사용자 가시 가치는 단기에서 최대 (시각·인과 불일치 즉시 차단). 장기는 *향후 버그 빈도 축소* 가치.

---

## 10. 회귀 검증 종합 표

| 위치 | 테스트 수 | 단기 | 중기 | 장기 |
|---|---|---|---|---|
| `packages/core/tests/` | +6 | T1/T3/T4/T5 | T12/T13/T16/T17 | L2 의 9 디스크립터 invariant 확장 |
| `packages/projector-web/tests/` | +14 | T2/T6/T7/T8/T9 | T10/T11/T14/T15/T18/T19/T20 | L4 의 edge-selectors, L5 의 분기 모듈별 |
| 인프라 helpers | +4 모듈 | — | animationLoop/pulse-deps/timeSettings/test-registry | — |

---

## 11. 사용자 가시 영향 검토

- **단기**: 시각 정지 일관성(P4) + 모델 mutation 차단(P5) + cascade 정확성(P1/P2/P3) 회복. 사용자 즉시 체감.
- **중기**: Stock 슬롯 1/2 정확 시각화(P6) + ObserveNode cascade(P8) + trajectory 시간축(P9) + paused 전이 견고성(P10). 사용자 체감 — 중간 수준.
- **장기**: *0*. 외부 surface 동작 동일. 가치는 *향후 같은 종류 버그의 90% 차단*.

---

## 12. 롤백 전략 (트랙별)

| 트랙 | 롤백 단위 | 안전성 |
|---|---|---|
| L1 | PR 1 개 revert | 단순 — 코드 이동만. |
| L2 | 9 PR 각각 revert | 한 디스크립터씩이라 안전. |
| L3 | PR 1 개 revert | 11 곳 동시 변경 — diff 크지만 mechanic. |
| L4 | PR 1 개 revert | EdgeView 와 spawn 양쪽 의존 — 통째로. |
| L5 | 단계별 7 PR 각각 revert | 분기 분리는 *역순*으로만 revert 안전. |
| L6 | 작은 PR 들 — 개별 revert. | 가장 안전. |

---

## 13. 후속 — 장기 끝나면 무엇이 남는가

- 감사 §1 의 "invariant 가 코드 구조로 강제되지 않은 채 주석/관행으로만" 이 **부분 해소** — 7 ~ 10 군데 분산 invariant 가 *3 곳 이하* 로.
- 9 개 디스크립터 추가/변경의 *영향 범위*가 *해당 디스크립터 파일 + invariant 테스트 1 건* 으로 좁아짐.
- 사용자 체감: *동일*. 그러나 다음 6 개월 동안 시각·인과 회귀 빈도가 *통계적으로* 축소.
- 다음 milestone 에 추가 검토: 디스크립터 라이프사이클의 *공식 type 정의* (`branching`/`pendingPolicy`/`raw`), `ObserveExtractionRuntime` 의 *코어 vs UI 분리*, *Stock rate 슬롯의 정식 모델링*.

---

(끝)
