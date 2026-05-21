# Trama 성능 한계선 분석

> 분석 원천: 코드 (`packages/**`) + `docs/ARCHITECTURE.md`. 모든 수치 주장에는 파일 경로 + 줄 번호가 붙어 있다.
> 작성 시점: 2026-05-21. `main` HEAD 기준. ARCHITECTURE.md 와 동일 스냅샷.
>
> 본 문서는 **정량 한계 추정 + 병목 분석 + 개선안** 을 다룬다. 실측 벤치마크는 포함하지 않으며, 알고리즘적 비용과 자료구조 모양에서 유도한 *상한 추정* 이다.

---

## 0. 한 줄 요약

- Trama 의 핫패스는 **세 시간축** 으로 깔끔히 분리된다: (a) RAF 시뮬레이션 펌프 — generator emit 전용, O(G), (b) 펄스 도착 incremental cascade — O(dirty), (c) 모델 편집 full recompute — O(N_steps · N_nodes). 매 프레임 전체 그래프를 돌리지 않는 게 핵심 강점.
- 매 프레임 *지배적* 비용은 **`stepCable` Verlet 적분** — 엣지당 ~140 부동소수점 연산. 16ms 예산을 깎아먹는 첫 번째 한계.
- 두 번째 한계는 **`trajectory` 메모리 누적** — `executeModel` 이 매 step 마다 `ExecutionState` 를 push (`execute.ts:66`). N step · 노드 수 만큼 선형 누적. 시뮬레이션을 길게 놔두면 GC pause 가 들어온다.
- 세 번째 한계는 **모듈 스코프 레지스트리 공유 + side-effect import bootstrap** 으로 인한 멀티테넌트 격리 부재 (ARCHITECTURE.md §10.2, §10.8).

추정 안전 운용 구간 (60Hz 유지 가정). "안전" 은 다른 비용과 합쳐도 16ms 예산 안, "경고" 는 단독으로 1ms 이상 또는 합산 시 frame drop 위험, "한계" 는 그 자체로 frame budget 의 절반 이상을 잡아먹는 지점.

| 축 | 의미 (단위) | 안전 | 경고 | 한계 | 한계에서 깨지는 자리 |
|---|---|---|---|---|---|
| 노드 수 N | 모델에 존재하는 노드 개수 | ≤ 100 | 100~300 | ~500 | 모델 편집 시 `executeModel` 의 O(N_steps·N) propagate (`execute.ts:42`). 사용자 인지 한계 100ms 초과 |
| 엣지 수 M (화면 안 보이는 cable 포함) | `cable-points-registry` 에 등록된 활성 cable 수 | ≤ 80 | 80~200 | ~400 | EdgeView 매 프레임 setAttribute (cable당 6~10 호출, `EdgeView.tsx:213-246`) + cable physics 산술 합산. §2.1 정정 — DOM mutation 이 지배항이라 처음 추정 (≤150/~600) 보다 좁다. culling 도입 시 화면 안 cable 수로 다시 좁힘 |
| 동시 펄스 P | 같은 시각에 traveling 중인 펄스 개수 | ≤ 80 | 80~200 | ~400 | `PulseLayer` 의 setAttribute fan-out (P · 2~4 SVG attr write/frame). cx/cy 갱신이 1ms 이상 |
| 활성 generator G | paused=false 상태에서 emit 가능한 generator 노드 수 | ≤ 20 | 20~50 | ~100 | `tickGenerators` 가 generator 마다 `model.edgeOrder.some(...)` 스캔 (`simulation-loop.ts:87-91`) — O(G · M) · 8 step/RAF |
| `model.execution.steps` (feedback 모델 한정) | `executeModel` 한 호출이 만드는 trajectory 배열 길이. **feedback 엣지 (lag=1) 가 있을 때만** UI 에 노출됨 (`ExecutionControl.tsx:16-26`). feedback 없는 모델은 항상 1 로 고정. max 제한 없음 (`ExecutionControl.tsx:37`) — 사용자가 큰 값 직접 입력 가능 | ≤ 600 | 600~3,000 | ~10,000 | trajectory 메모리 + 매 mutation 마다 N·노드 비례 propagate. N=10,000 + 노드 100 시 단일 trajectory 수십~수백 MB. GC pause 가 frame budget 침범 |

근거는 §3.

---

## 1. 시간축별 성능 모델

ARCHITECTURE.md §9.5 가 말하는 "simulation / wall clock / travel" 세 시간축은 *성능적으로도* 서로 다른 핫패스를 만든다. 비용을 시간축별로 분리해야 한 자리에서 합산하지 않는다.

### 1.1 RAF 펌프 — `rafSimulationStep`

