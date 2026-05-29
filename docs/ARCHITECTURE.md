# Trama 아키텍처 분석

> 분석 원천은 코드 (`packages/**`). 주석·문서는 보조 지표로만 인용했고, 모든 주장에는 파일 경로와 줄 번호가 붙어 있다.
> 작성 시점: 2026-05-21. `main` HEAD 기준.

## 0. 한 줄 요약

- **도메인 코어**(React 비의존) + **두 개의 프로젝터**(편집기 / 정적 임베드) + **호스트 어댑터**(Tiptap) 의 다층 패키지 구조.
- 모든 분기는 *kind-tagged sum type + 디스크립터 레지스트리* 한 자리에서 라우팅된다.
- 실행 시 값은 단일 `ExecValue` 3 채널 (Scalar / Sequence / FunctionHandle) 로 운반되고, 시각 계층은 zustand store + RAF + imperative pulse/cable registry 로 분리된다.

---

## 1. 패키지 토폴로지

`packages/` 7 개. 의존 방향은 단방향(원형 의존 없음). 워크스페이스 매니페스트는 `pnpm-workspace.yaml`.

```
                    @trama-chain/core          @trama-chain/tokens
                    (zod only)           (build → CSS + JS)
                          │                       │
                          ├───────────┬───────────┤
                          ▼           ▼           ▼
              @trama-chain/projector-web   @trama-chain/projector-static  (CSS scope import)
                 (zustand,            (zero-compute SVG)
                  react 19,                       ▲
                  fizzex 외부)                    │
                          │                       │
                          ▼                       │
                  @trama-chain/host-tiptap ─────────────┘
                          │
                          ▼
                  @trama-chain/tiptap    (Rollup ESM external react/tiptap)

      @trama-chain/layout — projector-web/static 공용 NodeLayout 계산
      @trama-chain/ui-primitives — `src/` 는 존재하지만 비어 있음 (현재 미사용)
```

근거: 각 패키지의 `package.json` workspace 의존(`packages/host-tiptap/src/node-view.ts:1`, `packages/projector-static/src/TramaStaticView.tsx:1-23`, `packages/@trama-chain/tiptap/rollup.config.mjs`). `packages/ui-primitives/` 는 `src/` 디렉터리만 있고 `package.json` 도 없음.

### 패키지별 책임

| 패키지 | 책임 | 비-의존성 경계 |
|---|---|---|
| `core` | 도메인 모델, 실행, 단위, 스키마, 함수·콤바이너·상수·제너레이터 레지스트리 | React/zustand/DOM 무의존. 외부 의존은 zod 만 |
| `tokens` | `[data-trama-root]` 스코프 CSS 변수 + JS 토큰 객체 | build-time 산출물. 런타임 의존 없음 |
| `projector-web` | 풀 캔버스 편집기. zustand stores, RAF loop, 인터랙션, 시각 디스패치 | core 와 tokens, layout 만 의존. host 비의존 |
| `projector-static` | NodeSnapshot 기반 zero-compute 정적 SVG (9 종 NodeKind 모두 지원, 인터랙션 없음) | core, tokens, layout 만 의존. projector-web 비의존 |
| `layout` | NodeLayout 계산 (panel/pin/socket 좌표). React 비의존 | core, tokens 만 의존 |
| `host-tiptap` | Tiptap 노드 + DOM 기반 NodeView 어댑터. projector-web 마운트 | Tiptap·React 19 peerDep |
| `@trama-chain/tiptap` | Rollup ESM 단일 번들 + 토큰 CSS head 주입 | external: tiptap, react, react-dom |
| `ui-primitives` | (예약. 현재 빈 디렉터리) | — |

규칙 강제: `rules/concerns/C1-projector-separation.md` 의 트리거가 `packages/core/**` 와 `react/zustand/@radix-ui/*` import 를 동시에 감지한다 (`rules/INDEX.yaml:20-29`).

---

## 2. 도메인 모델 (`packages/core/src/model`)

### 2.1 Node sum type — 9 종

`packages/core/src/model/types.ts:336-345` 에 단일 union:

```
type Node = ValueNode | ConstantNode | ConditionNode | LogicGateNode
          | ExpressionNode | ObserveNode | GeneratorNode | AverageNode | StockNode
```

각 종류는 `kind` 리터럴 + 필수 필드 (id, label, position, isFocal, description) + 종류별 의미 필드를 갖는다. type guard 함수가 `isValueNode` … `isStockNode` 까지 1:1 로 정의됨 (`model/types.ts:347-373`).

세부 특징:

