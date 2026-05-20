# kinds.ts 디스크립터 파일 분리 — 실행 계획 (2026-05-20)

> 감사 리포트 `RUNTIME-AUDIT-2026-05-20.md` §6.2 (b) 의 1단계.
> 이 문서는 **계획만** 정리한다. 실제 코드 변경은 별도 PR 에서.

---

## 1. 목적과 범위

- `packages/core/src/execution/kinds.ts` (1390줄) 를 의미 단위로 분리.
- **public surface 동일성 유지** — `@trama/core` 의 re-export(`execution/index.ts:5 export * from './kinds.js'`) 를 통해 외부에서 보던 심볼은 그대로.
- 외부 변경 0 — projector-web/projector-embed 의 import 라인은 한 줄도 안 바뀐다.
- 동시에 **장기 fix 들의 단위를 좁힌다**: P2/P6/P7/P8 같은 디스크립터 내부 회귀는 이후 디스크립터 1 파일만 손대고 끝낼 수 있게.

비목표:
- 디스크립터의 동작 변경. 시그니처 변경. ctx 표면 좁히기(§6.2 (a)). → 별도 단계.
- 주석 vs 실제 표(§5/§9) 정정. → 분리 PR 의 본문이 비대해지지 않도록 제외.
- 테스트 추가. → 단기 fix 단계의 회귀 테스트와 함께.

---

## 2. 현재 구조 정밀 매핑

### 2.1 외부 import 진입점

```
@trama/core
  └── packages/core/src/index.ts
        └── … re-export …
              └── execution/index.ts:5  →  export * from './kinds.js'
```

`@trama/core` 를 import 하는 곳은 65 군데(projector-web/embed). 그러나 모두 *re-export 된 심볼명*으로만 의존한다. 분리는 *내부 파일 경계*만 바꾸므로 외부는 0 영향.

### 2.2 core 내부 직접 import (3 곳)

| 파일 | kinds 에서 import 하는 심볼 |
|---|---|
| `execution/state.ts:12~16` | `defaultNodeKindRegistry`, `NodeKindRegistry`(type), `ObserveExtractionRuntime`(type) |
| `execution/propagate.ts:19~27` | `canBeFeedbackTarget`, `defaultNodeKindRegistry`, `getNodeOutputUnit`, `isRawOutputNode`, `NodeKindRegistry`(type), `ObserveExtractionRuntime`(type), `PropagateContext`(type) |
| `execution/recompute-node.ts:12~17` | `defaultNodeKindRegistry`, `NodeKindRegistry`(type), `ObserveExtractionRuntime`(type), `PropagateContext`(type) |

→ 이 3 곳은 분리 후 새 경로를 가리키도록 import 만 수정.

### 2.3 kinds.ts 내부 항목 분류

| 그룹 | 라인 | 항목 |
|---|---|---|
| **컨텍스트/상수** | 48 / 100 / 130 / 209 | `ObserveExtractionRuntime`, `FREE_FALLBACK`, `PropagateContext`, `PortTypeContext` |
| **포트 스펙 + 호환성** | 118 / 219 / 232 / 245 / 248 / 253 / 1302 / 1317 / 1345 / 1387 | `isIdentityShape`, `ScalarPortSpec`, `SequencePortSpec`, `PortSpec`, `isSequencePortSpec`, `OutputSlotSpec`, `EdgeCompatibility`, `specMatches`(내부), `checkEdgeCompatibility`, `describePortSpec`(내부) |
| **디스크립터 인터페이스** | 269 | `NodeKindDescriptor` |
| **레지스트리** | 334 / 355 / 357 / 1178 / 1195 | `NodeKindRegistryImpl`(class), `NodeKindRegistry`(type alias), `createNodeKindRegistry`, `createDefaultNodeKindRegistry`, `defaultNodeKindRegistry` |
| **쿼리 헬퍼 (호스트가 호출)** | 1201 / 1212 / 1220 / 1232 / 1245 / 1257 / 1273 / 1291 | `getNodeOutputUnit`, `isRawOutputNode`, `canBeFeedbackTarget`, `getOutputSlots`, `getOutputSlotAt`, `getInputAccepts`, `getInputPortType`, `getOutputPortType` |
| **내부 헬퍼 (디스크립터들이 공유)** | 60 / 81 / 362 / 819 / 828 / 847 | `getNumericNext`, `getBooleanNext`, `isEdgeSourceValid`, `firstIncomingEdgeForNode`, `capacityMatches`, `passthroughSourceSpec` |
| **디스크립터 본문 9 개** | 371 / 497 / 531 / 634 / 757 / 868 / 989 / 1071 / 1134 | value, constant, condition, expression, logic-gate, observe, generator, average, stock |
| **디스크립터 전용 헬퍼** | 470 | `propagateBooleanValueNode` (value 만 사용) |

