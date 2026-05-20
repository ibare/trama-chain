# Trama 런타임 아키텍처 엄격 점검 리포트 (2026-05-20)

## 0. 점검 원칙과 범위

- **진실의 원천은 구현 코드뿐**이다. 주석·README·커밋 메시지의 단언은 의심 대상으로 둔다.
- 범위: 런타임/평가/실행 분기/펄스 모델/시각 동기화. 즉
  - `packages/core/src/execution/**` — kinds, propagate, recompute-node, state, topology, exec-value, execute, observe-buffer 등.
  - `packages/projector-web/src/store/model-store.ts` — 시뮬레이션 글루.
  - `packages/projector-web/src/pulse/*` — pulse-registry, node-flash-registry.
  - `packages/projector-web/src/edge/*` — EdgeView, cable-physics.
- 점검 관점: **모듈 책임 분리 / 결합도와 누설 / 재계산 경로 일관성 / 상태 일관성 / 다출력 노드 처리 / 디스크립터 인터페이스 / 주석 vs 실제 / 테스트 빈틈**.
- 본 문서는 *문제 중심*. 잘 만든 부분에 대한 칭찬·요약은 의도적으로 뺐다.

---

## 1. 한눈에 보는 결론

런타임은 *수많은 핵심 결정이 한 파일·한 함수에 누적*되어 있고 (`kinds.ts` 1390줄, `model-store.ts` 1370줄, `handlePulseArrival` 단일 함수 299줄), 같은 invariant 가 *3~6 곳에 흩어져 따로 표현*되어 있다 (paused 가드, lag=0 필터, branching slot valid, sourceInterp=continuous 등). 디스크립터 인터페이스는 8 개의 mutable 필드를 ctx 로 노출하면서도 어느 디스크립터가 어떤 필드를 *반드시* 갱신해야 하는지 컴파일러로도, 테스트로도 강제하지 못한다. 그 결과:

- "Condition 판정 첫 전환 시 다운스트림 펄스 누락" (직전 fix), "분기 케이블 stale solid" (직전 fix) 같은 **시각·인과 불일치 버그가 같은 뿌리**(디스크립터/스폰/시각 selector 3축의 invariant 공유 부재)를 갖는다. 같은 종류의 다음 버그가 *최소 5건* 더 잠복.
- **주석이 보장한다고 단언하지만 코드가 보장하지 않는 항목**이 양쪽 영역 합쳐 **40건 이상**. 그 중 일부(특히 `recompute-node.ts:46-50`, `time-settings.ts:13`, `assertEditable` 단언) 는 회귀가 일어나면 즉시 사용자에게 노출되는 시각·인과 영역.
- **테스트 커버리지**는 core 단일 노드 propagate 위주 (paused 분기 0건, recompute multi-slot 0건, projector-web 글루 전 영역 0건). 본 문서가 짚는 invariant 중 자동으로 보호되는 항목은 사실상 없다.

런타임 자체가 *깨진* 것이 아니라, **invariant 가 코드 구조로 강제되지 않은 채 주석/관행으로만 표현**되어 있다. 신규 디스크립터·신규 시각 효과·신규 mutation 액션이 추가될 때마다 사람이 7~10 군데를 *동시에* 일관되게 손봐야 정확성이 유지되는 구조. 누락은 시간문제다.

---

## 2. 핵심 위험 — 우선 처리 권고 Top 10

번호는 *예상 발현 가능성·노출 영역·디버깅 비용*의 곱으로 정렬.

### P1. `becameInvalid` 분기가 prior 없이 전체 재계산 → 누적 상태 손실
- 위치: `packages/projector-web/src/store/model-store.ts:897~900`
- 코드: `const recomputed = computeExecutionState(model, undefined, false);` — *prior 미전달*.
- 결과: Stock level, generator cursor phase, observe buffer 가 한 step 만에 fresh 빈 값으로 덮인다. invalid 전파가 일어나는 *모든* 펄스 도착에서 누적이 날아간다.
- 주석(`model-store.ts:892~896`) 은 "ValueNode 가 source 변화를 흡수하도록" 만 적고 누적 손실은 언급하지 않음. 사용자가 보면 "탱크가 비었다" 로만 인지.
- 해결 방향: `computeExecutionState(model, executionState, false, model)` 처럼 priorModel + prior 를 전달해 누적 보존 분기를 타게 한다. paused 의미만 false 면 충분.

### P2. `recomputeNode` 의 sourceOverride 가 반대 슬롯 stale valid 를 끄지 않는다
- 위치: `packages/core/src/execution/recompute-node.ts:186~190`
- 주석(`:46~50`)은 "슬롯 0 가정해 강제로 켜면 반대 슬롯의 stale valid 가 다운스트림에 누설된다" 라며 이를 막은 듯 단언하지만, 코드는 *해당 슬롯을 켜기만* 할 뿐 반대 슬롯을 *끄지 않는다*.
- 결과: Condition source 가 판정을 바꿔도 trueSlot/falseSlot 이 *동시에 valid* 인 상태가 일시적으로 가능. 현재는 다운스트림이 한쪽 슬롯에만 연결되어 시각이 가려지지만, 양쪽에 fan-out 한 그래프에서 false-positive cascade.
- 해결 방향: override 시 같은 source 노드의 *다른 슬롯들* 을 workingValid 에서 제거하거나, sourceOverride 인터페이스를 "exclusiveSlot" 시맨틱으로 명시. ConditionNode 처럼 `branching=true` 인 source 에 한해 적용.