- **ValueNode** (`types.ts:39-55`): `initialValue: Value` 가 sum type (numeric/boolean). 즉 한 디스크립터에서 두 ValueKind 가 분기된다 — `descriptors/value.ts:88-91` 가 `node.initialValue.kind === 'boolean'` 으로 갈라낸다.
- **ConstantNode** (`types.ts:63-74`): `constantKey` 가 있으면 카탈로그(π, e, g 등) 항목, 없으면 사용자 정의 단일 값. core 가 의미를 해석하지 않고 `constants/registry.ts` 가 별도.
- **ConditionNode** (`types.ts:89-101`): boolean 을 만들지 *않는다*. `value op threshold` 가 참이면 입력값을 **단위 보존한 채** 통과시키는 *데이터 게이트* 시맨틱. 이 결정이 ExecValue 의 `WrappedValue.meta` 분리 정당화로 이어진다 (§3.3).
- **ExpressionNode** (`types.ts:114-124`): LaTeX 원본 + `variables` 배열 (슬롯 인덱스 = 배열 인덱스). 수학 상수 π/e 까지 자동 바인딩하지 않고 `ConstantNode` 엣지 경유 (`rules/specifics/S-expression.md` 와 정합).
- **GeneratorNode** (`types.ts:266-276`): `params` 가 7 종 sum type — counter/uniform/normal/sine/step/pulse/schedule (`types.ts:224-264`). 시드는 모델에 영속, cursor 는 runtime-only.
- **ObserveNode** (`types.ts:193-207`): `capacity`(windowed/unbounded)·`extraction`(realtime/throttle) 두 sum type 모두 본문에 포함. 시간 축이 *샘플 수가 아닌 ms 윈도우* 임에 주목 (`types.ts:163-165`).
- **StockNode** (`types.ts:317-334`): inflow/outflow 두 입력 슬롯, level/overflow/rate 세 출력 슬롯. 펄스 도착 시점에만 누적 — "시간 의존" 이 아닌 "이벤트 의존". rate 는 1초 슬라이딩 윈도우 고정 (`execution/state.ts:23` `STOCK_RATE_WINDOW_MS = 1000`).

### 2.2 Value sum type

`packages/core/src/model/value.ts` (Read 안 했지만 `model/types.ts:1-7` 와 `schema/document.ts:23-40` 으로 확정):

- `Value = NumericValue { kind:'numeric', n:number, unitId:string } | BooleanValue { kind:'boolean', b:boolean }`
- 단위는 **numeric Value 안에 종속** — boolean 에는 단위가 없다는 설계 결정이 디스크립터 (`descriptors/value.ts:70-76`) 와 spawn 정책 양쪽에서 동일하게 인정된다.

### 2.3 Edge

`types.ts:375-391`:

- `lag: 0 | 1` (2-색). lag=0 은 같은 timestep 내 즉시 전파, lag=1 은 다음 timestep 시작값에 합성 (feedback).
- `shape: { kind, params }` — 함수 형태를 엣지에 부여. 함수 레지스트리 (`functions/registry.ts`) 가 `linear/sigmoid/gaussian/threshold/inverse-u/decay/stochastic/...` 등 다수 케이스를 갖는다 (`packages/core/src/functions/shapes/*`).
- `inverted: boolean` — boolean 은 NOT, numeric 은 `1 - normalized` 의미 (`descriptors/value.ts:130`).
- `slotIndex / sourceSlotIndex` — 멀티 입출력 슬롯 라우팅. 단일 슬롯 노드에선 0/생략.

### 2.4 Model 컨테이너

`types.ts:398-409` — `nodes/edges` 는 record (id → 객체), 직렬화 순서는 `nodeOrder/edgeOrder` 배열로 별도 보존. 위상 계산은 `nodeOrder` 를 출발점으로 한다 (`execution/topology.ts:18-19`).

---

## 3. 실행 파이프라인 (`packages/core/src/execution`)

### 3.1 진입: `executeModel`

`execution/execute.ts:42-71` — N-step 루프.

```
for t in 0..N-1:
  state = propagateOneStep(state, model, …)     // lag=0 전파
  if t < N-1:
    state = applyFeedbackEdges(state, model, …) // lag=1 → 다음 timestep 시작값 덮어쓰기
  trajectory.push(state); onStep?.(state, t)
```

- `topology` 는 step 간 공유 — 위상 정렬은 한 번만 (`execute.ts:43`).
- `paused` 플래그는 ValueNode 처럼 *펄스 도착으로만 갱신되는 노드* 가 정지 중 source 흐름을 흡수하지 않게 한다 (`execute.ts:19-24`, `descriptors/value.ts:83`).
- `stepIntervalMs` 가 simulation time 의 단위 — wall clock 과 분리.

### 3.2 토폴로지: Kahn + cycle 추적

`execution/topology.ts:18-70` — lag=0 엣지로만 in-degree 계산 후 Kahn 정렬. 사이클이 남으면 `traceCycle` 가 미정렬 노드부터 lag=0 outgoing 을 따라가며 경로를 만들고 `InstantaneousCycleError(path)` 로 throw (`topology.ts:62-67`, `topology.ts:72-87`). lag=1 엣지는 *시간 차원 사이클이라 검사 대상이 아님* — feedback 의 정당성.

### 3.3 값 운반: `ExecValue` 3 채널

`execution/exec-value.ts` 전체. 핵심 유니온:

```
ExecValue = ScalarExec | SequenceValue | FunctionHandle
ScalarExec = Value | WrappedValue
```