---

## 3. 목표 디렉터리 구조

```
packages/core/src/execution/
  kinds.ts                       ← 삭제 후 디렉터리로 교체 (또는 thin re-export 로 유지)
  kinds/
    index.ts                     ← 외부에 노출할 모든 심볼 re-export. public surface 단일 진입.
    context.ts                   ← PropagateContext, ObserveExtractionRuntime, PortTypeContext, FREE_FALLBACK
    port-spec.ts                 ← Scalar/Sequence/PortSpec/OutputSlotSpec, isSequencePortSpec, isIdentityShape
    edge-compatibility.ts        ← EdgeCompatibility, checkEdgeCompatibility, specMatches, describePortSpec
    descriptor.ts                ← NodeKindDescriptor (인터페이스만)
    registry.ts                  ← NodeKindRegistryImpl, NodeKindRegistry, createNodeKindRegistry,
                                    createDefaultNodeKindRegistry, defaultNodeKindRegistry
    queries.ts                   ← getNodeOutputUnit, isRawOutputNode, canBeFeedbackTarget,
                                    getOutputSlots, getOutputSlotAt, getInputAccepts,
                                    getInputPortType, getOutputPortType
    internals.ts                 ← 디스크립터들이 공유하는 내부 헬퍼 — getNumericNext, getBooleanNext,
                                    isEdgeSourceValid, firstIncomingEdgeForNode, capacityMatches,
                                    passthroughSourceSpec (export 는 internals 안에서만)
    descriptors/
      value.ts                   ← valueNodeDescriptor + propagateBooleanValueNode (value 전용)
      constant.ts                ← constantNodeDescriptor
      condition.ts               ← conditionNodeDescriptor
      expression.ts              ← expressionNodeDescriptor
      logic-gate.ts              ← logicGateNodeDescriptor
      observe.ts                 ← observeNodeDescriptor
      generator.ts               ← generatorNodeDescriptor
      average.ts                 ← averageNodeDescriptor
      stock.ts                   ← stockNodeDescriptor
```

**`kinds.ts` 의 처분:**
두 가지 옵션이 있다.

- (A) **파일 삭제** + 디렉터리로 교체. core 내부 import 3 곳을 `./kinds/index.js` 로 수정. `execution/index.ts:5` 의 `export * from './kinds.js'` 를 `./kinds/index.js` 로 변경.
- (B) **thin shim 유지**. `kinds.ts` 내용 전부를 `export * from './kinds/index.js';` 한 줄로. 외부 진입점은 그대로.

권고: **(A)**. shim 을 두면 "어디서 무엇이 정의되는지" 그라우팅이 한 단계 늘어 디버깅 cost 가 누적된다. 외부는 `@trama/core` 만 보므로 내부 import 3 곳만 고치면 끝.

---

## 4. 단계 분할 (PR 단위)

분리는 **하나의 PR 로 한 번에** 끝내는 것이 안전하다 — 디스크립터끼리 내부 헬퍼를 공유하므로 부분 분리는 중간 상태에서 임시 cross-import 가 발생한다. 다만 *작업자가 본인의 점검 편의를 위해 commit 을 나누는* 단위로는 아래 5 commit 권고.