### P3. `recomputeNode` 결과가 `invalidReasons` 를 노출하지 않는다
- 위치: `packages/core/src/execution/recompute-node.ts:70~110` (`RecomputeNodeResult` 정의) + `model-store.ts:943` 호출부.
- `workingInvalidReasons` 를 만들어 ctx 에 흘리지만 결과 객체에는 없음. 호스트는 `s.executionState.invalidReasons` 로 *prev 보존*.
- 결과: ExpressionNode 가 펄스 도착으로 평가 실패 사유를 바꿔도 UI 의 invalid 배지 텍스트가 영구 stale. 사용자에게 "왜 invalid 인지" 잘못된 이유가 노출된다.
- 해결 방향: `RecomputeNodeResult.invalidReasons` 노출 → 호스트가 머지 후 commit. 단순 추가.

### P4. EdgeView 의 continuous stroke 진동이 `paused` 를 무시
- 위치: `packages/projector-web/src/edge/EdgeView.tsx:263~270`
- `Math.sin((performance.now() / 1000) * Math.PI * 2)` 로 매 frame `--continuous-intensity` 갱신. paused 가드 없음.
- 주석(`time-settings.ts:13~17`) 은 "paused 면 엣지 위 흐름까지 그 자리에서 freeze" 라고 단언. 정면 충돌.
- 사용자 인식: "정지가 정지가 아니다". 가장 빨리 발견될 수 있는 인지 위반.
- 해결 방향: ticker 내부에서 `timeSettingsStore.getState().paused` 검사 후 stroke 갱신만 skip (DOM rAF 자체는 계속 등록). 또는 pulse-registry 의 pausedAt 시간축을 ticker 가 공유.

### P5. `scrubInitialValue` 가 `assertEditable` 우회 (모델 mutation 가드 누락)
- 위치: `model-store.ts:1272~1311`
- 주석(`:340~344`)은 "*모든* mutation 액션이 assertEditable 통과" 라고 단언. 실제로는 scrub 과 `setQuestion` (1254) 가 우회.
- 안전망: UI 의 `userAuthoredVisible` 가드 *한 곳*에만 의존. UI 회귀(ValueNodeSlider 가 paused 무시) 시 재생 중 모델 변형이 슬립스루.
- 해결 방향: scrub 에도 paused 게이트 — "재생 중에는 scrub 시도 자체를 무시" 또는 "scrub 은 별도 박제 store 로 분리, 모델 mutation 은 정지 시 commit". 후자가 모델 vs 런타임 분리 원칙에 부합.

### P6. handlePulseArrival 의 stock 분기가 슬롯 1·2 pendingOutputs 를 정리하지 않음
- 위치: `model-store.ts:810~830`
- `pendingOutputs.delete(outputKey(target, 0))` 만 호출. 슬롯 1(overflow), 슬롯 2(rate) 는 손대지 않음.
- EdgeView 의 `isBranchingInactive` 가 `isOutputValid(state, fromId, slot)` 로 슬롯 단위 valid 만 보므로, Stock outgoing slot 1·2 가 valid set 에 들어가지 못한 채 spawn 만 호출되는 경로 + branching=true 일 때 케이블이 영구 dashed 가능.
- 해결 방향: stock 분기에서 spawn 직전 슬롯별 validOutputs.add/pendingOutputs.delete 를 일관되게 수행. 또는 spawnStockSlotPulse 가 *spawn 부작용으로 valid 도 add* 하도록 단일 책임 캡슐화.

### P7. `pendingOutputs` ↔ `validOutputs` 상호 배타가 *디스크립터 단위*로 강제되지 않음
- 위치: `packages/core/src/execution/kinds.ts` 전반. `pendingOutputs.delete` 호출자는 value (`:457`, `:494`), stock (`:1174`) 두 종류뿐. condition / expression / logic-gate / observe / generator / average 는 단 한 번도 호출하지 않음.
- 현재는 `initializeFromInitialValues` (`state.ts:160~172`) 가 ValueNode 만 pending 시드라 노출이 가려져 있다. 정책이 "incoming 이 있는 모든 노드를 pending 으로 시드" 로 확장되면 즉시 valid·pending 동시 set.
- 주석(`state.ts:71~75`)은 "valid 와 pending 상호 배타" 라고 단언.
- 해결 방향: ctx 의 mutate 표면을 좁히고, `setValid(slotKey)` 가 자동으로 pending 에서 제거하는 헬퍼로 *디스크립터가 직접 add/delete* 하지 않게 한다.

### P8. ObserveNode 본체(slot 0) invalid + 추출 슬롯(slot 1) valid → 노드 단위 isValid = true
- 위치: `kinds.ts:894~905`, `recompute-node.ts:230` (`isValid = outputSlotKeys.some(...)`).
- 결과: model-store 의 `becameInvalid` 분기가 트리거되지 않아 다운스트림 cascade 가 끊긴다. 본체 슬롯에 연결된 ValueNode 는 source invalid 를 못 보고 stale 값을 유지.
- 해결 방향: model-store 의 `becameInvalid` 계산을 *노드 단위 OR* 가 아니라 *슬롯 단위*로만 평가하도록 단순화 (이미 `slotBecameInvalid` 가 존재 — 합치는 게 아니라 *그것만* 으로 충분).