`packages/projector-web/src/store/simulation-loop.ts:160-185`. 매 RAF 마다:

1. `performance.now()` 1회.
2. `wallDt = now - lastWallNowMs`.
3. `simAccumMs = min(simAccumMs + wallDt · multiplier, 250)` (`simulation-loop.ts:178`).
4. `while (simAccumMs ≥ FIXED_DT_MS && steps < 8)`: `tickGenerators(); simAccumMs -= 16.67; steps++`.

상수 (`simulation-loop.ts:24-32`):
- `FIXED_DT_MS = 1000/60 ≈ 16.67`
- `MAX_ACCUM_MS = 250` (spiral-of-death 회피)
- `MAX_STEPS_PER_RAF = 8`

`tickGenerators` (`simulation-loop.ts:95-147`) 는 *generator emit 만* 다룬다. 매 호출에 노드 전체 propagate 를 돌리지 *않는다*. 비용은:

- `executionState.generatorRuntime` 전체 순회 — O(G).
- 각 generator 마다 `isGeneratorEffectivelyEnabled` 가 `model.edgeOrder.some(...)` (`simulation-loop.ts:87-91`) — **여기서 노드당 O(M)**. 따라서 tickGenerators 한 호출은 **O(G · M)**.
- `defaultGeneratorRegistry.emit(...)` 호출 — paradigm 별로 O(1) (counter/uniform/normal/sine/step/pulse/schedule 모두 closed-form).
- `setState({ executionState: commitExecutionState(...) })` — values/validOutputs/generatorRuntime/simulationTimeMs 의 shallow spread (`simulation-loop.ts:133-140`). 한 step alloc 3 + 1 = 4 객체.
- emit 한 generator 마다 `spawnOutgoingPulses(model, executionState, nid)` (`simulation-loop.ts:145`).

**RAF 한 프레임 최악 비용** (multiplier=high 로 8 step):

```
8 · (G · M + 4 alloc + emitted · spawnCost) ops
```

`spawnOutgoingPulses` (`spawn-policy.ts:56-74`) 는 해당 노드의 outgoing 엣지를 한 번 순회 — O(out_degree).

### 1.2 펄스 도착 — incremental cascade

`packages/projector-web/src/store/pulse-arrival.ts`. 한 펄스가 도착하면:

- Generator 타깃: `rt.gateOpen` 캐시만 갱신. O(1). 다운스트림 효과는 다음 ticker tick 으로 미뤄짐 (gate 의 *시각보다 효과가 먼저 가지 않는* 시맨틱 — ARCHITECTURE.md §9.3 / memory `feedback_pulse_is_causal`).
- Stock 타깃: `spawnStockSlotPulse` — level/window/rate 누적 후 outgoing slot 펄스 발사. O(out_degree).
- 일반 타깃: `recomputeNode(target, state, model, ...)` (`recompute-node.ts:134`) — 단일 노드의 propagate.descriptor 한 번. 결과 슬롯이 valid→invalid 로 바뀌면 `cascadeInvalidation` (`incremental-invalidation.ts:34`) 으로 *영향 받은 다운스트림 노드만* 재계산.

`cascadeInvalidation` (`incremental-invalidation.ts:34-149`) 의 알고리즘을 직접 본 후 정정: *위상순서 단일 패스 BFS-on-DAG*. caller state 를 시드로 워킹 state 를 만들고 (여기서도 5개 spread alloc, L48-62), root 의 변경 슬롯 다운스트림을 `dirty` 셋에 push, 그 다음 `topology.order` 를 한 바퀴 돌면서 dirty 에 든 노드만 `recomputeNode` 호출 (L88-130). Kahn 위상정렬 보장 덕에 한 번의 forward pass 로 cascade 가 끝난다.

worst-case 비용 분해:

- topology.order 한 패스 자체: O(N).
- 각 dirty 노드의 `recomputeNode`: 그 노드의 incoming 엣지 수 d_in 에 비례.
- 각 머지 후 outgoing 엣지를 dirty 에 추가: d_out.

전부 dirty 인 worst-case 는 **O(N + E)** — Kahn 위상정렬과 같은 차수. 리포트에 처음 적었던 "O(N)" 은 노드 순회 항만 본 표현이라 엣지 비용을 빠뜨렸다.

다만 *증분 cascade 의 핵심 장점은 평균* 이다 — 일반 펄스 도착에서 dirty 가 N 의 작은 부분집합 (영향 받은 다운스트림만) 이면 비용은 그 부분집합 크기와 그 부분집합의 엣지 수에 비례. 비용 차원에서 모델 편집의 full `executeModel` (O(N_steps · N) — feedback 모델은 더 큼) 보다 한 자릿수 이상 싸다.