| 커밋 | 내용 | 검증 |
|---|---|---|
| C1 | `kinds/` 디렉터리 생성. `context.ts`/`port-spec.ts`/`edge-compatibility.ts`/`descriptor.ts` 분리. `kinds.ts` 안에서 import 로 끌어다 쓰는 형태. | `pnpm -r typecheck` |
| C2 | `registry.ts`/`queries.ts`/`internals.ts` 분리. `kinds.ts` 가 디스크립터 본문만 남도록. | `pnpm -r typecheck` |
| C3 | `descriptors/{value,constant,condition,expression,logic-gate}.ts` 분리. `kinds.ts` 는 observe/generator/average/stock 만. | `pnpm -r typecheck` |
| C4 | `descriptors/{observe,generator,average,stock}.ts` 분리. `kinds.ts` 가 사실상 비어 `kinds/index.ts` 의 mirror 가 됨. | `pnpm -r typecheck` |
| C5 | `kinds.ts` 삭제. `execution/index.ts` + `state.ts` + `propagate.ts` + `recompute-node.ts` 의 import 경로를 `./kinds/index.js` 로 일괄 수정. | `pnpm -r typecheck` + `pnpm -r test:run` |

각 commit 사이에 typecheck/test 가 통과되어야 한다. 한 PR 안에서.

---

## 5. 분리 시 규칙

1. **외부 noticeable surface 0 변경**
   - `@trama/core` 가 export 하던 심볼은 *이름·시그니처·런타임 동작* 모두 동일.
   - 점검 명령: 분리 전후로 `pnpm --filter @trama/core build` 산출물(.d.ts) 의 export 목록이 동일한지 diff.
2. **내부 cross-import 최소화**
   - 디스크립터 파일은 `../context.ts`, `../port-spec.ts`, `../descriptor.ts`, `../internals.ts` 만 import 한다.
   - 디스크립터끼리는 *서로 import 하지 않는다*. 공통 로직이 있다면 `internals.ts` 로 끌어올린다.
3. **`internals.ts` 는 public re-export 금지**
   - `kinds/index.ts` 는 `internals` 를 export 하지 않는다 — 의도적으로 hidden.
   - 회귀 검증: `grep "from '.*kinds/internals'" packages/projector-web packages/projector-embed` 결과 0건이어야.
4. **타입과 값은 같은 파일에 두지 않는 경향 유지**
   - 인터페이스만 모인 파일(`descriptor.ts`)과 동작이 들어간 파일(`descriptors/*.ts`)을 분리. 변경 빈도가 다르다.
5. **레지스트리 인스턴스화는 `registry.ts` 한 군데**
   - `defaultNodeKindRegistry` 는 모듈 평가 시점에 한 번만. 9 개 디스크립터를 import 해 `register()`. 평가 순서 의존 0.

---

## 6. 회귀 위험 표