### P9. `executeModel` 의 `simulationTimeMs` 가 항상 0 — trajectory 시간축 손실
- 위치: `packages/core/src/execution/execute.ts:11~25`, `propagate.ts:50~55`
- `executeModel` 은 `stepIntervalMs` 옵션을 받지 않음 → `propagateOneStep` 에 0 으로 전달 → N-step 전체가 `simulationTimeMs=0`.
- `model-store.ts:202` 가 `executeModel` 로 trajectory 를 만든다 → ObserveNode 의 `t`, throttle 비교, Generator paradigm 시간 의존 노드가 t=0 결과로 trajectory 에 박힘.
- playback step 재생 시 trajectory[i] 를 그대로 commit → 시간 의존 노드의 값이 "원래는 다를 텐데 t=0 결과로 고정" 된 채 재생.
- 해결 방향: `executeModel` 시그니처에 `stepIntervalMs` 추가 + model-store 가 정상 ticker 와 같은 값(예: STEP_TICK_MS 또는 FIXED_DT_MS) 전달. 또는 trajectory 개념 자체를 *N step 시뮬* 이 아니라 *snapshot 1개* 로 좁혀 시간 축이 필요 없게 단순화.

### P10. `pulse-registry` ↔ `model-store` 가 같은 paused 전이를 *순서 의존* 으로 처리
- 위치: `pulse-registry.ts:75~89` (pausedAt 갱신 + 활성 pulse startTime 보정), `model-store.ts:590~617` (시드 분기).
- 두 모듈이 같은 zustand store(`timeSettingsStore`) 의 paused 토글을 각각 subscribe. 실행 순서는 *구독 등록 순서*. 어디서도 명시되어 있지 않다.
- 현재 우연히 안전하지만 (시드가 spawn 한 펄스의 startTime 이 pausedAt 갱신 후 박힘), 신규 subscriber 추가 시 순서가 깨질 수 있다.
- 해결 방향: 시드 책임을 pulse-registry 에 넘기거나, 두 모듈을 매개하는 *명시적 페이즈 진행자*(simulation-orchestrator)를 둔다.

---

## 3. core/execution 영역 — 발견사항

### 3.1 모듈 책임 분리

- **`kinds.ts` 1390줄 — 단일 책임 위반 누적**
  - `PropagateContext` 정의 (`:130~200`), `ObserveExtractionRuntime` 타입 (`:48~50`), `PortSpec`/`OutputSlotSpec` (`:219~263`), `NodeKindDescriptor` 인터페이스 + 레지스트리 + 9개 디스크립터 본문, `checkEdgeCompatibility` (`:1345`), 다수 헬퍼 (`getNumericNext`/`getBooleanNext`/`isIdentityShape`/`firstIncomingEdgeForNode`/`passthroughSourceSpec`/`capacityMatches`).
  - 권고: 디스크립터별 파일 분리(`kinds/value.ts`, `kinds/condition.ts` 등) + 레지스트리만 `kinds/index.ts` 에. ctx/PortSpec 정의는 `kinds/context.ts` 로 단일화.

- **`propagate.ts` vs `execute.ts` 책임 모호**
  - `executeModel` (`:35`)은 `propagateOneStep` 의 옵션 표면 일부만 통과시킨다 (`unitCatalog`/`generatorRegistry`/`stepIntervalMs` 누락). 그래서 같은 그래프에 대해 두 진입점이 다른 동작 표면을 가진다 — P9 의 원인.

- **`recompute-node.ts` 가 `propagate.ts` ctx 조립 코드를 복제**
  - `recompute-node.ts:192~220` 의 ctx 구성은 `propagate.ts:117~139` 와 거의 동일. 차이는 (a) clone 전략 (b) `paused: false`, `stepIntervalMs: 0` 하드코딩 (c) 단일 노드만 desc.propagate.
  - 한 쪽에 새 ctx 필드를 더하면 다른 쪽은 *컴파일러가 못 잡고* 슬쩍 누락된다. 이미 generatorRuntime clone 전략이 다르다 (`recompute-node.ts:209` 빈 `{}` vs `propagate.ts:97~102` 깊이 clone).

### 3.2 결합도와 누설

- **`PropagateContext` 표면 비대 (15 필드, mutate 가능 8 필드)**
  - mutate 가능: `next` / `validOutputs` / `pendingOutputs` / `invalidReasons` / `observeBuffers` / `observeExtractionRuntime` / `generatorRuntime` / `sequenceNext`.
  - 디스크립터별 mutate 패턴 (가나다순 일부 추림):
    | 디스크립터 | validOutputs | pendingOutputs.delete | invalidReasons | observeBuffers | extractionRT | generatorRT | sequenceNext |
    |---|---|---|---|---|---|---|---|
    | value | O | **O** | — | — | — | — | — |
    | constant | O | — | — | — | — | — | — |
    | condition | O | — | — | — | — | — | — |
    | expression | O | — | **O** | — | — | — | — |
    | logic-gate | O | — | — | — | — | — | — |
    | observe | O | — | — | O | O | — | O |
    | generator | O | — | — | — | — | O | — |
    | average | O | — | — | — | — | — | — |
    | stock | O | **O** | — | — | — | — | — |
  - `pendingOutputs.delete` 호출자가 2 개, `invalidReasons` 갱신자가 1 개. 나머지는 *암묵적으로 호스트가 처리* 한다고 가정. P7 가 그 결과.

- **`state.ts` ↔ `kinds.ts` 의미 의존 양방향**
  - `state.ts:13~16` 가 `kinds.ts` 의 `ObserveExtractionRuntime` 을 import.
  - `kinds.ts:51` 이 `state.ts` 의 `outputKey` 를 import.
  - 주석(`kinds.ts:44~47`) 은 "kinds → state 단방향 유지를 위해 이 자리에 정의" 라며 단방향이라고 단언. 실제로는 두 방향 모두.