### 1.3 모델 편집 — full `executeModel`

`packages/core/src/execution/execute.ts:42-71`.

```
const N = max(1, model.execution.steps | 0)   // 사용자 정의 step 수
for t in 0..N-1:
  state = propagateOneStep(state, model, propOpts)   // O(N_nodes)
  if t < N-1:
    state = applyFeedbackEdges(state, model, ...)    // O(M_edges)
  trajectory.push(state)                             // O(1) push, but state 자체 O(N_nodes) 메모리
```

`commitModelMutation` 이 매 mutation 마다 이 함수를 호출 (`execution-store.ts:76-78`). 즉 노드 한 개를 옮기거나 prop 을 바꿀 때마다 **N_steps × N_nodes 의 propagate + N_steps 만큼의 ExecutionState 가 trajectory 에 누적**.

`propagateOneStep` (`propagate.ts:77-200`) 한 호출의 alloc 패턴 (직접 확인):

- `next = { ...state.values }` — O(N) spread.
- `validOutputs = new Set(state.validOutputs)` — O(N) copy.
- `cloneObserveBuffer(...)` 가 observe 노드별 호출 — O(observe 노드 수 · 버퍼 크기 K_obs).
- `sequenceNext = { ...state.sequenceOutputs }` — O(N_sequence) spread.
- 위상 순회 `for (const nid of topology.order)` — 노드당 디스크립터 `propagate` 호출.

매 step 4~6개의 spread 가 추가로 발생하므로 한 step 의 GC 부담은 *노드 수에 비례* (constant pool 의 cleanup).

### 1.4 시각 ticker — cable physics 가 지배

`AnimationLoop` (`canvas/animation-loop.ts`) 는 단일 RAF 펌프에 여러 ticker 를 등록. 매 프레임:

1. `rafSimulationStep` — §1.1.
2. EdgeView 별 `stepCable` — §2.1.
3. `PulseLayer` tick — 활성 펄스 위치 setAttribute (§2.2).

EdgeView ticker 가 가장 큰 항. 자세한 분석은 §2.

---

## 2. 핵심 핫패스 정량

### 2.1 Cable Physics (`edge/cable-physics.ts`)

상수 (`cable-physics.ts:35-40`):

```
DEFAULT_CABLE_CONFIG = {
  gravity: 0.55,
  iterations: 5,
  segments: 24,
  slack: 0.64,
}
```

`stepCable(cable)` 한 호출 비용 (`cable-physics.ts:84-128`):

- Verlet 적분: 중간 점 22 개 — *22 × (3 add + 2 store)* ≈ **110 ops**.
- 거리 제약 완화: `iterations(5) × (segments-1)(23) = 115` 회 반복 × (hypot + branch + 4 add) ≈ **460+ ops**.
- 합산: **~570 부동소수점 ops / cable / frame**.

`cableToPoints` (`cable-physics.ts:131-139`) 가 매 프레임 string 빌드 — *24 좌표 × toFixed(2)* — 약 48 toFixed 호출.

**중요 정정**: cable 의 매 프레임 DOM mutation 은 "path + hitPath 두 setAttribute" 가 아니라 *훨씬 많다*. `EdgeView.tsx:213-246` 를 직접 읽어 확인한 호출 패턴:

| 자리 (라인) | 대상 | 호출 |
|---|---|---|
| L213-214 | pathRef / hitPathRef | `setAttribute('points', ...)` × 2 (본체 polyline + 클릭 hit-area polyline) |
| L217 | arrowRef | `setAttribute('points', computeArrowPoints(...))` (화살촉 — string 빌드 추가) |
| L218-219 | detachHitRef | `setAttribute('cx'/'cy', ...)` × 2 (detach 핸들) |
| L223-224 | stepCountRef | `setAttribute('x'/'y', ...)` × 2 (중간 step count 텍스트) |
| L227-228 | insertCircleRef | `setAttribute('cx'/'cy', ...)` × 2 (affordance 원) |
| L232 | shapeMarkerRef | `setAttribute('transform', ...)` (shape 아이콘) |
| L246 | path.style | `setProperty('--undulation-intensity', ...)` (CSS variable) |

**한 cable 당 매 프레임 setAttribute 가 6~10 회 + CSS variable 1 회 + arrow 의 string 빌드 1 회**. 위 ref 중 일부는 조건부 (drag 중 detach handle, undulation 효과 활성화 시 CSS var 등) 라 실제 호출 수는 상황에 따라 다르지만, *최소 path + hitPath + arrow = 3 setAttribute* 는 매 프레임 무조건 일어난다.