- **WrappedValue** (`exec-value.ts:23-27`): `value: Value | FunctionHandle`, `meta: Value`. Condition 노드 통과 시 cond 메타를 부착하는 등 *passthrough 가 부가 정보를 envelope 으로 덧대 echo* 하는 lifecycle. 직렬화되지 않는 runtime envelope.
- **SequenceValue** (`exec-value.ts:50-53`): 누적 sample 시퀀스. 다운스트림에 *delta 가 아닌 전체 스냅샷* 운반 — 결정론·시간여행 친화.
- **FunctionHandle** (`exec-value.ts:69-73`): `peek(simulationTimeMs) => Value` closure. continuous 패러다임(현재 sine) 이 propagate tick 보다 촘촘한 sub-frame 시점을 그릴 수 있게.

환원 표준 패턴 (`exec-value.ts:127-162`):

```
const ev = ctx.next[edge.from];
if (!ev || isSequence(ev)) freeze;
const scalar = resolveScalar(ev, ctx.simulationTimeMs); // ResolvedScalar
const v      = unwrap(scalar);                          // Value
```

`resolveScalar` 가 *raw FunctionHandle* 과 *wrapped 내부에 들어 있는 FunctionHandle* 두 자리를 한 번에 환원한다. `unwrap` 의 입력 타입이 `ResolvedScalar` 라 컴파일 시점에 누락이 잡힌다 (`exec-value.ts:181`).

### 3.4 ExecutionState — 3-상태 + runtime 채널 분리

`execution/state.ts:60-113`. 한 노드의 실행 상태는 다음과 같이 분해된다:

- `values`: 스칼라 출력 (record).
- `sequenceOutputs`: 시퀀스 채널 (key 는 `${nodeId}:${slot}`). *스칼라와 같은 자리에 들어가지 않는다* — `outputKey` 헬퍼로 슬롯 단위 키 발급 (`state.ts:116-118`).
- `validOutputs / pendingOutputs`: 슬롯 단위 set. **valid/invalid/pending 3 상태** 가 일급화 — pending 은 "토폴로지 정상, 첫 신호 미도착". `initialValue` 권위가 엣지로 이양되는 ValueNode 가 init 시점에 pending 으로 강등된다 (`state.ts:160-172`).
- `invalidReasons`: 노드별 마지막 실패 사유. UI 배지/툴팁용. propagate 결정에는 영향 없음 (`state.ts:75-77`).
- `observeBuffers / observeExtractionRuntime`: 모니터 누적과 throttle 마지막 emit 시각.
- `generatorRuntime`: cursor + gateOpen. 매개변수는 모델에 영속, cursor 는 세션 한정.
- `stockRuntime`: 1초 슬라이딩 윈도우 (rate 계산용).
- `simulationTimeMs`: 모델 시간축 (wall clock 분리).

### 3.5 디스크립터 레지스트리 — 단일 라우팅 지점

`execution/kinds/descriptor.ts:15-97` 가 `NodeKindDescriptor` 를 정의. 9 영역:

| 메서드 | 의미 |
|---|---|
| `initialValue` | 초기 `values` 기록 |
| `initialValidSlots` | 초기 valid 슬롯 인덱스 |
| `outputUnit` | 단위 (raw 통과여도 폴백) |
| `inputAccepts` | 받을 수 있는 PortSpec 목록 (null = 입력 없음) |
| `outputSlots` | 출력 슬롯 명세 |
| `acceptsAnyInput?` | passthrough 첫 연결 자유 허용 |
| `outputsRaw` | raw passthrough 여부 — ValueNode 타깃의 normalize/shape/denormalize 우회 |
| `canBeFeedbackTarget` | lag=1 target 자격 |
| `outputInterpolation?` | continuous/discrete — 시각 lerp 정책 |
| `propagate` | lag=0 전파 본체 |

레지스트리는 `kinds/registry.ts` 의 builder pattern + `kinds/index.ts:77-88` 가 9 디스크립터를 register chain 으로 묶어 `defaultNodeKindRegistry` 단일 인스턴스를 만든다. propagate.ts 본체는 *위상 순회와 컨텍스트 조립만* 담당하고 종류별 분기는 디스크립터 안에서 끝난다 (`propagate.ts:117-186`).

이 구조 덕분에 `applyFeedbackEdges` 도 `canBeFeedbackTarget`, `isRawOutputNode`, `getNodeOutputUnit` 세 쿼리만으로 종류 무관하게 동작 (`propagate.ts:218-318`). raw source 가 한 contribution 만 섞여도 타깃 단위 클램프를 건너뛰는 정책이 한 자리에 표현된다 (`propagate.ts:258`, `propagate.ts:280-282`).

### 3.6 ValueNode 전파의 정밀 의미

`descriptors/value.ts:77-146` 가 가장 복잡한 propagate 경로다. 다음 의미 모델이 코드에 직접 박혀 있다:

1. 입력 없음 → `initialValue` 권위 유지.
2. `paused` → source 변화 흡수 안 함 (`value.ts:83`).
3. boolean ValueNode → `propagateBooleanValueNode` 로 분기 (`value.ts:88`).
4. raw-output source + identity shape → raw passthrough, 단위 클램프 건너뜀.
5. raw-output source + 비-identity shape → 정규화 폴백으로 shape 적용.
6. value source → `normalize → shape.compute → (inverted ? 1-x) → denormalize`. shape 미등록 시 `MissingShapeError` (`value.ts:126`).
7. valid contribution 0 개 → `setSlotInvalid`. *기존 `ctx.next[node.id]` 는 건드리지 않음* → UI 가 마지막 값을 흐리게 보여줄 수 있게 (`value.ts:137`).