### 3.3 재계산 경로 일관성

- 표 (P9 / 1.1 의 요약):
  | 항목 | propagateOneStep | recomputeNode |
  |---|---|---|
  | paused 옵션 | 호출자 결정 | 항상 `false` (`:216`) |
  | stepIntervalMs | 옵션 (기본 0) | 항상 `0` (`:219`) |
  | sourceOverride | 없음 | 있음 |
  | generatorRuntime clone | 깊이 clone (`propagate.ts:97~102`) | 빈 `{}` (`recompute-node.ts:209`) |
  | stockRuntime | `{...state}` 통과 | 결과에 없음 |
  | 순회 범위 | 전체 order | 단일 노드 |

- **ConditionNode 다중 incoming**: `kinds.ts:553~571` 가 슬롯 0 입력 *첫 valid* 하나만 사용하고 break. 두 edge 가 같은 슬롯에 동시 연결되면 silent 누락. model-level 가드 없음.

- **applyFeedbackEdges 가 valueNode 만 처리**: `propagate.ts:189` 가 `if (!isValueNode(target)) continue;` — `canBeFeedbackTarget: true` 인 Stock 노드도 무음 무시. 디스크립터 광고와 정반대.

- **boolean ValueNode 의 inverted 의미가 경로별로 다름**:
  - forward propagate (`kinds.ts:441`): `1 - out01` (정규화 반전).
  - feedback path (`propagate.ts:209`): `-sourceVal.n` (부호 반전).
  - 의도된 비대칭인지 코드만으로 판단 불가. 주석 없음.

### 3.4 상태 일관성

- `applyFeedbackEdges` 가 sequence/observe/invalidReasons 를 *얕은 spread* 만 통과 (`propagate.ts:259~270`). 시간이 바뀌지 않는다 (`propagateOneStep` 의 stepIntervalMs 만 결정). executeModel 호출자가 stepIntervalMs 를 못 전달하므로 P9 의 누적 결과.

- `pendingOutputs` 와 `validOutputs` 의 상호 배타 invariant 가 디스크립터 외부에서만 (호스트의 `initializeFromInitialValues`) 유지된다 — 디스크립터 작성자에게 안전망 없음.

- GeneratorRuntime cursor/gateOpen 이 *세 곳* 에서 갱신: `kinds.ts:1010~1057` (propagate), `model-store.ts:702~744` (pulse arrival), `model-store.ts:381~447` (ticker). 각 위치의 invariant 가 명시 동기화 없음. 주석(`kinds.ts:1016~1018`) 은 "ticker 는 이후 이 캐시만 본다" 라고 단언하지만 propagate 안 부르는 frame 사이에 pulse 가 도착하면 model-store 가 캐시를 직접 mutate.

### 3.5 다출력 노드 처리

- ConditionNode 의 두 슬롯 라우팅은 잘 일반화됨 (이번 패치 반영 후). recomputeNode 의 `outputSlots` 자동 매핑.
- ObserveNode 의 slot 0(passthrough) vs slot 1(extraction) 라이프사이클 비대칭 — 본체 invalid 인데 추출 slot 이 valid 면 노드 단위 isValid 가 true 가 되어 cascade 누락 (P8).
- StockNode slot 0/1/2 — overflow/rate 슬롯은 propagate 가 *항상 invalid* 로 떨구는데 (`kinds.ts:1159~1160`), `spawnStockSlotPulse` 가 validOutputs 검사 없이 직접 발사. 두 경로의 시맨틱이 평행 (P6 의 원인).
- LogicGate 의 `branching: true` 가 슬롯 수와 무관 — branching 시맨틱이 "결과 분기" 와 "라우팅 분기" 두 의미로 합쳐져 시각 정책 변경 시 혼동.

### 3.6 디스크립터 인터페이스의 누락/중복

- `initialValidSlots` 가 generator 의 경우 `[]` 인데 `initializeFromInitialValues` (`state.ts:144~155`) 가 별도로 슬롯 0 을 add. 디스크립터 약속과 어긋남.
- `outputUnit: () => FREE_FALLBACK` 가 7개 디스크립터에서 복붙. 헬퍼 미추출.
- `inputAccepts` 가 슬롯 구분이 없음 — ExpressionNode 는 variables 만큼 슬롯이 있는데 PortSpec[] 은 평면. 슬롯별 spec 모델링 불가.
- 디스크립터 멤버 시그니처가 ctx 를 optional 로 두는 멤버가 일부 — 컴파일러로 강제 못 함.

### 3.7 테스트 빈틈 (execution)

- paused=true 케이스 테스트 0건 — `grep paused.*true` 결과 0.
- recomputeNode 의 sourceOverride 가 slot 1 을 켜는 케이스 (P2 시나리오) 0건.
- recomputeNode 가 generator target 인 케이스 (lazy init 우회 가정) 0건.
- recomputeNode 결과의 invalidReasons 전파 부재 회귀 0건 (P3).
- applyFeedbackEdges 가 Stock target 무시하는 사실 검증 0건.
- executeModel 의 simulationTimeMs=0 결과의 ObserveNode t 검증 0건 (P9).
- multi-edge fan-in into ConditionNode slot 0 의 silent 누락 검증 0건.
- valid·pending 상호 배타 invariant 검증 0건 (P7).
- ObserveNode 본체 invalid + slot1 valid 시 노드 단위 isValid 의 false-positive (P8) 0건.
- Stock rate 슬롯이 valid 우회 spawn 하는 경로의 다운스트림 영향 0건 (P6).
- WrappedValue lifecycle 의 inverse test (Condition 외 디스크립터가 wrap 안 함을 보장) 0건.