| 위험 | 원인 | 차단 방법 |
|---|---|---|
| public surface 누락 | 분리 중 `kinds/index.ts` 의 re-export 빠뜨림 | C5 직후 `pnpm --filter @trama/core build` 후 `.d.ts` diff |
| 모듈 평가 순환 | 디스크립터 ↔ registry ↔ kinds/index 의 cyclic import | descriptors/*.ts 는 registry 를 import 하지 않게(반대로 registry 가 descriptors 를 import) |
| `state.ts` ↔ kinds 양방향 의존 (감사 §3.2 항목 O) | 현재도 양방향. 분리하면서 노출 | 이번 PR 범위 밖. 별도 fix(`ObserveExtractionRuntime` 이 `state.ts` 아닌 별도 모듈에 살게) 후속 PR 로. |
| `index.ts` re-export 중복 충돌 | 같은 이름을 두 모듈이 export | `export * from` 대신 명시 re-export 권고 (아래 §7) |
| typecheck 통과인데 런타임 깨짐 | 디스크립터 본문이 사용하는 내부 헬퍼를 잘못된 파일로 옮김 | C5 직전 `pnpm --filter @trama/core test:run` |
| 외부 패키지가 `@trama/core` 외 경로로 import | grep 결과 0건 확인(아래 §8) | C5 후 재확인 |

---

## 7. `kinds/index.ts` 의 export 형식

`export * from` 은 빠르지만 충돌 시 디버깅이 어렵다. 명시 형식 권고:

```ts
// kinds/index.ts
export { FREE_FALLBACK, type PropagateContext, type ObserveExtractionRuntime, type PortTypeContext } from './context.js';
export { type ScalarPortSpec, type SequencePortSpec, type PortSpec, type OutputSlotSpec, isSequencePortSpec, isIdentityShape } from './port-spec.js';
export { type EdgeCompatibility, checkEdgeCompatibility } from './edge-compatibility.js';
export { type NodeKindDescriptor } from './descriptor.js';
export { type NodeKindRegistry, createNodeKindRegistry, createDefaultNodeKindRegistry, defaultNodeKindRegistry } from './registry.js';
export {
  getNodeOutputUnit, isRawOutputNode, canBeFeedbackTarget,
  getOutputSlots, getOutputSlotAt, getInputAccepts,
  getInputPortType, getOutputPortType,
} from './queries.js';
```

내부 헬퍼(`internals.ts`)와 디스크립터(`descriptors/*.ts`)는 *어디서도* re-export 되지 않는다 — `registry.ts` 만 디스크립터를 import 해 등록.

---

## 8. 검증 체크리스트

- [ ] C1~C4 각 단계에서 `pnpm -r typecheck` 통과.
- [ ] C5 후 `pnpm -r test:run` 통과 (core 단위 테스트 + 다른 패키지).
- [ ] `pnpm --filter @trama/core build` 후 `dist/execution/kinds*.d.ts` 의 export 목록이 분리 전과 동일 (수동 diff).
- [ ] `grep -rn "from '.*execution/kinds'" packages/` 결과가 core 내부 4 곳(state/propagate/recompute-node/index) 만 표시 — 외부에서 직접 깊은 경로로 import 하는 경우 0 건.
- [ ] `grep -rn "from '.*kinds/internals'" packages/projector-web packages/projector-embed packages/host-tiptap*` 결과 0 건 — internals 누설 없음.
- [ ] 분리 PR 의 diff 가 *코드 이동* 만으로 구성. 동작 변경 0 (`git diff -M` 의 rename 비율 70% 이상 권고).
- [ ] `defaultNodeKindRegistry` 가 9 개 kind 를 등록. `defaultNodeKindRegistry.get(kind)` 호출이 모든 NodeKind 에 대해 정의 반환.

---

## 9. 롤백 전략

- 모든 작업은 단일 PR. 머지 전 검토 시 문제 발견 시 PR 폐기로 끝.
- 머지 후 회귀가 발견되면 *부분 되돌림*은 어려움 — `git revert` 로 PR 전체 되돌림이 가장 안전. 디스크립터 본문이 9 개 파일로 흩어졌기 때문에 한두 디스크립터만 부분 revert 가 그렇게 깔끔하지 않다.
- 이를 막기 위한 사전 검증: §8 의 항목 + 분리 전 `git stash` 로 임시 분리 산출물을 만들어 `pnpm -r test:run` 통과를 *PR 작성 전*에 확인.

---

## 10. 이 PR 이 닫히면 열리는 후속 작업

- §6.2 (a) — ctx mutate 표면 좁히기. *디스크립터 본문이 9 개 파일로 분산되어 있으므로* `setValid`/`setInvalid(reason)`/`pushObserveSample` 헬퍼로 교체할 때 한 파일씩 점진 진행 가능.
- §6.2 (d) — invariant selector 단일 진실. `queries.ts` 가 자연스러운 거처.
- 감사 §5 표의 A/I/O/P — 각각 한두 파일 범위로 정정 가능. PR 단위가 작아진다.

---

## 11. 작업량 예상

- 본 분리 PR: 0.5 ~ 1 일 (분리 후 typecheck/test 안정화 비용 포함).
- 외부 (projector-web/embed/host-tiptap) 영향 검토: 0 — 별도 작업 없음.
- 후속 §6.2 (a) ctx 좁히기: 별도 1 ~ 2 일.

본 PR 자체는 **순수 이동**. 사용자 입장에서 *바뀐 것이 없어 보이는* PR. 의의는 다음 디스크립터 변경 PR 들이 *한 파일만 수정*하게 되는 것.

---

(끝)
