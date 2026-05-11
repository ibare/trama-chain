# Trama MVP 구현 명세 (v4)

## 0. 프로젝트 정체성

**Trama** — 사용자가 변수 간 관계를 *함수 형태*로 정의하고, 값을 조작하며, 사고를 정련해가는 *프레이밍 도구*.

이름 의미: 스페인어 `trama`는 "직물의 씨실"과 "이야기의 플롯"을 동시에 뜻한다. 사용자가 이 도구로 하는 일이 정확히 그 두 가지 — 관계를 *엮어* 사고의 *줄거리*를 만든다.

핵심 원칙 (이 다섯 가지를 위반하는 기능은 추가하지 않는다):

1. **자동 추론 없음.** 도구는 사용자가 명시적으로 그린 것만 다룬다.
2. **함수 형태가 핵심 인지 노동.** 두 변수 간 관계는 +/− 극성이 아니라 *형태*로 표현된다.
3. **물성 시각화.** 값 변화는 데이터 시각화가 아니라 *물건이 반응하는 모습*으로 보여준다.
4. **관점의 다양성 존중.** 같은 상황을 다르게 모델링하는 게 정상.
5. **시각적 아름다움은 비협상.**

---

## 1. 핵심 아키텍처 결정

### 1.1 토큰의 source of truth는 JSON

**Tailwind 또는 CSS 변수를 글로벌하게 정의하지 않는다.** 호스트 환경(Trama를 임베드하는 외부 페이지)의 Tailwind 토큰과의 충돌·간섭 위험을 피하기 위함.

- 토큰은 `packages/tokens/src/tokens.json` 한 파일이 source of truth
- 빌드 시점에 두 산출물 생성:
  - **TS 상수**: JS/Motion 측 접근용
  - **스코프된 CSS**: `[data-trama-root] { --... : ...; }` 형태. 글로벌 `:root`에 절대 깔지 않음
- Trama 내부 스타일링은 이 스코프된 CSS 변수만 참조
- apps/web의 *호스트 UI*는 별도로 Tailwind를 써도 됨. Trama 내부와 격리되어 있음.

### 1.2 모델의 직렬화 형태는 JSON

UI는 모델을 만드는 한 가지 표면일 뿐이며, 모든 모델은 마크다운 코드 펜스 안의 JSON으로 표현·저장·전송된다.

- 펜스 라벨: <code>\`\`\`trama</code> ... <code>\`\`\`</code>
- 펜스 안의 내용: JSON
- 사용자가 손으로 편집할 일은 없지만, *읽을 수 있고*, *파싱 가능하고*, *임베드 가능*해야 함
- 파싱: `JSON.parse` + Zod 스키마 검증
- 직렬화: `JSON.stringify` + stable key ordering (round-trip 결정성)

### 1.3 Projector 패턴

같은 JSON을 여러 표면이 각자의 방식으로 렌더링한다. v1엔 두 projector:

- `projector-web`: 풀 캔버스 편집기 (인터랙티브, mutable)
- `projector-embed`: 정적 읽기 전용 임베드 (애니메이션 최소)

향후 추가 가능: `projector-mobile`, `projector-print`.

### 1.4 도메인 로직과 projector의 분리

`@trama/core`는 React에 의존하지 않는다. 도메인 모델, 함수, 전파, 실행 엔진, JSON 스키마·파서·직렬화기 모두 core. Projector들은 core 결과물을 받아 그릴 뿐.

### 1.5 통합 실행 모델 — feedback edges + N-step execution

Trama의 모델 그래프는 두 종류의 엣지를 가진다:

- **일반 엣지** (lag=0): 같은 timestep 내에서 source → target으로 값을 전파. 모든 일반 엣지의 집합은 *instantaneous DAG*를 형성 (순간 그래프엔 사이클 없음).
- **Feedback 엣지** (lag=1): source의 출력이 *다음* timestep의 target으로 전달. 시간 차원에서 사이클을 형성하지만, 한 timestep 안의 계산은 여전히 DAG.

실행은 한 가지 메커니즘:

```
for t in 0 .. N-1:
  1. timestep t 시작 시점의 노드 값 결정 (initial values + 이전 timestep feedback)
  2. 일반 엣지를 따라 instantaneous forward propagation
  3. timestep t에서 feedback 엣지의 출력을 buffer에 저장 (다음 timestep에서 사용)