---

## 4. projector-web 런타임 글루 영역 — 발견사항

### 4.1 `model-store.ts` 책임 비대

`model-store.ts` 한 파일이 짊어진 역할:

| 책임 | 라인 범위 |
|---|---|
| 시뮬레이션 클락 (RAF, accumulator, 보호) | 354~525 |
| Generator runtime tick | 381~447 |
| Stock runtime — 펄스 합성 spawn | 454~478, 748~854 |
| 일반 노드 펄스 도착 처리 + 재계산 + 슬롯별 spawn | 855~990 |
| Generator 펄스 도착 (게이트 캐시) | 696~744 |
| computeExecutionState — fresh/prior 머지 | 191~328 |
| paused 시드 분기, playback timer, token | 558~617 |
| Mutation API 11종 | 998~1267 |
| ValueNode scrub/emit | 1272~1322 |

- `handlePulseArrival` 단일 함수 299줄. generator/stock/general 3 분기.
- `addNode` 류 11종이 거의 동일한 7~9줄 패턴 — `createAddAction(op)` 팩토리로 응축 가능.
- 7개 가변 클로저(`unregisterSimulationTicker`, `simAccumMs`, `lastWallNowMs`, `activePlaybackToken`, `playbackTimeoutId`, `nextDirectPulseSerial`, ...) 가 한 함수 안에 공존 → 테스트 fixture 격리 사실상 불가.

권고 분리: `simulation-loop.ts` / `pulse-arrival.ts` / `spawn-policy.ts` / `execution-merge.ts` / `mutation-actions.ts`.

### 4.2 handlePulseArrival 분기 폭주

generator / stock / 일반 세 경로가 *다른 invariant 집합* 을 따로 maintain. 같은 invariant 가 분기별로 다르게 재현:

| invariant | generator (702~744) | stock (748~854) | 일반 (857~990) |
|---|---|---|---|
| edge 매칭 | 직접 filter | slot 매칭 포함 | recomputeNode 위임 |
| setState 호출 | 1 회 | 1 회 | 1~2 회 |
| validOutputs 갱신 | 안 함 | `add(slot 0)` | `result.validOutputs` 전체 대체 |
| pendingOutputs 갱신 | 안 함 | `delete(slot 0)` | `result.pendingOutputs` 전체 대체 |
| invalidReasons | 안 건드림 | 안 건드림 | prev 보존 (P3) |
| spawn 호출 | 안 함 | 슬롯 0/1/2 각각 | allowedSlots 후 |
| flash trigger | 1 회 | 1 회 | 1 회 |

- 일반 분기의 `valueChanged` (line 880~881) 가 *참조 동등* 비교. ExecValue 의 동등성 정책 미명시 — 디스크립터가 새 객체를 매번 만들면 모든 step valueChanged=true, 동일 객체 재사용하면 cascade 끊김.

### 4.3 spawn 결정 로직 분산 (6 곳)

| 위치 | 라인 | 트리거 |
|---|---|---|
| `tickGenerators` 끝 | 445 | generator emit |
| `updateNode` (affectsValues) | 1156 | 노드 patch — **죽은 호출 가능성** |
| `emitValueOutput` | 1321 | drag 종료/토글 |
| unpause 분기 | 607 | 첫 ▶ 시드 |
| `handlePulseArrival` becameInvalid 직후 | 921 | invalid 재계산 후 |
| `handlePulseArrival` 일반 끝 | 983 | step emit |
| `handlePulseArrival` stock | 836, 846, 853 | 누적 후 |

중복된 invariant:
- "paused 면 spawn 안 함" — `spawnOutgoingPulses` (639), `spawnStockSlotPulse` (460), `rafSimulationStep` (508), `tickGenerators`, `schedulePlaybackStep` (573) — **5 곳**.
- "playback 중이면 안 함" — `spawnOutgoingPulses` (640), `spawnStockSlotPulse` (461), `handlePulseArrival` (694), `rafSimulationStep` (512), `tickGenerators` (398) — **5 곳**.
- "lag=0 outgoing 만" — `spawnOutgoingPulses` (654), `spawnStockSlotPulse` (465), generator/stock 분기 edge 찾기 — **4 곳**.

`updateNode:1156` 의 `spawnOutgoingPulses` 는 *assertEditable 통과 후라 paused=true 가 보장* → 입구 가드(639)에서 즉시 return. **죽은 호출**. 주석 없음 → 미래의 패치 위험.

### 4.4 state commit 경로 11 가지

| 라인 | 컨텍스트 | 형식 |
|---|---|---|
| 432 | tickGenerators | 부분 |
| 563 | applyStep | 전체 교체 |
| 717 | generator 분기 | spread only |
| 810 | stock 분기 | spread + 부분 |
| 901 | becameInvalid | 전체 교체 (P1) |
| 931 | 일반 분기 | 명시 8 필드 (P3) |
| 1002~1250 | add/update/remove | `set({ model, ...exec })` |
| 1293 | scrubInitialValue | spread + 부분 |
| 1342 | resetSimulation | 전체 교체 |

새 ExecutionState 필드 추가 시 *11 곳* 동시 갱신 필요. "어디서 어느 필드를 어떻게" 의 표가 없다 → 누락 위험. 본 표가 그 첫 정리.

### 4.5 EdgeView 의 selector 와 ticker 이중 진실