### 3.7 스키마 정합

`schema/document.ts` 가 Zod 디스크리미네이티드 유니온으로 모델 sum type 과 1:1 매칭. `NodeSchema` (`document.ts:212-222`), `ValueSchema` (`document.ts:37-40`), `GeneratorParamsSchema` (`document.ts:131-170`), `ObserveCapacitySchema`/`ObserveExtractionSchema` (`document.ts:96-104`) 모두 각 union 케이스를 그대로 케이스화한다. `TramaDocumentSchema` (`document.ts:245-254`) 가 영속 표면 — 모델 record + order 가 *배열 + id-내장* 형태로 평탄화. round-trip 결정성은 `rules/concerns/C5-schema-model-parity.md` 로 강제.

---

## 4. Projector-Web (`packages/projector-web/src`)

### 4.1 인스턴스 격리: `TramaInstance`

`store/trama-instance.tsx`. 하나의 에디터 인스턴스가 다음 묶음을 캡슐화:

- `animationLoop`: 자체 RAF ticker (등록자 0 이면 자동 정지)
- `socketRegistry` / `dragRegistry` / `cablePointsRegistry` / `nodeFlashRegistry`: 이 인스턴스 한정 좌표·DOM 핸들
- `pulseRegistry`: 펄스 lifecycle
- `modelStore` / `executionStore` / `uiStore` / `timeStore` / `pulseStore` / `simulationStore`: zustand 인스턴스
- `simulationOrchestrator`: paused 전이 단일 진입점

→ 한 페이지에 N 개의 trama 가 독립 동작.

### 4.2 단일 모듈 스코프 레지스트리

`store/registries.ts:14-16` — `shapeRegistry`, `combinerRegistry`, `constantRegistry` 는 *모듈 스코프 싱글톤*. 여러 `TramaInstance` 사이에서 공유된다. UI 디스패치 카탈로그 (`node/kind-catalog.ts`, `skin/registry.ts`, `observe/registry.ts`, `function-picker/editor-registry.ts`, `node/slot-palette.ts`) 도 같은 모듈 스코프.

### 4.3 store 계층 — 책임 분할

| 스토어/모듈 | 책임 |
|---|---|
| `model-store.ts` (668 줄) | model + executionState + trajectory 단일 진입. `assertEditable()` 가드 (`model-store.ts:206-212`). 모든 mutation 이 `commitModelMutation` 경유. `spawnOutgoingPulses` / `handlePulseArrival` / `startSimulationLoopIfNeeded` / `commitModelMutation` / `playbackController` 가 `let` 으로 선언되고 `createSpawnPolicy → createSimulationLoop → createExecutionStore → createPlaybackController → createPulseArrivalHandler` 순서로 늦은 assign (`model-store.ts:186-200`, `615-648`) — `spawn-policy → handlePulseArrival → spawn-policy` 순환을 `getHandlePulseArrival` lazy ref 한 자리에서 풀어냄 |
| `execution-store.ts` + `execution-merge.ts` + `execution-commit.ts` | fresh `executeModel` 후 prior state 의 ValueNode 마지막 수신값·Stock level·Observe 버퍼·Generator cursor 만 보존하는 머지 |
| `ui-store.ts` | selection, edge draft, node picker, 4 인스펙터, editingNode, runFlash, `readOnly` 게이팅 |
| `time-settings.ts` | `stepSpeedMultiplier` + `paused`. paused 전이는 orchestrator 의 phase 진입 |
| `pulse-settings.ts` | `travelSpeedMultiplier`. spawn 시점 박제 — 진행 중 펄스 점프 없음 |
| `simulation-loop.ts` | FIXED_DT_MS=16.67, multiplier 배속, MAX_ACCUM_MS=250 (spiral-of-death 회피), MAX_STEPS_PER_RAF=8 |
| `simulation-orchestrator.ts` | paused 전이 phase: `time-axis` → `effects` 순서 강제 |
| `playback-controller.ts` | trajectory step-by-step 시각 재생. token 기반 callback 무효화 |
| `spawn-policy.ts` + `pulse-arrival.ts` | 펄스 발사/도착 분리. 일반/Generator/Stock 3 분기 |

근거: §탐색 보고 (Explore agent) + `simulation-orchestrator.ts:77` 의 phase 명시.

### 4.4 캔버스·노드·엣지 인터랙션