```

`N=1`이면 단일 정적 propagation (예전 "값 변경 모드"). `N>1`이고 feedback 엣지가 있으면 의미 있는 시간 진화 또는 확률 시뮬레이션. Feedback 엣지가 없는 모델은 `N` 값을 늘려도 결과가 같으므로 *N 컨트롤이 자동 숨겨짐*.

이 통합으로 결정론적 dynamical system(복리·인구 증가)과 확률적 process(슬롯머신)가 *같은 모델·같은 실행 메커니즘*으로 표현됨. 차이는 구조(feedback 유무)와 함수(결정/확률)의 조합.

---

## 2. 절대 *하지 않을* 것들 (Guardrails)

- AI/LLM 기반 노드·엣지 자동 제안
- 두 엣지가 체인일 때 합성 함수 자동 계산·표시
- "검증된 모델"/"신뢰도 점수" 같은 권위 표시
- Force-directed 자동 레이아웃
- 사용자 모델 간 자동 병합·추천
- 도구가 자동으로 시나리오를 비교·해석해서 사용자에게 *결론을 제시*하는 기능 (설명·해석은 사용자 몫)
- 도구가 자동으로 *감도 분석*을 수행해서 영향력 ranking을 제시 (사용자가 함수 형태로 이미 강도를 표현했음)
- 협업·실시간 편집 (v1 단일 사용자)
- 한 timestep *내부*에서의 instantaneous 사이클 (이건 항상 금지. 시간 차원 feedback은 § 1.5)
- 클라우드 동기화·로그인
- 글로벌 CSS 변수 정의 / 글로벌 Tailwind 클래스 의존

함수 라이브러리와 combiner는 *닫힌 enum이 아니라 확장 가능한 인터페이스*다 (§ 7).

---

## 3. 모노레포 구조

pnpm workspace.

```
trama/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── packages/
│   ├── core/                # 도메인 로직 + JSON serialization + 실행 엔진, React 비의존
│   │   ├── src/
│   │   │   ├── model/       # Node, Edge, Model 타입과 immutable updates
│   │   │   ├── functions/   # 함수 형태 정의·계산, 시작 팔레트 + 확장 인터페이스
│   │   │   ├── combiners/   # 결합 방식 정의, 시작 세트 + 확장 인터페이스
│   │   │   ├── execution/   # propagation + iteration 엔진
│   │   │   ├── units/       # 단위 시스템
│   │   │   ├── schema/      # Zod 스키마, parseTrama, serializeTrama
│   │   │   ├── history/     # operation log (undo/redo)
│   │   │   └── index.ts
│   │   ├── tests/
│   │   └── package.json
│   ├── tokens/              # JSON 토큰 + 빌드 산출물 (TS const + 스코프 CSS)
│   ├── ui-primitives/       # 재사용 가능한 작은 UI
│   ├── projector-web/       # 인터랙티브 편집 projector
│   │   ├── src/
│   │   │   ├── canvas/
│   │   │   ├── node/
│   │   │   ├── edge/        # 일반 / feedback 엣지 모두
│   │   │   ├── function-picker/
│   │   │   ├── execution-control/  # N-step control
│   │   │   ├── inspector/
│   │   │   ├── interactions/
│   │   │   ├── store/       # zustand
│   │   │   └── index.ts
│   │   └── package.json
│   └── projector-embed/     # 정적 읽기 전용 projector
└── apps/
    └── web/                 # 메인 앱
        ├── src/
        │   ├── routes/
        │   ├── model-list/
        │   ├── empty-state/
        │   ├── App.tsx
        │   └── main.tsx
        └── package.json