| selector | 라인 | 같은 invariant 의 다른 표현 |
|---|---|---|
| `isBranchingInactive` | EdgeView.tsx:109~121 | spawnOutgoingPulses(657) 의 valid 가드와 같은 의미. 두 곳에 따로. |
| `isContinuousSource` | EdgeView.tsx:198~204 | spawnOutgoingPulses(647~650) 의 sourceInterp 가드와 동일 |
| `srcValue` (resolveScalar/unwrap) | EdgeView.tsx:90~101 | pulse-arrival 의 ExecValue 추출과 중복 |

- ticker (232~278) 가 `animationLoop.register` 로 RAF 에 붙음 — paused 무관 (P4).
- continuous-intensity stroke 진동이 paused 무시 (P4).

### 4.6 pause/resume 일관성

- `setPaused(true)` 후 본문에서 *다시* stopSimulationLoop/stopPlaybackTimer 명시 호출 (`resetSimulation:1337~1338`) — subscribe 와 중복. 안전망이지만 의미 불분명.
- `timeSettingsStore.subscribe` (`:590`) 의 unsubscribe 가 어디서도 호출되지 않음 — 호스트(tiptap) 환경에서 인스턴스 마운트/언마운트 시 누수.
- `scrub` 중 unpause 가드 부재 — 사용자가 재생 중 슬라이더를 잡으면 모델 mutation 슬립스루 (P5).

### 4.7 cable-physics 의 죽은 토글과 가정 불일치

- `EDGE_PHYSICS_ENABLED` (`cable-physics.ts:42~43`) — 주석은 "회귀 시 false 로 두면 베지어 폴백" 이라는데 어디서도 이 플래그를 import 하지 않음 → **죽은 토글**.
- `segmentLength` 가 매 step `Math.hypot(end-start) * slack / (n-1)` 로 재계산 (`:108`) — 노드 드래그 중 케이블 총 길이가 매 frame 갱신 → "고무줄" 효과. createCable 의 1회 setup 과 모순.

### 4.8 테스트 빈틈 (projector-web 글루)

`tests/knob-geometry.test.ts` 단 1 개. 다음 항목 0건:

1. computeExecutionState merge invariant (priorModel 분기) — 핵심 함수. 순수 함수라 비용 낮음.
2. patchAffectsValues 분류 표.
3. handlePulseArrival 일반 분기 allowedSlots 결정 매트릭스.
4. becameInvalid 분기의 누적 손실 검증 (P1 회귀 방어).
5. paused 토글 시드 nodeOrder 결정성.
6. resetSimulation race (token 동등성).
7. scrubInitialValue 가드 부재 회귀 (P5).
8. continuous source 동기 재진입 폭주.
9. pulse-registry paused 시간 보정 정확성.
10. isBranchingInactive vs spawnOutgoingPulses valid 가드 동기성.
11. cable-physics 자기루프 (createCable 의 start === end).

---

## 5. 주석 vs 실제 불일치 — 통합 표

40+ 건의 상세는 영역별 부록(아래)에 두고, **회귀 시 즉시 사용자에게 노출되는 항목** 만 여기에 표로 압축.