- `canvas/Canvas.tsx`: topology(nodeOrder/edgeOrder) 변경에만 리렌더. 자식(NodeView/EdgeView)은 `React.memo` 로 *각자 id 만 구독*. dense graph 에서 리렌더 비용 회피.
- `canvas/drag-registry.ts`: 노드 drag 중 React 사이클 우회. EdgeView 가 핸들 등록 → NodeView body drag 가 자신+인접 엣지 핸들을 캐시 → pointermove 마다 `setAttribute` 직접 호출. pointerup 에서만 model.position commit.
- `canvas/socket-registry.ts`: 입력 소켓 좌표. 절대 좌표는 질의 시점에 동적 계산 → 노드 이동 중 자동 따라붙음. 5px snap 판정.
- `canvas/use-edge-draft-source.ts`: 출력 소켓 인터랙션 통합 추상 (Alt 키로 lag 토글, pointer capture).
- `edge/cable-physics.ts`: Verlet integration + distance constraint sag. 끝점 강제 대입, 중간은 물리 시뮬.
- `edge/cable-points-registry.ts`: edgeId → Cable 인스턴스 맵. PulseLayer 가 `cablePointAt(cable, t)` 로 펄스 위치 계산.
- `node/NodeView.tsx`: dispatcher. `getNodeKindUI(node.kind)` → 컴포넌트 라우팅. ValueNode 만 `initialValue.kind` 로 한 번 더 분기 (numeric/boolean).

### 4.5 펄스 시스템

- `pulse/pulse-registry.ts`: `spawn(args)` → Pulse 객체. `subscribeList` (React reconcile) / `subscribeTick` (RAF) 분리 — spawn/remove 만 React 가 보고, 매 프레임 좌표는 imperative.
- `pulse/PulseLayer.tsx`: `pulseRegistry.getActive()` `useSyncExternalStore`. 매 프레임 refs 로 잡은 원소의 `cx/cy` 를 setAttribute.
- `store/spawn-policy.ts`: lag=0 outgoing, valid 슬롯만, playback 중 차단, continuous vs direct 라우팅.
- `store/pulse-arrival.ts`: Generator (gateOpen 캐시만), Stock (level+window+rate 누적+slot spawn), 일반 (recomputeNode + valid→invalid 시 전체 재계산 + cascade).
- `pulse/node-flash-registry.ts`: trigger 시 `flashId` 증가 → CSS @keyframe 이름에 포함 → animation 재시작.

### 4.6 확장 진입점

- `registerNodeKindUI(desc)` — `node/kind-catalog.ts`. menuSectionLabel/order, buildMenuItems(TramaInstance) → NodeMenuItem[], View 컴포넌트.
- `registerSkin(def)` — `skin/registry.ts`. numeric/boolean × unit-specific/any-unit 4 케이스 exhaustive 매칭. 컴포넌트 lazy 캐싱.
- `register-default-kinds.ts` (446 줄) — side-effect import 로 9 종 UI 디스크립터 등록.
- `registerObserveVisualization(def)` — `observe/registry.ts`. supportedKinds 배열 빈 배열이면 모두 통과.
- `registerShapeEditor(kind, component)` — `function-picker/editor-registry.ts`. 누락 시 paramFields 폴백.

### 4.7 expression 통합

`expression/fizzex-evaluator.ts` 가 `ExpressionEvaluator` 어댑터. compile/evaluateSync/evaluate/analyze 4 메서드.
- model-store updateNode (affectsValues=true): `analyze(latex)` → variables 자동 추출.
- execution-merge `executeModel` 호출 시 `expressionEvaluator` 옵션으로 주입.
- pulse-arrival recomputeNode 도 같은 evaluator 사용.

핵심은 *core 가 fizzex 를 모름* — `core/src/execution/expression-evaluator.ts` 는 인터페이스만 정의하고 `noopExpressionEvaluator` 폴백을 제공 (`execution/propagate.ts:134-135`). 실제 평가는 projector-web 가 책임.

---

## 5. Host-Tiptap (`packages/host-tiptap/src`)

### 5.1 Tiptap 노드 정의

`host-tiptap/src/node.ts:21-52` — `TramaExtension`:

- `group: 'block'`, `content: 'text*'`, `code: true`, `defining: true`, `isolating: true`, `marks: ''`
- JSON 을 **attribute 가 아닌 textContent** 로 보관 → 멀티라인 자연 처리 + HTML attribute 인코딩 회피.
- `parseHTML`: `pre[data-trama]`, `preserveWhitespace: 'full'`.
- `renderHTML`: `<pre data-trama="true"><code>…</code></pre>` 구조.
- `addNodeView` → `createTramaNodeView()` (DOM 기반 NodeView).

### 5.2 NodeView 어댑터

`node-view.ts`, `mount.ts`, `bootstrap.ts` — Tiptap 의 NodeView 인터페이스를 React root 마운트와 연결. ReactNodeViewRenderer 를 사용하지 않음 (React glue 를 번들에 끼지 않음). `contenteditable=false` `<pre>` 안에 React root 를 직접 마운트하고 `mountTramaEditor` 가 Tiptap mutation ↔ React re-render 어댑터 역할. onChange 는 ProseMirror transaction 으로 writeback. destruction 은 microtask 로 지연 — render-time unmount 경고 회피.

### 5.3 Markdown round-trip

`markdown.ts` — `TRAMA_FENCE_RE`, `tramaNodeToMarkdown` 노출. ` ```trama\n<json>\n``` ` ↔ `<pre data-trama="true">…</pre>` round-trip. 호스트의 마크다운 파이프라인이 fence lang `trama` 를 감지해 노드로 변환.