```

---

## 4. 디자인 토큰 시스템 (JSON 기반)

### 4.1 source of truth

`packages/tokens/src/tokens.json` 한 파일. **spec 자체에는 구체값을 적지 않는다.** 모든 토큰 *이름*은 spec 다른 부분에서 참조하지만, 값은 오직 tokens.json에만.

### 4.2 빌드 산출물

`packages/tokens/build.ts`가 tokens.json을 읽어 두 파일 생성:

**TS 상수** (`dist/tokens.ts`):
```typescript
export const tokens = {
  color: { canvasBg: '...', nodeFillCalm: '...', ... },
  motion: { durationBreath: '...', easingSoftSpring: '...', ... },
  physical: { thresholdNodeLow: 0.2, ... },
  ...
} as const;
```

**스코프된 CSS** (`dist/tokens.scoped.css`):
```css
[data-trama-root] {
  --color-canvas-bg: ...;
  --color-node-fill-calm: ...;
  --motion-duration-breath: ...;
  ...
}
```

스코프 선택자는 `:root`가 아니라 `[data-trama-root]`. 호스트 환경에 누출되지 않음.

### 4.3 토큰 family

**색상**: `canvas-bg`, `canvas-grid`, `node-fill-calm`, `node-stroke-calm`, `node-fill-low`, `node-stroke-low`, `node-fill-focal`, `node-stroke-focal`, `node-text-primary`, `node-text-low`, `edge-default`, `edge-feedback`, `edge-strained`, `edge-introducing`, `text-question`, `text-hint`, `affordance-hint`

**여백·크기**: `canvas-margin`, `canvas-padding`, `node-label-gap`, `node-handle-offset`, `edge-hit-tolerance`, `card-padding`, `card-gap`, `radius-node`, `radius-card`, `radius-pill`, `radius-picker`, `stroke-edge-default`, `stroke-edge-feedback`, `stroke-edge-strained`, `stroke-node-default`, `radius-node-min`, `radius-node-max`

**타이포그래피**: `text-question`, `text-node-name`, `text-node-value`, `text-node-unit`, `text-hint`, `text-picker-label`, `text-step-count`, `font-serif-question`, `font-sans-default`

**모션**: `duration-breath`, `duration-tilt-soft`, `duration-fade-in`, `duration-fade-out`, `duration-edge-draw`, `duration-pop-spring`, `duration-scrub-response`, `duration-picker-open`, `duration-shape-morph`, `duration-step-tick` (iteration 한 step 사이의 시각 반응 간격), `easing-soft-spring`, `easing-fade-natural`, `easing-snap-in`, `easing-breath-curve`

**물성 임계값**: `threshold-node-low`, `threshold-node-tired`, `threshold-node-alive`, `threshold-edge-strained-low`, `threshold-edge-strained-high`, `opacity-node-low`, `opacity-node-high`, `scale-breath-amplitude`, `angle-tilt-tired`, `dasharray-edge-strained`, `dasharray-edge-feedback`

### 4.4 Trama 내부 스타일링 규칙

- **금지**: 글로벌 Tailwind 클래스로 토큰 참조
- **금지**: `:root` 선택자에 CSS 변수 정의
- **허용**: 스코프된 CSS 변수 참조 (CSS Modules 또는 일반 CSS)
- **허용**: JS에서 `tokens.color.nodeFillCalm` 직접 참조

---

## 5. JSON 직렬화 사양

### 5.1 펜스

````markdown
```trama
<json>
```
````

펜스 라벨은 항상 소문자 `trama`. 호스트 마크다운에 다른 JSON 블록이 있을 수 있으므로 *반드시* `trama` 라벨로 자기 자신을 표시.

### 5.2 문서 구조 (`TramaDocument`)

```json
{
  "trama": "1",
  "id": "mdl-7f3a",
  "question": "왜 내 체중이 늘지?",
  "createdAt": 1731234567890,
  "updatedAt": 1731234567890,
  "execution": {
    "steps": 1,
    "stepUnit": null
  },
  "nodes": [
    {
      "id": "n-weight",
      "label": "체중",
      "unit": { "kind": "number", "suffix": "kg", "min": 40, "max": 110 },
      "initialValue": 70,
      "position": { "x": 540, "y": 170 },
      "combiner": "sum",
      "isFocal": true,
      "description": null
    }
  ],
  "edges": [
    {
      "id": "e-1",
      "from": "n-intake",
      "to": "n-weight",
      "shape": {
        "kind": "linear",
        "params": { "slope": 1, "offset": 0 }
      },
      "inverted": false,
      "lag": 0,
      "description": null
    }
  ]
}
```

핵심 필드 설명:
- `execution.steps`: iteration 횟수. 1이면 단일 propagation, >1이면 N번 반복
- `execution.stepUnit`: step의 의미 라벨 (예: `"회"`, `"년"`, `"단계"`). null이면 단위 미지정
- `initialValue` (was `value` + `defaultValue` in v3): 노드의 시작 값. t=0에서 사용. feedback 입력이 있는 노드는 t>0에서 feedback이 덮어씀
- `edges[].lag`: 0이면 일반 엣지(같은 timestep), 1이면 feedback 엣지(다음 timestep). v1은 0과 1만 지원.

### 5.3 스키마 정의 (`@trama/core/schema/document.ts`)

```typescript
import { z } from 'zod';

export const UnitSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('number'), suffix: z.string(), min: z.number(), max: z.number() }),
  z.object({ kind: z.literal('scale'), min: z.number(), max: z.number() }),
  z.object({ kind: z.literal('label'), values: z.array(z.string()) }),
  z.object({ kind: z.literal('free') }),
]);

// FunctionShape는 *open*. 시작 팔레트 키만 enum으로 검증하지만, 라이브러리 등록 시점에 확장됨.
// Zod의 z.record 또는 동적 union으로 처리. § 7 참조.