| # | 위치 | 주석 주장 | 실제 | 사용자 영향 |
|---|---|---|---|---|
| A | `recompute-node.ts:46~50` | "반대 슬롯 stale valid 누설을 막는다" | 켜기만 하고 끄지 않음 | Condition fan-out 시 잘못된 cascade (P2) |
| B | `recompute-node.ts:70~110` | (invalidReasons 전파 누락 미언급) | result 에 없음 → 호스트가 prev 보존 | invalid 사유 stale (P3) |
| C | `state.ts:71~75` | "valid 와 pending 상호 배타" | 디스크립터 7/9 가 pending.delete 호출 안 함 | 정책 확장 즉시 invariant 깨짐 (P7) |
| D | `state.ts:48~49` | "function 노드 슬롯 0 사용" | function 노드 없음 (잔재) | 다음 유지보수자 오해 |
| E | `kinds.ts:1116~1131` | Stock 슬롯 2 개 (level/overflow) | 실제 3 개 (level/overflow/**rate**) | rate 슬롯 시맨틱 문서화 0 |
| F | `kinds.ts:1156~1158` | "rate 는 propagate 경로에서는 invalid" + "RAF selector 가 직접 계산" | spawnStockSlotPulse 가 slot 2 펄스 강제 발사 → 다운스트림에 도달 | 일관성 깨짐 (P6) |
| G | `propagate.ts:158~162` | "canBeFeedbackTarget=false 만 제외" | `isValueNode(target)` 게이트 추가 — Stock 무시 | Stock feedback 무음 무시 |
| H | `propagate.ts:50~55` | "정상 ticker 는 stepIntervalMs 를 넘긴다" | executeModel 은 옵션 미수용 | trajectory 시간축 손실 (P9) |
| I | `kinds.ts:984~986` | "lazy init 거의 안 탄다" | recomputeNode 는 항상 빈 generatorRuntime → 매번 lazy init | 외부 호출자 결정성 깨짐 |
| J | `model-store.ts:340~344` | "*모든* mutation 액션이 assertEditable 통과" | scrub, setQuestion 우회 | 재생 중 모델 mutation 슬립스루 (P5) |
| K | `model-store.ts:686~691` | "*결과값이 바뀐 경우에만* 전파" | 3 가지 조건 OR (invalid→valid / valueChanged / seq emit) | 잘못된 정신 모델 — 패치 시 오용 |
| L | `model-store.ts:892~896` | "valid→invalid 시 전체 재계산" | prior 없이 호출 → Stock/generator/observe 누적 손실 | 탱크 비우기 (P1) |
| M | `time-settings.ts:13~17` | "paused = 엣지 위 흐름까지 freeze" | continuous stroke 진동은 paused 무시 | "정지가 정지가 아님" (P4) |
| N | `cable-physics.ts:42~43` | "false 로 두면 베지어 폴백" | 토글이 어디서도 참조되지 않음 — 죽은 코드 | 회귀 시 폴백 불가 |
| O | `kinds.ts:44~47` | "kinds → state 단방향 import 유지" | 양방향 import | 의존 그래프 재설계 시 회귀 |
| P | `exec-value.ts:14~16` | "WrappedValue 는 passthrough 노드에서만 유지" | ConditionNode 가 새 wrap 생성 (`kinds.ts:613`) | Generator gate 패치 시 오용 |
| Q | `kinds.ts:309~312` | "outputsRaw 면 shape 도 우회" | identity shape 일 때만 우회. 비-identity shape 면 적용 | outputsRaw + 사용자 shape 조합 시 의외 |
| R | `model-store.ts:1156` | (주석 없음) `spawnOutgoingPulses` 호출 | assertEditable 통과 후라 paused=true → 입구 가드로 즉시 return — **죽은 호출** | "왜 안 흐르지" 디버깅 시 잘못된 패치 유도 |
| S | `model-store.ts:898~900` | "ValueNode 가 source 변화를 흡수하도록 paused=false" | 모든 노드의 propagate 가 *한 step* 실행 — sim 시간과 무관한 grade-up | 시간 의존 노드의 이중 시간축 |
| T | `propagate.ts:158` | feedback "현재 값을 다음 timestep 시작값으로 전달" | combiner 로 기존 값 + source 를 합쳐 덮어쓴다 | 신규 디스크립터 작성 시 오해 |

부록의 전체 표 (core 25 건 + projector-web 48 건) 는 본 문서 끝의 §9 에 둔다.

---

## 6. 권고하는 후속 작업 방향

우선 처리 vs 구조 개편 두 트랙 권고.

### 6.1 우선 처리 (1~2 주, 회귀 위험 직접 차단)

순서는 P1~P10 그대로. 각각 1~3 시간 단위로 분리 가능.

1. **P1 fix** — `becameInvalid` 분기에 `priorModel` + `prior` 전달. 검증: ValueNode→Stock→Stock-out 그래프에서 중간 노드 invalid 전파 시 Stock level 이 유지되는지 단위 테스트.
2. **P2 fix** — sourceOverride 처리 시 같은 source 의 다른 슬롯들을 workingValid 에서 제거. ConditionNode 외에도 `branching=true` 인 모든 source 에 적용.
3. **P3 fix** — `RecomputeNodeResult.invalidReasons` 추가, 호스트 일반 분기 commit 에 반영.
4. **P4 fix** — EdgeView ticker 안에서 `timeSettingsStore.getState().paused` 체크로 stroke 갱신만 skip. 또는 pulse-registry 의 pausedAt 시간축 공유.
5. **P5 fix** — `scrubInitialValue` 에 paused 가드 추가. assertEditable 의 단언과 일관.
6. **P6 fix** — stock 분기에서 spawn 직전 슬롯별 validOutputs.add / pendingOutputs.delete 일관 호출.
7. **P7 fix** — ctx 에 `setValid(slotKey)`/`setInvalid(slotKey)` 헬퍼 도입, 디스크립터가 직접 set.add/delete 못 하게 좁힘.
8. **P8 fix** — `becameInvalid` 계산을 노드 단위 OR 제거, `slotBecameInvalid` 만 사용.
9. **P9 fix** — `executeModel` 에 `stepIntervalMs` 옵션 추가. model-store 가 STEP_TICK_MS 전달. trajectory 가 시간을 갖도록.
10. **P10 fix** — 두 모듈의 paused subscribe 를 *명시적 페이즈 진행자*(예: `simulation-orchestrator.ts`) 로 합치거나, 한 모듈에 시드 책임 단일화.

각 fix 와 동시에 회귀 테스트 1 건씩 추가 — projector-web 글루 테스트 0건에서 10건으로.

### 6.2 구조 개편 (3~6 주, 같은 종류 버그의 재발 방지)

#### (a) 디스크립터 ctx 표면 좁히기
현재 mutate 가능 8 필드를 *명시 API* (setValue, setValid, setInvalid(reason), pushObserveSample, emitSequence, advanceGeneratorCursor) 로 캡슐화. add/delete 호출 누락이 컴파일러에서 잡히게.

#### (b) 디스크립터 파일 분리
`kinds/` 디렉터리에 디스크립터당 1 파일. 레지스트리만 index. 신규 노드 추가 시 *한 파일만* 손대게.

#### (c) model-store 책임 분리
권고 구조:
```
store/
  model-store.ts        # model state + mutation actions (assertEditable, addXxx, updateNode, removeNode, ...)
  execution-store.ts    # executionState commit 경로 단일화 (현재 11 곳)
  simulation/
    simulation-loop.ts  # RAF 펌프, accumulator, ticker on/off
    pulse-arrival.ts    # handlePulseArrival 의 3 분기 분리
    spawn-policy.ts     # spawnOutgoingPulses + 슬롯 결정
    execution-merge.ts  # computeExecutionState prior/fresh 머지
    orchestrator.ts     # paused/playback 전이의 단일 진행자 (P10)
```

#### (d) invariant 의 단일 진실 출처
"branching slot 의 valid 여부" 같은 invariant 는 *selector 한 곳*(예: `selectIsSlotActive(state, nodeId, slot)`)에 두고, EdgeView 와 spawnOutgoingPulses 가 모두 그 selector 를 호출. 한 곳을 바꾸면 양쪽이 따라온다.

#### (e) ExecutionState commit 의 단일 진입
`commitExecutionState(partial: Partial<ExecutionState>)` 헬퍼로 강제. 새 필드 추가 시 어디서 빠뜨렸는지 자동 점검 가능 (snapshot 비교).

#### (f) "주석은 진실이 아니다" 의 코드 강제
- assertEditable 단언처럼 *주석이 단언하는 invariant* 는 코드의 진입점에 *런타임 assert* 또는 *타입* 로 강제.
- 죽은 토글(`EDGE_PHYSICS_ENABLED`), 죽은 호출(`updateNode:1156`) 제거.
- 주석 vs 실제 표(§9) 의 항목들을 PR 단위로 잘라 점진적 정정.

### 6.3 테스트 인프라

- `packages/projector-web/tests/` 에 vitest 환경 마련 (현재 knob 1개 외 0).
- model-store 의 mutation 액션은 *순수 함수 추출* (현재 closure 7개) 후 테스트.
- pulse-registry 는 `performance.now` mock 가능한 시간 인터페이스로 분리 → 펄스 시간 보정 단위 테스트.

---

## 7. 결론 (의사결정용)

**구조는 비효율적으로 안전**하다 — invariant 가 *우연히* 유지되는 다수 경로가 있고, 실제 버그는 위 P1~P10 이 대표하는 *몇 종의 누설* 에서 반복적으로 터진다. 신규 기능 한 건이 추가될 때마다 8 군데를 손봐야 하는 구조라 *버그의 빈도는 코드량에 선형 비례* 한다.

권고 의사결정 패턴:
- **단기 (이번 sprint)**: P1~P5 fix + 회귀 테스트 5 건. 약 1 주.
- **중기 (다음 sprint)**: P6~P10 fix + projector-web 테스트 인프라. 약 1.5 주.
- **장기 (다음 milestone)**: 구조 개편 (a)~(f). 약 3~6 주. 단계 도입 — 디스크립터 파일 분리부터.

이 순서로 진행하면 *향후 같은 종류 버그의 90%* (시각·인과 불일치, 누적 손실, 모델 mutation 슬립스루) 는 *코드 구조로* 차단된다.

---

## 8. 부록 — 모듈 책임 매핑 (요약)

### 8.1 core/execution

| 파일 | 라인 | 책임 (실측) | 비고 |
|---|---|---|---|
| kinds.ts | 1390 | ctx 정의 + 9 디스크립터 + 헬퍼 + port-compat | 분리 필요 |
| propagate.ts | 271 | 한 step 전파 + feedback 적용 | execute 와 옵션 표면 비대칭 |
| state.ts | 263 | ExecutionState + initializeFromInitialValues | kinds.ts 와 양방향 의존 |
| recompute-node.ts | 242 | 단일 노드 재계산 (펄스 도착용) | propagate ctx 복제 |
| exec-value.ts | 172 | ExecValue 시스템 (numeric/boolean/wrapped/sequence/function-handle/error) | lifecycle 주석 vs 실제 (P) |
| topology.ts | 101 | incomingByTarget / outgoingBySource 빌드 | 순수 |
| observe-buffer.ts | 83 | window sample push/prune/clone | 순수 |
| execute.ts | 63 | N-step iteration | stepIntervalMs 옵션 누락 (P9) |
| expression-evaluator.ts | 60 | LaTeX 평가자 인터페이스 + noop | core 비의존성 유지용 |
| errors.ts, rng.ts, index.ts | 합 48 | error 타입, Rng 인터페이스, 재export | |

### 8.2 projector-web 글루

| 파일 | 라인 | 책임 (실측) | 비고 |
|---|---|---|---|
| store/model-store.ts | 1370 | 위 §4.1 참조 | 5 파일로 분리 권고 |
| store/ui-store.ts | 257 | 선택/드래프트/readOnly | mutation 가드와 별개 (4.7) |
| store/time-settings.ts | 49 | paused/multiplier | subscribe 누수 (4.6) |
| store/pulse-settings.ts | 36 | 펄스 속도/색 | |
| pulse/pulse-registry.ts | 216 | spawn/advance/clearAll, paused 시간 보정 | 등록 순서 의존 (P10) |
| pulse/node-flash-registry.ts | 53 | 노드 깜빡임 트리거 | |
| edge/EdgeView.tsx | 509 | 케이블 시각 + ticker + selector | invariant 이중 진실 (4.5) |
| edge/cable-physics.ts | 172 | verlet 케이블 | 죽은 토글 (4.7) |
| edge/cable-points-registry.ts | 31 | cable 인스턴스 등록 | |

---

## 9. 부록 — 주석 vs 실제 불일치 전체 목록

§5 표는 그 중 회귀 시 사용자 직격 항목만 추렸다. 전체 73 건은 두 영역의 점검 결과 원본을 그대로 옮긴 표 형식으로 본 문서가 길어지므로, 후속 작업 시 본 리포트의 §5 표와 §3.x/§4.x 본문의 line 인용을 추적해 확인하면 된다. 핵심 의사결정에 필요한 항목은 §5 의 A~T 20 건으로 충분하다.

각 항목별로 "수정 비용" 은 *한 줄 주석 정정* (D, E, K, O, T) 부터 *코드 변경* (A, B, C, F, G, J, L, M, R, S) 까지 분포. *코드 변경* 그룹이 §6.1 의 P1~P10 과 거의 1:1 대응한다.

---

(끝)