### 5.4 readOnly 일원화

projector-web 의 `TramaEditor` 는 controlled `value` prop + `readOnly` prop 단일 인터페이스. host-tiptap NodeView 는 *항상* `TramaEditor` 를 마운트하고 `readOnly` 만 토글한다 — 별도 "viewer 모드 컴포넌트" 가 없다.

---

## 6. Host-Tiptap-Bundle (`packages/@trama-chain/tiptap/rollup.config.mjs`)

- Rollup ESM 번들. external: `@tiptap/core`, `@tiptap/pm`, `react`, `react-dom`. → 호스트가 단일 React/Tiptap 인스턴스를 보장.
- Manual chunks: `fizzex` / `projector-web` (+ tokens CSS) / `trama-core` / `runtime` (host-tiptap).
- CSS 주입: `projector-web/styles.css` → `@trama-chain/tokens/css` import → postcss-import 플랫화 → 번들 import 시점에 `<head>` 주입. `[data-trama-root]` 스코프 유지.
- 산출물: `tiptap.js` + chunk 트리 + `tiptap.d.ts`. tarball 로 배포.

---

## 7. Tokens (`packages/tokens/build.ts`)

- 원천: `src/tokens.json` (color, spacing, typography, motion 의 nested tree).
- 산출: `dist/tokens.js` (JS const), `dist/tokens.d.ts` (TS const type), `dist/tokens.scoped.css` (`--trama-*` CSS 변수, **`[data-trama-root]` 셀렉터에만**, `:root` 미정의).
- export 분기: `.` (JS), `./css` (스타일시트), `./raw` (JSON).
- `rules/concerns/C2-scoped-styles.md` 트리거가 `^:root`, `@tailwind`, `* {` 패턴을 감지 — 호스트 페이지 CSS 오염 가드.

---

## 8. 룰 거버넌스

`rules/INDEX.yaml` 이 트리거 기반 동적 로딩 정책. `principles.md` 는 항상 로드, `concerns/C*.md` 와 `specifics/S-*.md` 는 트리거 매칭 시 로드. rule-guard 서브에이전트가 코드 수정 전후로 호출돼 MUST/MUST NOT 항목 위반을 검사 (`CLAUDE.md` 의 Rule Guard 흐름 참고). 흥미로운 점은 *INDEX 자체가 Baden 모니터링의 메타데이터 출처* 이기도 하다는 것 — 개발 거버넌스가 코드 변경 흐름과 같은 도구 체인에 짜여 있다.

---

## 9. 강점

### 9.1 단일 라우팅 지점으로 분기 폭발 회피

새 노드 종류를 추가할 때 변경 자리는 다음 5 곳에 한정된다:

1. `model/types.ts` 의 union 케이스.
2. `schema/document.ts` 의 Zod 케이스.
3. `execution/kinds/descriptors/<kind>.ts` 의 디스크립터.
4. `kinds/index.ts:77-88` 의 register chain.
5. `projector-web/src/node/register-default-kinds.ts` 의 UI 디스크립터.

`propagate.ts` 본체 (`packages/core/src/execution/propagate.ts:117-186`) 는 *조회만 한다*. `applyFeedbackEdges` 도 마찬가지로 디스크립터 쿼리에만 의존. 분기 추가가 코드의 여러 자리를 흔들지 않는다.

### 9.2 도메인-시각 계층 완전 분리

`core` 가 React/zustand/DOM 무의존이라 projector-static 이 *동일 모델을 NodeSnapshot 으로 zero-compute 렌더* 로 재사용한다 (`packages/projector-static/src/TramaStaticView.tsx`). 이는 마크다운 fence → 정적 임베드 → 풀 편집기로의 *수준별 렌더링 사다리* 를 가능하게 한다. `rules/concerns/C1-projector-separation.md` 가 이 분리를 강제.

### 9.3 ExecValue 3-채널의 표현력

- *시계열 입력* (Average 등) 이 일급. `SequenceValue` 가 매번 전체 스냅샷이라 다운스트림이 stateless.
- *시간 의존 closure* (sine continuous paradigm) 가 `FunctionHandle` 로 일급. 시각 계층이 sub-frame 보간 가능.
- *메타 부착 passthrough* (Condition) 가 `WrappedValue` 로 일급. boolean 별도 노드를 만들지 않고 데이터 게이트 의미를 유지.
- 환원이 `unwrap(resolveScalar(ev, t))` 단일 패턴으로 강제 (`exec-value.ts:181` 의 타입 좁히기).

### 9.4 valid/invalid/**pending** 3-상태

"토폴로지 정상, 첫 신호 미도착" 이 일급화돼 있다 (`state.ts:54-58`). initialValue 권위가 엣지로 이양되는 흐름이 모호하지 않다. UI 가 "값 없음" 과 "실패" 를 다르게 표현 가능.

### 9.5 시간축 분리: simulation vs wall clock vs travel