export const NodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  unit: UnitSchema,
  initialValue: z.number(),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  combiner: z.string(), // open. § 7.4
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const EdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  shape: z.object({
    kind: z.string(),
    params: z.record(z.any()), // shape별 params는 등록된 ShapeDefinition으로 후검증
  }),
  inverted: z.boolean(),
  lag: z.union([z.literal(0), z.literal(1)]),
  description: z.string().nullable().optional(),
});

export const ExecutionSchema = z.object({
  steps: z.number().int().positive(),
  stepUnit: z.string().nullable(),
});

export const TramaDocumentSchema = z.object({
  trama: z.literal('1'),
  id: z.string(),
  question: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  execution: ExecutionSchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type TramaDocument = z.infer<typeof TramaDocumentSchema>;
```

스키마 검증 *후*에 `validateAgainstRegistry(doc, shapeRegistry, combinerRegistry)`로 shape/combiner 키와 params 형태를 다시 확인.

### 5.4 파서·직렬화기 계약

- 파싱 실패 시 throw with 경로/라인
- 스키마 통과 후 등록된 shape/combiner 검증 추가
- 일반 엣지로만 구성된 instantaneous DAG의 순환 감지 시 throw
- Feedback 엣지(lag=1)는 시간 차원에 사이클을 만들 수 있으므로 *순환 검사 대상에서 제외*

**직렬화 결정성**: 같은 모델은 항상 같은 JSON 문자열. 키 순서 고정:
- 문서 최상위: `trama, id, question, createdAt, updatedAt, execution, nodes, edges`
- 노드: `id, label, unit, initialValue, position, combiner, isFocal, description`
- 엣지: `id, from, to, shape, inverted, lag, description`
- 들여쓰기 2칸, UTF-8

### 5.5 전체 예시 (슬롯머신, feedback + iteration)

````markdown
```trama
{
  "trama": "1",
  "id": "mdl-slot",
  "question": "천만원으로 슬롯머신 200번 돌리면 얼마 남을까?",
  "createdAt": 1731234567890,
  "updatedAt": 1731234567890,
  "execution": {
    "steps": 200,
    "stepUnit": "회"
  },
  "nodes": [
    {
      "id": "n-balance",
      "label": "잔액",
      "unit": { "kind": "number", "suffix": "krw", "min": 0, "max": 30000000 },
      "initialValue": 10000000,
      "position": { "x": 400, "y": 170 },
      "combiner": "sum",
      "isFocal": true
    },
    {
      "id": "n-bet",
      "label": "회당 베팅",
      "unit": { "kind": "number", "suffix": "krw", "min": 10000, "max": 1000000 },
      "initialValue": 50000,
      "position": { "x": 100, "y": 100 },
      "combiner": "sum",
      "isFocal": false
    },
    {
      "id": "n-outcome",
      "label": "회당 결과",
      "unit": { "kind": "number", "suffix": "krw", "min": -1000000, "max": 5000000 },
      "initialValue": 0,
      "position": { "x": 250, "y": 170 },
      "combiner": "sum",
      "isFocal": false
    }
  ],
  "edges": [
    {
      "id": "e-bet-outcome",
      "from": "n-bet",
      "to": "n-outcome",
      "shape": {
        "kind": "stochastic",
        "params": { "winProbability": 0.05, "winMultiplier": 5, "loseMultiplier": -1 }
      },
      "inverted": false,
      "lag": 0
    },
    {
      "id": "e-outcome-balance",
      "from": "n-outcome",
      "to": "n-balance",
      "shape": { "kind": "linear", "params": { "slope": 1, "offset": 0 } },
      "inverted": false,
      "lag": 1
    }
  ]
}
```
````

여기서 `e-outcome-balance`의 `lag: 1`이 feedback 엣지. 매 timestep마다 `n-outcome`이 stochastic하게 계산되고, 그 결과가 다음 timestep의 `n-balance`로 누적됨. 200번 반복 후 최종 잔액.

---

## 6. 도메인 모델 (`@trama/core/model`)

스키마와 거의 같지만, 도메인 측은 `Record<NodeId, Node>`로 정규화:

```typescript
export interface Model {
  schemaVersion: '1';
  id: ModelId;
  question: string | null;
  execution: { steps: number; stepUnit: string | null };
  nodes: Record<NodeId, Node>;
  edges: Record<EdgeId, Edge>;
  nodeOrder: NodeId[];
  edgeOrder: EdgeId[];
  createdAt: number;
  updatedAt: number;
}

export interface Node {
  id: NodeId;
  label: string;
  unit: Unit;
  initialValue: number;
  position: { x: number; y: number } | null;
  combiner: string; // combiner key, registered in CombinerRegistry
  isFocal: boolean;
  description?: string | null;
}

export interface Edge {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  shape: { kind: string; params: Record<string, unknown> };
  inverted: boolean;
  lag: 0 | 1;
  description?: string | null;
}
```

모든 mutation은 immutable. 실행 중 *현재 노드 값들*은 별도 `ExecutionState`에 보관 (모델과 분리).

---

## 7. 함수 형태 라이브러리 — *Open* (`@trama/core/functions`)

### 7.1 인터페이스

```typescript
export interface ShapeDefinition<P> {
  key: string;
  labels: { ko: string; en: string };
  paramsSchema: z.ZodType<P>;
  defaultParams: P;
  compute: (x: number, params: P) => number; // x: [0,1] in, [0,1] out
  isStochastic?: boolean; // 매 evaluation마다 다른 값을 반환할 수 있는지
  previewPath: (w: number, h: number, params: P) => string;
}

export class ShapeRegistry {
  register<P>(def: ShapeDefinition<P>): void;
  get(key: string): ShapeDefinition<unknown> | undefined;
  list(): ShapeDefinition<unknown>[];
}
```

핵심: ShapeRegistry는 *런타임에 확장 가능*. v1엔 core가 등록한 시작 팔레트만 있지만, 미래에 도메인 패키지가 자기 shape를 등록할 수 있어야 함. 닫힌 enum이 아님.

### 7.2 시작 팔레트 (v1에서 core가 등록)

| key | 한국어 | 영어 | 의미 |
|---|---|---|---|
| `linear` | 비례해서 | proportional | y = a·x + b |
| `inverseU` | 적정점에서 최고 | peak in the middle | 종 모양 |
| `threshold` | 어느 지점부터 | only after a point | 역치 후 선형 |
| `diminishing` | 갈수록 둔하게 | diminishing returns | sqrt/log형 |
| `accelerating` | 갈수록 가팔라지게 | accelerating | quadratic형 |
| `piecewise` | 구간별로 | piecewise | 구간별 다른 기울기 |
| `stochastic` | 확률로 | stochastic | 확률 기반 샘플링 |

`piecewise`의 params: 구간 정의 배열. picker UX가 다른 함수와 *다른 동선*을 가짐 — § 10.5.

`stochastic`의 params: distribution 정의 + 파라미터(`winProbability`, `winMultiplier`, `loseMultiplier` 등). `isStochastic: true`. 매 evaluation마다 새 샘플.

### 7.3 추가 shape 등록

v1 이후 도메인 패키지가 자기 shape 등록 가능:

```typescript
// @some-domain/trama-shapes/src/index.ts
shapeRegistry.register({
  key: 'inversePower',
  labels: { ko: '거듭제곱 반비례', en: 'inverse power' },
  paramsSchema: z.object({ power: z.number() }),
  defaultParams: { power: 2 },
  compute: (x, { power }) => x === 0 ? 1 : 1 / Math.pow(x * 10, power),
  previewPath: ...,
});
```

### 7.4 Combiner도 동일하게 *Open*

```typescript
export interface CombinerDefinition {
  key: string;
  labels: { ko: string; en: string };
  combine: (contributions: number[]) => number;
}

export class CombinerRegistry {
  register(def: CombinerDefinition): void;
  get(key: string): CombinerDefinition | undefined;
}
```

시작 세트: `sum`, `average`, `max`, `product`. (지난 부동산 점검에서 `product` 필요성 확인됨.)

---

## 8. 실행 엔진 (`@trama/core/execution`)

### 8.1 단일 timestep propagation

명시 엣지만 따라가는 전방 전파. 합성 자동 추론 없음.

```typescript
export function propagateOneStep(
  state: ExecutionState,
  model: Model
): ExecutionState;
```

알고리즘:
1. 일반 엣지(lag=0)만으로 구성된 그래프의 topological order 계산 (모델 로드 시 1회, 캐싱)
2. 위상 순서로 각 노드의 값 갱신:
   - 들어오는 모든 lag=0 엣지의 출력 계산 (`scaleToTarget(shape.compute(normalize(source.value)))`)
   - combiner로 결합, unit 범위로 클램프
3. 입력만 있는(들어오는 lag=0 엣지가 없는) 노드는 state의 현재 값을 유지
4. 일반 엣지로만 본 그래프에서 순환 감지 시 `throw new InstantaneousCycleError(path)`

### 8.2 N-step iteration

```typescript
export function executeModel(
  model: Model,
  options?: { onStep?: (state: ExecutionState, step: number) => void }
): ExecutionState[];
```

알고리즘:
```
const N = model.execution.steps;
let state = initializeFromInitialValues(model);
const trajectory = [state];

for (let t = 0; t < N; t++) {
  // 1. Instantaneous propagation 
  state = propagateOneStep(state, model);
  
  // 2. Feedback edges: t의 출력 → t+1의 대상
  if (t < N - 1) {
    state = applyFeedbackEdges(state, model);
  }
  
  trajectory.push(state);
  options?.onStep?.(state, t);
}

return trajectory;
```

`applyFeedbackEdges`는 lag=1 엣지를 따라 source의 현재 값을 target에 적용. Combiner는 노드 정의에 따름.

### 8.3 결과 형태

- `steps=1`: 단일 ExecutionState (배열 길이 1). 사용자가 값을 스크럽하며 실시간 갱신.
- `steps>1`, 결정적 모델: trajectory (시간에 따른 값 배열). 시각화는 노드 안의 미니 차트.
- `steps>1`, stochastic 포함: 매 실행마다 다른 trajectory. 사용자가 "다시 실행" 버튼으로 재실행 가능. v1엔 단일 simulation만 — 분포 시각화(다중 simulation 집계)는 향후.

---

## 9. Projector 패턴

(v3와 동일)

### 9.1 `@trama/projector-web` — 인터랙티브 편집기

```typescript
export function TramaEditor(props: {
  initialJson: string;
  onChange: (newJson: string) => void;
  options?: EditorOptions;
}): ReactElement;
```

루트 엘리먼트에 `data-trama-root` 속성 부여 (스코프 CSS 적용 기준).

### 9.2 `@trama/projector-embed` — 정적 읽기 전용

```typescript
export function TramaEmbed(props: {
  json: string;
  height?: number;
  showQuestion?: boolean;
}): ReactElement;
```

마찬가지로 `data-trama-root`. 정적 렌더링에서 iteration 결과는 *기본값으로 1 step 시뮬레이션 후의 상태*만 표시. 인터랙션 없음.

---

## 10. 캔버스와 인터랙션 (projector-web)

### 10.1 노드 추가
- 빈 영역 더블 클릭 → 새 노드, 즉시 이름 입력
- 기존 노드 옆 *빈 자리 affordance* 클릭 → 새 노드 + 자동 일반 엣지

### 10.2 엣지 생성 — 일반 / Feedback 구분

엣지 생성은 두 방식:

- **일반 엣지** (lag=0): 노드 외곽 핸들에서 단순 드래그 → 다른 노드. 기본.
- **Feedback 엣지** (lag=1): 같은 드래그 동작에 *수식자 키*(예: Alt) 또는 *드래그 후 핸드 표시되는 토글*로 lag 지정. 생성 직후 시각적으로 즉시 다른 모양(§ 11.6).

생성 직후 함수 picker 자동 표시. 미선택 닫기 시 기본 `linear`.

### 10.3 값 스크럽
- 노드 본체 좌우 드래그 → `initialValue` 변경
- 드래그 중 60fps: SVG attribute를 ref로 직접 조작, 드롭 시 zustand 커밋
- 변경 즉시 *현재 실행 상태* 재계산 (`steps=1`이면 단일 propagation, `steps>1`이면 전체 trajectory 재계산)
- 드롭 시 하나의 undo 단위

### 10.4 엣지에 노드 끼워넣기 (일급 제스처)

**가장 중요한 단일 인터랙션.**

- 엣지 path 호버 → 중간점에 *끼우기 affordance* (작은 +)
- 클릭 → 원래 엣지 분리, 새 노드 등장 (이름 입력 모드)
- 두 새 엣지는 *원래 엣지와 같은 lag 유지* (feedback이었으면 둘 다 feedback)
- 애니메이션: 원래 엣지가 *벌어지며* 새 노드 등장
- Path hit detection: bezier-포인터 거리 계산. 임계 `edge-hit-tolerance`

### 10.5 함수 형태 변경

- 엣지 클릭 → 함수 라이브러리 팝오버. *등록된 모든 shape*가 카드로 표시.
- 카드 선택 → 즉시 적용 → 즉시 재실행 → 결과 갱신
- 키보드 단축키 (등록된 shape 수에 맞춰 동적으로)
- **`piecewise`는 다른 동선**: 카드 클릭 후 인라인 *구간 정의 에디터* 등장. 구간 추가/삭제, 각 구간의 기울기·offset 입력. 다른 shape는 picker 닫힘으로 끝.
- **`stochastic`도 별도 동선**: 분포 종류 선택(베르누이/정규/...) + 파라미터 입력 에디터.

### 10.6 실행 컨트롤 (N-step)

- 모델에 feedback 엣지가 *있을 때만* 컨트롤이 표시됨
- 위치: 캔버스 하단 또는 우측 패널
- 표시: `N` 수치 입력 + `stepUnit` 라벨 입력 (예: "200 회", "10 년")
- "다시 실행" 버튼 (stochastic 모델 재실행용)
- 실행 중 시각 표시: 각 step의 진행을 노드 값 변화로 *애니메이션*. `duration-step-tick` 간격으로 빠르게 흐름.

### 10.7 Undo/Redo
- Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z
- operation log. 단위: 노드 CRUD, 엣지 CRUD (lag 변경 포함), 값 스크럽 1회, 함수·combiner 변경, 이름 변경, 위치 이동, execution 변경

### 10.8 노드·엣지 삭제
- Delete/Backspace
- 노드 삭제 시 연결된 모든 엣지(일반 + feedback) 동시 삭제
- 모두 undo로 복원

---

## 11. 물성 시각화 명세

### 11.1 노드 본체 (정규화 값 v ∈ [0, 1])

- 크기: `radius-node-min` ~ `radius-node-max` 보간
- 투명도: `opacity-node-low` ~ `opacity-node-high` 보간
- 색상:
  - v < `threshold-node-low`: low 톤
  - 그 외: calm 톤
- focal 노드: 항상 focal 톤
- 전환: `duration-scrub-response`, `easing-fade-natural`

### 11.2 노드 상태 애니메이션 (상호 배타)

- **호흡** (v > `threshold-node-alive`): scale 사인파. 주기 `duration-breath`, 곡선 `easing-breath-curve`, 진폭 `scale-breath-amplitude`
- **기울임** (v < `threshold-node-tired`): rotate + translate 미세 진동
- 중간 영역은 정적

### 11.3 일반 엣지 시각

- 기본: stroke `edge-default`, width `stroke-edge-default`
- 입력 노드 극단: stroke가 `edge-strained`로 이동, dasharray 점선화, bezier 곡률 미세 증가

### 11.4 Feedback 엣지 시각

일반 엣지와 *분명히 다른 시각*:
- stroke 색: `edge-feedback` (별도 톤)
- stroke pattern: `dasharray-edge-feedback` (예: 두 번 점, 한 번 끊김 같은 시간성 표현)
- 화살표 끝에 작은 *t+1* 라벨 또는 *순환* 모양 마커
- bezier 곡률을 더 둥글게 — *시간을 건너뛴다*는 시각적 메타포

### 11.5 새 엣지 등장
- stroke-dashoffset 그려지듯 등장. `duration-edge-draw`, `easing-snap-in`

### 11.6 함수 변경 시각 신호
- 엣지 옆 미니 곡선 모핑 (`duration-shape-morph`)
- 엣지 미세 깜빡임 (opacity 0.95 → 1.0)

### 11.7 Iteration 중 시각 흐름

`steps>1` 실행이 진행되는 동안:
- 각 step의 노드 값 변화가 `duration-step-tick` 간격으로 빠르게 흐름
- focal 노드 옆 또는 안에 *현재 step / 전체 N* 표시
- trajectory를 visualize 할 때 노드 안에 *작은 시간축 차트*가 페이드 인 (옵션)

### 11.8 노드 등장·소멸
- 등장: opacity 0→1 + scale 0.3→1
- 소멸: opacity 1→0 + scale 1→0.5

---

## 12. 첫 화면 UX (Empty State)

**빈 캔버스 금지.**

1. 화면 중앙 입력 박스: *"무엇을 생각해보고 싶나요?"*
   - placeholder: *"예: 왜 내 체중이 늘지? / 이 기능을 출시하면 사용자가 어떻게 반응할까? / 가격을 5% 올리면 매출이 어떻게 될까?"*
2. 사용자 입력 + 엔터
3. 입력이 상단으로 옮겨가며 `font-serif-question` 표시
4. 화면 중앙에 첫 노드 등장 (이름은 입력 문장의 주어, 인라인 편집 가능)
5. 노드 주변 4방향 *빈 자리 affordance* 페이드 인

placeholder 예시는 *예측적·근사적* 사례 위주 — 수식·확률 시뮬레이션 같은 결을 미리 신호하지 않도록 톤 조절.

---

## 13. 저장과 내보내기

- localStorage key: `trama:model:<modelId>` → TramaDocument JSON 문자열
- localStorage key: `trama:models:index` → 메타데이터 배열
- 자동 저장: 변경 후 1.5초 디바운스
- 라우팅: `/`, `/m/<modelId>`, `/new`
- Export: `<question-slug>-<date>.trama.md` (마크다운 + `trama` 펜스)
- Import: 첫 ` ```trama ` 펜스 추출 → JSON.parse → 스키마 검증 → 새 ID로 저장

---

## 14. 단계별 작업 순서

1. 모노레포 셋업 + tsconfig + 린트
2. `@trama/tokens` — tokens.json + 빌드 스크립트
3. `@trama/core/model` + `units` (도메인 타입)
4. `@trama/core/functions` + `combiners` — *registry 패턴*으로 구현, 시작 팔레트 등록. **확장 인터페이스가 작동함을 vitest로 검증**
5. `@trama/core/execution` — propagateOneStep + executeModel. instantaneous DAG 순환 감지. feedback 엣지 적용. **다양한 모델 케이스로 vitest 검증** (단일 step, 결정적 iteration, stochastic iteration)
6. `@trama/core/schema` — Zod 스키마, parseTrama, serializeTrama. **round-trip 테스트 통과까지 다음 단계로 안 감**
7. `@trama/core/history` — operation log
8. `@trama/projector-web` 셋업 + zustand 슬라이스
9. 캔버스 + 단일 노드 + 값 스크럽 + 물성 반응 (steps=1)
10. 노드 추가, 일반 엣지 생성, 함수 picker (기본 shape)
11. 엣지에 노드 끼워넣기 제스처
12. Feedback 엣지 생성·시각 표현
13. 실행 컨트롤(N-step), iteration 시각 흐름
14. `piecewise` picker UX (구간 정의 에디터)
15. `stochastic` picker UX (분포 파라미터 에디터)
16. Undo/Redo
17. `@trama/web` — 라우팅, 모델 목록, empty state, import/export
18. `@trama/projector-embed` — 정적 렌더링
19. 엣지 텐션·등장 애니메이션 등 시각 디테일 — *가장 길고 가장 중요*

19번 단계가 다른 노드 그래프 도구와 Trama를 구분짓는 유일한 자산을 빚는 단계.

---

## 15. 테스트 전략

- **`@trama/core/functions` + `combiners`**: registry 등록·조회, 시작 팔레트의 수학적 속성 검증
- **`@trama/core/execution`**:
  - 단일 step propagation
  - 일반 엣지로만 된 DAG의 순환 감지 throw
  - Feedback 엣지가 있는 모델의 N-step trajectory
  - Stochastic 함수의 재현성 (seed 주입 가능)
  - 다양한 combiner 결합 결과
- **`@trama/core/schema`**: round-trip 테스트, 잘못된 펜스/shape/lag 등 에러 케이스
- **UI**: v1엔 수동 검증 우선

---

## 16. 코드 스타일

- TypeScript strict, no any
- 함수형 우선, immutable updates, no class (registry는 예외 — 명시적 mutation 의도)
- 모든 컴포넌트 명시적 props 인터페이스
- **하드코딩 절대 금지**: 색·크기·시간·곡선·임계값 모두 토큰 참조
- 매직 넘버 금지: `if (v > 0.7)`이 아니라 `if (v > tokens.physical.thresholdNodeAlive)`
- 함수·combiner는 *registry 패턴*. 코드 어디서도 키를 닫힌 enum으로 박지 않기
- JSON 파서·직렬화기는 Zod 외 의존성 없이 직접

---

## 17. 네이밍 컨벤션

- 패키지: `@trama/core`, `@trama/tokens`, `@trama/ui-primitives`, `@trama/projector-web`, `@trama/projector-embed`, `@trama/web`
- 컴포넌트: `<TramaEditor>`, `<TramaEmbed>`, `<Canvas>`, `<NodeView>`, `<EdgeView>`, `<FunctionPicker>`, `<ExecutionControl>`, `<EmptyStatePrompt>`, `<ModelCard>`, `<InsertNodeAffordance>`
- 훅: `useModelStore`, `useUIStore`, `useScrub`, `useInsertNode`, `useFunctionPicker`, `useEdgeHitTest`, `useExecutionStep`
- 스키마: `parseTrama`, `serializeTrama`, `TramaDocument`, `TramaDocumentSchema`
- 실행: `propagateOneStep`, `executeModel`, `ExecutionState`
- Registry: `ShapeRegistry`, `CombinerRegistry`
- 파일·폴더: kebab-case
- 타입: PascalCase
- 변수·함수: camelCase
- **루트 엘리먼트 속성**: 모든 projector의 최상위 엘리먼트는 `data-trama-root` 속성을 가짐