엣지 M 개의 매 프레임 비용을 항별로 분리하면:

| 항 | M=100 시 | M=300 시 | M=600 시 |
|---|---|---|---|
| cable physics 산술 (`stepCable` ~570 ops/cable, V8 ~1ns/op 어림) | ~57μs | ~171μs | ~342μs |
| `cableToPoints` toFixed (~48 op/cable) | ~5μs | ~14μs | ~29μs |
| SVG setAttribute (cable당 평균 6 호출, ~1μs/호출 어림) | ~600μs | ~1.8ms | ~3.6ms |
| 합계 | ~660μs | ~2ms | ~4ms |

**즉 cable 의 16ms 예산 잠식의 *지배항은 cable physics 산술이 아니라 SVG setAttribute 호출 자체*** 다. 산술 비용보다 한 자릿수 큰 비용이 DOM mutation 측에 있다. ns/op·μs/setAttribute 환산은 보수 어림이고, 실제 setAttribute 비용은 브라우저·요소 종류·attribute 종류에 따라 0.5~5μs 범위에서 변동 — 정확한 값은 실측 필요.

내가 처음 §0 의 안전 운용 구간을 적었을 때 (`M ≤ 150` 안전 / `~600` 한계) 는 *산술 항만 본 어림*이라 한계 추정이 낙관적이었다. 위 표대로 setAttribute 항을 포함하면 안전·경고·한계 구간이 더 좁아진다 (≤80 / 80~200 / ~400 정도가 더 합리적). 단, 이 정정도 여전히 *측정 없는 추정 위의 추정* 이라 §5 의 실측 권장은 그대로 유효.

**`segments=24` 와 `iterations=5` 가 하드코딩** (`cable-physics.ts:38-39`) — 엣지 굵기/거리에 무관하게 동일. 짧은 엣지에는 과하고 긴 엣지에는 부족. § 4.A 의 개선 후보. 다만 segments 를 줄이면 cableToPoints 의 toFixed 횟수만 줄어들지 setAttribute 자체 호출 횟수는 그대로 — *DOM mutation 항을 줄이려면 §4.E 처럼 transform 통합이나 culling 이 효과가 크다*.

### 2.2 Pulse Layer

`pulse/PulseLayer.tsx` 가 `pulseRegistry.subscribeTick` 으로 매 프레임 콜백 등록.

- 활성 펄스 P 개에 대해:
  - `pulseRegistry.getActive()` — 캐시된 snapshot O(1) (`pulse-registry.ts:115`).
  - 각 펄스마다 `cablePointsRegistry.get(edgeId)` — Map lookup O(1).
  - `cablePointAt(cable, fraction)` — `Math.round + 배열 인덱싱` O(1) (`cable-physics.ts:163-169`).
  - SVG 엘리먼트의 `cx`, `cy` setAttribute — 펄스당 **2~4 setAttribute** (펄스 본체 + 글로우).

**P=80 시: ~240 setAttribute / frame**. 크롬 SVG attr 쓰기는 한 호출 < 1μs — 0.24ms. 안전.

**P=400 시: ~1,200 setAttribute / frame** ≈ 1.2ms — 다른 ticker 합치면 위험권.

`getBoundingClientRect` 호출 없음. layout thrash 없음.

`pulseRegistry.advance` (`pulse-registry.ts:138-163`) 가 펄스 lifecycle 만 다루고 도착 검사는 단순 비교 — O(P).

### 2.3 propagate 의 step 비용 (단일 step)

`packages/core/src/execution/propagate.ts:77-200`. 위상 순서로 한 번 순회.

- 한 노드의 디스크립터 `propagate` 비용:
  - **Value** (`descriptors/value.ts:77-146`): incoming 평균 in_degree d 만큼의 contribution 머지 + `normalize/shape.compute/denormalize`. 한 contribution 당 **shape.compute** 가 가장 비싼 항. Trama 의 shape 들 (linear/sigmoid/gaussian/threshold/decay/...) 은 모두 closed-form — O(1).
  - **Expression** (`descriptors/expression.ts:30-95`): bindings 채우기 O(arity) + `evaluator.diagnose` — fizzex 가 AST 평가. LaTeX 식 길이 L 에 대해 O(L).
  - **Generator**, **Stock**, **Condition**, **Observe**, **Average**, **ConstantNode**, **LogicGate**: 모두 O(incoming) ~ O(K_sequence).
  - **Average** (`descriptors/average.ts`): 누적 sample 배열 K 개를 매번 순회 — **O(K)**. K 가 클수록 매 step 비용 선형 증가.