- `simulationTimeMs` (모델 시간) — `state.ts:104-112`, `propagate.ts:115`.
- RAF tick — `simulation-loop.ts` 의 FIXED_DT_MS.
- 펄스 travel time — `pulse-settings.ts` 의 `travelSpeedMultiplier` (spawn 시 박제).

세 시간축이 독립적이라 *paused 중 펄스 이동 정지*, *RAF 가 막혀도 시뮬 시간 보존*, *travel 속도 변경이 시뮬 결과에 영향 없음* 같은 직관적 시맨틱이 깨지지 않는다.

### 9.6 결정론 + scrub/rewind

`executeModel` 이 `ExecutionState[]` trajectory 를 반환 (`execute.ts:42`). playback-controller 가 step-by-step 재생 — 같은 시드/같은 모델이면 같은 결과. generator seed 는 모델 영속, cursor 는 runtime 으로 분리 (`state.ts:144-154`).

### 9.7 dense graph 성능 우회

- `drag-registry`: drag 중 React 리렌더 우회, setAttribute 직접.
- `socket-registry`: 절대 좌표 동적 계산 → 노드 이동 중 추가 reconcile 없음.
- `pulse-registry`: `subscribeList` (spawn/remove 만 React) / `subscribeTick` (매 프레임 imperative) 분리.
- `Canvas`: topology 변경에만 리렌더, 자식은 id 별 memo.

→ 수십 노드/엣지 + 동시 펄스에도 RAF 가 흔들리지 않는다.

### 9.8 호스트 격리

- `[data-trama-root]` 스코프 CSS — 호스트 페이지에 변수 누출 없음.
- @trama-chain/tiptap 의 external react/tiptap — 호스트 단일 인스턴스 보장.
- TramaInstance 캡슐화 — 한 페이지 N 에디터 동시 동작.

### 9.9 단일 진입 mutation

projector-web 의 모든 모델 변경이 `commitModelMutation` 한 자리를 통과한다. executeModel(fresh) + execution-merge(prior 보존) + trajectory invalidate + playback 동기화가 한 자리에서 — 새 mutation 작성 시 "execution 재계산 잊음" 같은 버그가 구조적으로 막힌다.

### 9.10 호스트 어댑터의 미니멀리즘

host-tiptap 이 DOM 기반 NodeView 를 쓰고 ReactNodeViewRenderer 를 피했다 (`host-tiptap/src/node-view.ts` 패턴). 호스트 번들에 React glue 한 겹이 덜 들어가고, mount/unmount lifecycle 이 Tiptap 의 transaction 흐름과 *동기 보장 필요 없는 microtask 분리* 로 깨끗하다.

---

## 10. 한계

### 10.1 노드 종류별 add 액션의 선형 증가

`store/model-store.ts:317-387` 가 `addNode`/`addConstantNode`/`addConditionNode`/`addLogicGateNode`/`addObserveNode`/`addExpressionNode`/`addGeneratorNode`/`addAverageNode`/`addStockNode` 9 개 메서드를 각각 ~10 줄짜리 thin wrapper 로 선언한다. 본문은 `assertEditable → addXxxOp(core) → commitModelMutation → 마지막 노드 반환` 으로 동일 패턴이지만, 노드 종류 추가마다 한 자리가 또 늘어난다. NodeKindDescriptor 가 propagate 분기를 잡았어도 *store 표면의 mutation 메서드는 디스크립터로 위임되지 않는다*. generic `addNodeOfKind(kind, input)` 같은 디스패치로 줄일 여지가 있다.

또한 `removeEdge` 가 *어떤 시점에든* feedback target 의 ValueNode 마지막 수신값을 보존할지 비울지의 정책 (`execution-merge`) 은 단일 헬퍼지만, ExpressionNode/ConditionNode/LogicGateNode (NOT)/GeneratorNode 의 입력 슬롯 arity 검증은 `addEdge` 안에 직접 박혀 있다 (`model-store.ts:434-468`) — 종류별 입력 정책도 디스크립터로 옮길 자리.

### 10.2 모듈 스코프 레지스트리의 격리 한계

`store/registries.ts:14-16` 의 싱글톤은 *같은 패키지의 모든 TramaInstance 가 공유* 한다. 호스트가 "에디터 A 만 새 shape, 에디터 B 는 기본 shape" 같은 정책을 표현할 수 없다. TramaInstance 가 instance-scoped registries 를 갖도록 확장하지 않으면 멀티테넌트 시나리오에서 막힌다.

### 10.3 멀티 슬롯 인프라의 적용 범위

`slotIndex/sourceSlotIndex` 와 `OutputSlotSpec` 가 인프라 차원에 있지만 (`model/types.ts:383-389`, `execution/kinds/port-spec.ts`), 실제 멀티 출력 노드는 Stock(3 슬롯), Condition(2 슬롯) 뿐. 향후 N:N 노드가 늘어나면 spawn-policy, socket-registry, cable-points-registry, snap 판정, edge-draft 가 *모든 자리에서 슬롯 인덱스 전파* 를 일관되게 다뤄야 한다 — 현재는 slot 0 폴백 경로가 곳곳에 남아 있어 회귀 위험.

### 10.4 WrappedValue lifecycle 의 함정

`exec-value.ts:108-118` 의 `unwrap` 이 `ResolvedScalar` 만 받게 타입으로 강제하지만, 새 노드 디스크립터가 `ctx.next[edge.from]` 을 직접 읽고 `ev.value` 같은 자리 접근을 하면 *컴파일러가 잡지 못한다*. 표준 환원 패턴 (`unwrap(resolveScalar(ev, ctx.simulationTimeMs))`) 을 강제하는 lint 가 없다. propagate 디스크립터가 늘어날수록 누락 위험.

### 10.5 stepIntervalMs 통제 분산

`simulationTimeMs` 가 옵션 `stepIntervalMs` 의 누적 (`propagate.ts:115`). executeModel / model-store recompute / pulse-arrival 등 호출자가 *각자* 올바른 간격을 넘겨야 throttle / observe windowing 이 정합. 통제 지점이 분산돼 있어 "0 으로 호출한 정적 재계산" 과 "STEP_TICK_MS 로 호출한 ticker step" 의 의미 차이가 호출자 책임이다.

### 10.6 fizzex 외부 의존

ExpressionNode 가 fizzex 패키지에 묶여 있다 (`expression/fizzex-evaluator.ts`). fizzex 가 sibling file 참조라 워크스페이스 외부 사용자 입장에서는 *trama + fizzex 묶음* 을 받아야 한다. @trama-chain/tiptap 이 fizzex 를 manual chunk 로 분리했지만 번들 사이즈는 늘어남.

### 10.7 paused-only 편집 제약

`assertEditable()` 게이트가 paused 상태에서만 mutation 허용. 시뮬레이션을 보며 *실시간으로 임계값을 조정* 같은 UX 가 필요하면 trajectory invalidate 정책을 다시 짜야 한다. 현재는 안전을 위해 직관적 의미 (편집 = 시간 정지) 를 택했지만 미래 요구가 있을 수 있다.

### 10.8 side-effect import 의존

`register-default-kinds.ts`, `register-default-skins.ts`, `register-default-editors.ts`, `register-default-visualizations.ts` 모두 import 시점 side-effect 로 등록. 호스트가 잘못된 순서로 import 하거나 tree-shaker 가 dead-code 로 제거하면 dispatcher 가 미등록 노드를 본다. 명시적 `bootstrap()` 함수가 없다.

### 10.9 고정 상수의 노드별 override 부재

- `STOCK_RATE_WINDOW_MS = 1000` 단일 상수 (`state.ts:23`). "30 초 평균 유입" 은 별도 노드 종류로만.
- `MAX_ACCUM_MS = 250`, `MAX_STEPS_PER_RAF = 8` 도 simulation-loop 의 단일 정책. 매우 빠른/느린 simulation 에서 의미 변동.

### 10.10 ui-primitives 의 빈 자리

`packages/ui-primitives/src/` 가 존재하지만 비어 있고 `package.json` 도 없다. CLAUDE.md 에는 "공용 UI 프리미티브" 로 등록돼 있어 의도된 미래 자리지만 *현재는 거짓말*. 외부에서 import 시도하면 깨진다.

### 10.11 tokens build-time 의존

토큰 변경 시 `packages/tokens/build.ts` 재실행 필요. dev loop 에서 watch 가 없으면 변수 추가/수정이 즉시 반영되지 않는다. IDE 자동완성도 build 산출물의 `.d.ts` 에 의존.

### 10.12 NodeKindDescriptor 분기 외 시각 영역

디스크립터가 propagate/단위/포트/raw 등은 한 자리에 모았지만 **UI 측 시각 분기는 별도 카탈로그** (`node/kind-catalog.ts`) 로 분리돼 있다. 결과적으로 노드 종류 추가가 *core 디스크립터 + projector-web UI 디스크립터* 두 자리를 항상 같이 갱신해야 한다. 두 카탈로그가 어긋날 때 컴파일러가 잡지 못한다 (다른 패키지·다른 인터페이스).

---

## 11. 부록: 변경 영향 매트릭스

| 변경 | 건드릴 자리 |
|---|---|
| 새 노드 종류 추가 | model/types.ts · schema/document.ts · execution/kinds/descriptors/* · kinds/index.ts · projector-web/node/register-default-kinds.ts · (UI 컴포넌트) |
| 새 함수 shape | core/functions/shapes/<name>.ts · functions/registry.ts · (선택) projector-web/function-picker/editor-registry.ts |
| 새 combiner | core/combiners/index.ts |
| 새 constant | core/constants/registry.ts · defaults.ts |
| 새 generator paradigm | core/generators/<name>.ts · registry.ts · model/types.ts GeneratorParams · schema/document.ts GeneratorParamsSchema |
| 새 skin | projector-web/skin/skins/<name>.tsx · register-default-skins.ts |
| 새 observe visualization | projector-web/observe/<name>.tsx · register-default-visualizations.ts |
| 새 host (Tiptap 이외) | 새 host-* 패키지. core 와 projector-* 는 무변경 |

`rules/concerns/C3-descriptor-registry.md` 와 `C4-sum-type-routing.md` 가 위 매트릭스의 동기를 강제한다.