- 알로케이션 (`propagate.ts:86-112` 직접 확인):
  - L86: `next = { ...state.values }` — O(N_nodes) spread.
  - L87: `new Set(state.validOutputs)` — O(slot 수) copy.
  - L88: `new Set(state.pendingOutputs)` — O(slot 수) copy.
  - L89-91: `{ ...state.invalidReasons }` — O(invalid 노드 수) spread.
  - L94-97: observe 노드 *각각마다* `cloneObserveBuffer(buf)` — 노드별 sample 배열 깊은 복제. observe 깊이 K_obs 가 크면 O(observe 수 · K_obs) — 한 step 의 *지배 알로케이션 항* 이 될 수 있다.
  - L98-100: `{ ...observeExtractionRuntime }` — O(observe 수) spread.
  - L102-108: generator *각각마다* `{ cursor: { ...rt.cursor }, gateOpen }` — cursor 객체까지 새로 생성. G generator 면 G+1 객체 alloc.
  - L112: `{ ...state.sequenceOutputs }` — O(N_sequence) spread.

**한 step 비용** ≈ O(N + Σ d_v · shape_cost + Σ L_expr + K_average · A_count) 산술 + **고정 6 spread + observe 노드 수만큼의 깊은 clone + generator 노드 수만큼의 cursor copy**.

trajectory 길이 1,000 시 누적 alloc 객체 수가 *수만~수십만* 단위로 쌓인다 (정확한 수는 노드 종류 분포에 의존). 단일 step 의 alloc 크기보다 *N step 트라젝토리 동안의 총 객체 수* 가 GC pressure 의 본질.

**1,000 step 시뮬레이션 시** (현재 trajectory 캡 없음):

- trajectory 배열: 1,000 ExecutionState 객체. 각 ExecutionState 가 N_nodes 크기의 values/sequenceOutputs/validOutputs/... 를 보유 — observe 가 누적된 후반 step 일수록 무거워짐.
- 노드 100 + 평균 sequence 깊이 100 시: ExecutionState ~수십 KB. trajectory 1,000 = **수십 MB**.

### 2.4 `tickGenerators` 의 숨은 비용

`simulation-loop.ts:87-91`:

```ts
const hasIncoming = model.edgeOrder.some((eid) => {
  const e = model.edges[eid];
  return !!e && e.to === nid && e.lag === 0;
});
```

**generator 마다 전체 `edgeOrder` 를 스캔**. G generator + M 엣지 = **O(G · M)** 매 step. 한 RAF 의 8 step 까지 곱하면 **O(8 · G · M)**.

- G=20, M=300: 8 · 6,000 = 48,000 비교 / frame ≈ 50μs. 안전.
- G=50, M=600: 8 · 30,000 = 240,000 ≈ 240μs. 경고.
- G=100, M=1,000: 8 · 100,000 = 800,000 ≈ 0.8ms. 한계.

→ § 4.D 의 개선 후보. 노드별 incoming-edges 인덱스 캐시로 O(G · d_in) 로 떨어진다.

---

## 3. 추정 최대치 (snapshot)

각 한계는 *60Hz 유지 + 16.67ms 예산의 30% 가 cable + pulse + propagate 합* 가정. 나머지 70% 는 React reconcile, 브라우저 합성, 호스트 코드.

| 항목 | 한계치 추정 | 1차 병목 |
|---|---|---|
| 동시 cable physics 활성 엣지 | ~600 | `stepCable` 합산 비용 |
| 동시 펄스 | ~400 | `setAttribute` fan-out |
| 활성 generator (paused=false) | ~100 | `tickGenerators` 의 O(G·M) edgeOrder 스캔 |
| 노드 수 (편집 응답) | ~500 | 매 mutation 시 `executeModel` O(N_steps · N) |
| `model.execution.steps` (재계산 대기시간) | N_nodes × steps · ~10μs 가 사용자 인지 한계 100ms 안 들어가야 → N=100·steps=100 정도 | full `executeModel` |
| trajectory 누적 (메모리) | ~10,000 step · 노드 100 → 수십~수백 MB | `trajectory.push(state)` |
| Average 노드의 누적 sample 깊이 | ~1,000 | 매 step O(K) 순회 |

**가장 먼저 무너지는 자리**: cable physics 의 매 프레임 비용. 엣지가 500 을 넘어가면 16ms 예산이 cable 한 자리에 ~30% 잠식.

**가장 위험한 누적**: trajectory 메모리. 사용자가 시뮬레이션을 *오래 놔두는* 시나리오에서 잠재적 OOM. step 수가 사용자 조절 (model.execution.steps) 인데 상한이 없다.

---

## 4. 병목과 개선안

병목을 **우선순위 (적은 노력 대비 큰 효과)** 로 정렬.

### 4.A Cable physics — `segments` / `iterations` 적응형

**병목**: `cable-physics.ts:38-39` 의 `segments: 24`, `iterations: 5` 가 모든 엣지에 동일.

**현상**: 짧은 엣지 (50px) 도 24 segment 로 시뮬. 비용 동일. 멀리 떨어진 엣지는 시각 차이가 거의 없는데 같은 segment.

**현재 상태** (`packages/projector-web/src/edge/`, `canvas/` grep 으로 확인): off-screen culling 코드 없음. `IntersectionObserver`, viewport-aware visibility, isVisible 모두 부재. 즉 화면 밖 cable 도 매 프레임 stepCable + cableToPoints + 위 §2.1 표의 setAttribute 가 그대로 실행된다.

**개선안 (효과 큰 순서)**:

1. **off-screen culling** (효과 가장 큼): `cable-points-registry` 가 viewport 박스 밖 cable 은 ticker 자체에서 unregister, 들어오면 register. zoom out 으로 전체 그래프가 화면에 다 보일 때는 culling 효과가 없지만, dense graph 가 화면을 넘어 펼쳐진 시나리오에서는 *보이지 않는 cable 의 모든 비용 (cable physics + DOM mutation)* 이 0 으로 떨어진다. §2.1 정정에서 본 setAttribute 항이 지배항이라 그만큼 효과가 크다.
2. **정적 cable detection + setAttribute dedupe**: `points[].x/y` 가 직전 프레임과 동일하면 stepCable 의 출력도 동일 — string 재계산 + setAttribute 모두 skip. dragRegistry (`drag-registry.ts:68-77`) 의 활성 인접 엣지 정보를 신호로 재사용 가능. 정적 그래프 (drag 중도 아니고 노드도 안 움직이는 idle 상태) 에서 cable ticker 가 사실상 *no-op* 이 된다.
3. **거리 기반 segments**: `segments = clamp(8, ceil(d / 30), 24)`. 짧은 엣지는 8 segment 로 떨어지고 cable physics 산술 비용 1/3 절감 + toFixed 횟수도 1/3. 다만 setAttribute 호출 *수* 는 줄이지 못한다 (cable 당 호출 수는 segment 와 무관). §2.1 정정대로 DOM mutation 이 지배항이라면 효과가 1·2 번보다 작다.
4. **iterations 적응**: 정적 cable 은 iteration=1 로 강등. drag 중에만 iteration=5. dragRegistry 신호 재사용.

비용 / 회귀 위험:
- 1번: ~80 줄. 회귀 위험은 *culling 경계에서의 stale points* (cable 이 다시 화면에 들어왔을 때 직전 상태 vs 새 끝점의 점프). 들어올 때 `createCable` 재초기화로 회피.
- 2번: ~40 줄. 회귀 위험은 *정적 판정의 false positive* — 노드는 안 움직였지만 viewport 가 zoom 됐을 때.
- 3번: ~30 줄. 회귀 위험은 segments 감소로 인한 시각적 sag 변화 (사용자 인지 한계 보통 segments ≥ 10).

### 4.B Trajectory 메모리 — 캡 + lazy materialize

**병목**: `execute.ts:66` 의 `trajectory.push(state)` 가 무한 누적. `executeModel` 이 매 mutation 마다 fresh 호출되며 trajectory 가 다시 생성되지만, *세션 중 한 번에 만들어진 trajectory* 안에서는 step 수만큼 ExecutionState 가 메모리에 박혀 있다.

**현상**: `model.execution.steps` 가 큰 값으로 설정된 경우. feedback 모델에서만 ExecutionControl UI 가 노출되고 max 제한이 없어 사용자가 1,000 같은 값을 직접 입력할 수 있다 (`ExecutionControl.tsx:37`). 노드 100 + observe 깊이 100 + steps=1,000 시 단일 trajectory 가 **~20MB**. 모델을 자주 편집하면 GC 주기가 짧아지며 16ms 예산을 깨뜨리는 GC pause 발생. feedback 없는 모델은 steps=1 고정이라 이 시나리오 자체가 안 일어남.

**개선안**:

1. **trajectory cap**: `executeModel` 옵션에 `maxTrajectorySteps` 추가. 초과 시 oldest 를 drop (ring buffer) 또는 trajectory 자체를 *옵션* 으로 (편집 응답 경로에서는 trajectory 필요 없음 — 최종 state 만 필요).
2. **on-demand replay**: `playback-controller` 가 trajectory 의 step-by-step 재생을 보장하지만, *실제로 재생되지 않을 trajectory* 는 만들 필요 없음. UI 모드 (live vs. scrub) 에 따라 trajectory 빌드 분기.
3. **ExecutionState 의 structural sharing**: 매 step 마다 spread 새 객체를 만드는 대신 immutable map (Immer/Immutable.js 또는 가벼운 자체 path-copy) 으로 변경 부분만 새 노드. 노드 100 그래프에서 한 step 의 변경 노드는 보통 ≪100 이므로 메모리 ~10x 절감 가능.
4. **observe 누적 cap**: `state.ts:23` 의 `STOCK_RATE_WINDOW_MS = 1000` 처럼, observe 버퍼에도 sample 수 상한 (현재 capacity 가 있으나 unbounded 옵션 존재). unbounded 옵션을 제거하거나 disk-spill 옵션 추가.

비용: 1번은 ~30 줄. 3번은 큰 변경 — Immer 도입 (~수백 줄 영향). 우선순위는 1 > 4 > 3.

### 4.C `tickGenerators` 의 edgeOrder 스캔 — incoming 인덱스 캐시

**병목**: `simulation-loop.ts:87-91` 가 generator 마다 전체 `edgeOrder.some(...)` 스캔. O(G · M).

**개선안**:

1. **incoming-by-target 인덱스 캐시**: 이미 `buildTopology` (`topology.ts:38-40`) 가 `incomingByTarget` 맵을 만든다. simulation-loop 가 model store 에서 *topology snapshot* 을 가져오거나, generator-specific `hasIncomingByNode: Record<NodeId, boolean>` 캐시를 model mutation 마다 갱신. O(G · d_in) 으로 떨어짐.
2. **generator effective state 캐싱**: `isGeneratorEffectivelyEnabled` 결과 자체를 캐시 — 입력 엣지 추가/제거나 gateOpen 변경 시만 invalidate. 매 RAF 의 cheap lookup.

비용: ~40 줄. 회귀 위험: 캐시 invalidate 누락. 모든 mutation 이 `commitModelMutation` 한 자리를 통과하므로 invalidate 자리도 한 곳.

### 4.D Module-scoped registries — instance-scoped 확장

ARCHITECTURE.md §10.2 가 명시. `store/registries.ts:14-16` 의 `shapeRegistry / combinerRegistry / constantRegistry` 가 같은 패키지 모든 TramaInstance 에 공유된다.

**성능 측면 영향**: 직접 비용 아님. 다만 *멀티테넌트* 시 instance A 의 등록이 instance B 에 누출. 미래의 동시 인스턴스 다양화 시 부작용.

**개선안**: `TramaInstance` 가 `Map<RegistryKey, Registry>` 를 보유. `registerShape(instance, kind, ...)` API 로 진입점 일원화. 등록되지 않은 항목은 module-scope default 로 폴백.

비용: 중간. 우선순위는 위 세 항보다 낮음 — 현 사용 시나리오에서 막힌 케이스 아님.

### 4.E Pulse `setAttribute` 일괄화

**현재 상태** (`PulseLayer.tsx:41-44` 직접 확인): 펄스 1개당 매 프레임 4 setAttribute — `core.cx`, `core.cy`, `halo.cx`, `halo.cy`. core 와 halo 가 *동일 좌표* 인데도 각각 cx/cy 따로 set. `String(pt.x)` 변환만 쓰고 toFixed 없음 (정밀도 정책이 cableToPoints 의 `toFixed(2)` 와 비일관).

**개선안**:

1. **Transform 으로 통합**: `<g transform="translate(x,y)"><circle ... /><circle ... /></g>` 구조로 바꾸면 펄스당 매 프레임 setAttribute 가 *4 → 1*. core/halo 가 같은 좌표를 공유하는 현재 구조에서 즉시 적용 가능. SVG 일반적 최적화.
2. **toFixed 정밀도 일관화**: cable 측이 `toFixed(2)` 인 것과 맞춰 펄스도 `String(pt.x.toFixed(2))` 로. 좌표 string 이 직전 프레임과 동일하면 *setAttribute 자체를 skip* 하는 dedupe 가능 (정적 펄스 = 매우 드물지만 paused 중 모든 펄스가 정적).
3. **Canvas 2D fallback**: 펄스 P 가 임계치 (예: 200) 를 넘으면 SVG 가 아닌 `<canvas>` 위에 그리기. 단일 paintLoop 한 번에 P 개 펄스를 한 canvas frame 으로. 큰 변경이라 마지막 카드.

비용: 1번은 ~20 줄 (DOM 구조 변경 + ref 재배치). 2번은 ~10 줄. 3번은 PulseLayer 전면 재작성.

### 4.F `propagateOneStep` 의 spread alloc 줄이기

**병목**: 한 step 에 `next = {...values}`, `new Set(validOutputs)`, `sequenceNext = {...sequenceOutputs}` 등 4~6 alloc. step 1,000 회 시 4,000~6,000 객체.

**개선안**:

1. **변경 노드만 mutate**: propagate 가 *실제로 출력을 바꾼 노드* 만 새 객체로 만들고 나머지는 같은 참조 유지. `next` 를 처음에 shallow copy 하지 말고 디스크립터가 `next.set(nid, value)` 같은 mutator 를 통해 갱신. 변경 노드 비율이 낮으면 alloc 0.
2. **Observe 버퍼의 in-place push**: `cloneObserveBuffer` 가 sample 배열을 매 step 복사 — *append-only* 이므로 copy-on-write 가능.

비용: 중간. ExecutionState 의 불변성 계약 깨질 위험 — playback-controller 의 step-by-step 재생이 prior state 를 *읽기 전용* 으로 가정. 도입 시 trajectory 의 deep snapshot 책임을 호출자에게 이양 필요.

### 4.G `ExpressionNode` 의 fizzex 평가 캐싱

**병목**: `expression/fizzex-evaluator.ts` 가 매 propagate 마다 `evaluator.diagnose(latex, bindings)` 호출. LaTeX 문자열 파싱이 매번 일어나지 않더라도 (compile 캐시 있다면), bindings 전체 재평가는 O(식 복잡도).

**개선안**:

1. **bindings 동일 시 결과 캐시**: 직전 step 과 bindings 가 *모두 동일* 하면 prior result 재사용. shallow 비교만으로 즉시 단락.
2. **compile 한 번만**: `model-store.updateNode` 에서 `analyze(latex)` 시점에 compiled AST 를 `expressionRuntime` 같은 채널에 박제. propagate 는 AST 만 받아 평가.

비용: 작음. 캐시 일관성 위험은 식 의존성이 명시적이라 낮음.

### 4.H Fixed 상수의 사용자 노출 (ARCHITECTURE.md §10.9)

**병목**: `STOCK_RATE_WINDOW_MS = 1000`, `MAX_ACCUM_MS = 250`, `MAX_STEPS_PER_RAF = 8` 가 노드 / 모델별 override 불가.

**개선안**: model.execution 에 `simulationLimits: { maxAccumMs?, maxStepsPerRaf?, stockRateWindowMs? }` 옵션 추가. 디폴트는 현재 값. 매우 빠른 멀티플라이어 시 8 step cap 이 데이터 손실을 만들 수 있는데, 사용자가 알고 풀 수 있어야 한다.

비용: 작음.

---

## 5. 측정 우선순위 (실측 권장)

본 문서는 *상한 추정* 이다. 실제 한계를 확인하려면 다음 시나리오를 측정해야 한다.

1. **합성 그래프 스트레스**: N=100/300/500, M=N·1.5, 모든 노드가 active. 모델 mutation 마다 `executeModel` 응답 시간 측정 (사용자 인지 한계 100ms).
2. **장시간 시뮬레이션**: paused=false 로 5분 방치. heap snapshot 비교 — trajectory 누적이 OOM 으로 가는지.
3. **펄스 폭주**: Generator 5 개가 동시에 fan-out 50 으로 발사. P=250 정상 영역에서 framerate 유지 확인.
4. **dense edge drag**: 100 엣지가 incident 인 노드 drag — `drag-registry` 의 인접 엣지 캐싱 효과 확인.
5. **deep average**: Average 노드의 누적 sample 깊이가 1,000 일 때 한 step 비용 — `cloneObserveBuffer` + Average 의 O(K) 순회 합산.

측정 후 이 문서의 §3 표를 실측 수치로 갱신해야 한다.

---

## 6. 결론

Trama 의 성능 모델은 **세 시간축 분리** 와 **incremental cascade** 라는 두 큰 디자인 결정이 잘 작동한다. 매 프레임 전체 그래프를 돌리지 않는 정책 덕에 RAF 비용이 그래프 크기와 직교한다.

가장 먼저 고쳐야 할 자리는:

1. **Cable physics 적응형 segments / iterations** (§4.A) — 엣지 수에 가장 민감.
2. **Trajectory 메모리 캡** (§4.B) — 장시간 시뮬 OOM 위험.
3. **`tickGenerators` incoming 인덱스 캐시** (§4.C) — 다수 generator + 많은 엣지에서 30~80% 절감.

위 세 항은 코드 변경이 작고 회귀 위험도 낮다. §4.D~H 는 시나리오가 명확해진 뒤 결정.
