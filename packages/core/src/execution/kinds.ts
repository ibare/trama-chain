import type { CombinerRegistry } from '../combiners/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import type { Edge, Model, Node, NodeId, Value, ValueKind } from '../model/index.js';
import { booleanValue, isValueNode, isNumericValue, numericValue } from '../model/index.js';
import type {
  GeneratorRegistry,
  GeneratorRuntime,
  OutputInterpolation,
} from '../generators/index.js';
import { defaultGeneratorRegistry } from '../generators/index.js';
import {
  clamp01,
  clampToUnit,
  denormalize,
  normalize,
  resolveUnit,
  type ResolvedUnit,
  type UnitCatalog,
} from '../units/index.js';
import { MissingCombinerError, MissingShapeError } from './errors.js';
import type { EvalDiagnosis, ExpressionEvaluator } from './expression-evaluator.js';
import {
  asBooleanGate,
  isSequence,
  resolveScalar,
  unwrap,
  wrap,
  type ExecValue,
  type SequenceSample,
  type SequenceValue,
} from './exec-value.js';
import {
  createObserveBuffer,
  observeBufferToArray,
  pushSample,
  type ObserveBuffer,
} from './observe-buffer.js';

/**
 * ObserveNode 의 누적 추출 슬롯 런타임 상태. throttle 정책의 마지막 emit 시각을
 * 박제해 다음 propagate 가 발사 여부를 결정한다. realtime 모드에서는 사실상
 * 사용되지 않지만 일관된 형태로 유지.
 *
 * `state.ts` 의 ExecutionState 가 이 타입을 참조하지만, kinds.ts → state.ts 의
 * 단방향 import 를 유지하기 위해 이 자리에 정의.
 */
export interface ObserveExtractionRuntime {
  lastEmitTimeMs: number;
}
import { outputKey } from './state.js';

/**
 * propagate 컨텍스트에서 source 노드의 현재 numeric value를 꺼낸다.
 * - ctx.next에 기록돼 있으면 그것 (Value sum type 중 numeric만 인정).
 * - WrappedValue 면 알맹이 Value 로 unwrap 후 검사.
 * - 없으면 ValueNode의 initialValue에서 폴백.
 * - boolean Value거나 미기록이면 undefined — caller가 skip해야 한다.
 */
function getNumericNext(ctx: PropagateContext, id: NodeId): number | undefined {
  const ev = ctx.next[id];
  if (ev) {
    if (isSequence(ev)) return undefined;
    const v = unwrap(resolveScalar(ev, ctx.simulationTimeMs));
    if (v.kind === 'numeric') return v.n;
    return undefined;
  }
  const source = ctx.model.nodes[id];
  if (source && isValueNode(source) && isNumericValue(source.initialValue)) {
    return source.initialValue.n;
  }
  return undefined;
}

/**
 * boolean Value 버전. boolean ValueNode propagate가 사용.
 * WrappedValue 면 알맹이 Value 로 unwrap 후 분기. FunctionHandle은 ctx 시각의
 * peek로 환원 후 동일 분기.
 * source가 numeric이면 undefined — PortType 검사가 막아야 하지만 안전망.
 */
function getBooleanNext(ctx: PropagateContext, id: NodeId): boolean | undefined {
  const ev = ctx.next[id];
  if (ev) {
    if (isSequence(ev)) return undefined;
    const v = unwrap(resolveScalar(ev, ctx.simulationTimeMs));
    if (v.kind === 'boolean') return v.b;
    return undefined;
  }
  const source = ctx.model.nodes[id];
  if (source && isValueNode(source) && source.initialValue.kind === 'boolean') {
    return source.initialValue.b;
  }
  return undefined;
}

/**
 * 단위가 명시되지 않은 raw 출력 노드(상수·조건 게이트·식)의 폴백.
 * 값은 raw로 흐르고, 시각화 단계에서 자동 단위 추론이 동작한다.
 */
export const FREE_FALLBACK: ResolvedUnit = {
  id: 'free',
  kind: 'free',
  suffix: '',
  labels: [],
  min: 0,
  max: 1,
  step: 0.01,
};

/**
 * 엣지의 shape이 사실상 항등 변환인지 판정. 두 경우:
 *  - kind='none'                : 사용자가 변환을 선택하지 않은 상태
 *  - kind='linear', slope=1, offset=0 : explicit identity linear
 *
 * identity 엣지는 raw passthrough로 다루고 정규화·역정규화·클램프를 건너뛴다.
 * "shape을 적용하지 않으면 raw"라는 의미 모델의 단일 진입점.
 */
export function isIdentityShape(edge: Edge): boolean {
  if (edge.shape.kind === 'none') return true;
  if (edge.shape.kind !== 'linear') return false;
  const p = edge.shape.params as { slope?: unknown; offset?: unknown };
  return p.slope === 1 && p.offset === 0;
}

/**
 * 한 노드의 lag=0 전파 단계에서 디스크립터가 사용하는 컨텍스트.
 * next/validOutputs는 의도적으로 가변(mutate) — 한 step 내에서 디스크립터가
 * 직접 갱신해 다음 노드로 흘러간다.
 */
export interface PropagateContext {
  model: Model;
  incoming: ReadonlyArray<Edge>;
  /**
   * 노드별 출력값(작업 버퍼). 타입은 [[ExecValue]] — Value 또는 WrappedValue.
   * 디스크립터가 알맹이만 보고 싶다면 `unwrap(ctx.next[id])` 또는 헬퍼
   * `getNumericNext`/`getBooleanNext`/`getAnyNext` 를 통해 자동 unwrap 된 값을 사용.
   * 메타까지 보고 분기하는 디스크립터(예: Generator gate)는 raw 그대로 읽는다.
   */
  next: Record<NodeId, ExecValue>;
  validOutputs: Set<string>;
  /**
   * "토폴로지 정상, 첫 신호 미도착" 슬롯 집합. ValueNode 처럼 incoming 엣지가
   * 있어 stored state(initialValue) 권위를 잃은 노드가 아직 어떤 펄스도
   * 받지 못한 상태를 표시한다. 디스크립터가 성공적으로 갱신하면 키를
   * 삭제한다. valid 와 상호 배타.
   */
  pendingOutputs: Set<string>;
  /**
   * 노드별 마지막 실패 사유 (UI invalid 배지/툴팁 노출용).
   * 디스크립터가 평가에 실패하면 여기에 기록하고, 성공하면 키를 삭제한다.
   */
  invalidReasons: Record<NodeId, EvalDiagnosis & { ok: false }>;
  catalog: UnitCatalog;
  shapeRegistry: ShapeRegistry;
  combinerRegistry: CombinerRegistry;
  nodeKindRegistry: NodeKindRegistry;
  expressionEvaluator: ExpressionEvaluator;
  rng: Rng;
  /**
   * ObserveNode 가 통과한 값을 시간순으로 누적해 두는 sample 버퍼.
   * 각 sample 은 (value, t) — t 는 누적 당시 simulation time(ms).
   * 디스크립터가 mutate하며, propagateOneStep 이 결과를 ExecutionState 로 회수한다.
   * runtime-only — 직렬화되지 않는다.
   */
  observeBuffers: Record<NodeId, ObserveBuffer>;
  /**
   * ObserveNode 추출 슬롯 throttle 런타임. 마지막 emit 시각(simulation time)을
   * 박제해 다음 propagate 가 발사 여부를 결정. runtime-only.
   */
  observeExtractionRuntime: Record<NodeId, ObserveExtractionRuntime>;
  /**
   * GeneratorNode의 cursor·gate 캐시. propagate가 emit할 때 mutate한다.
   * runtime-only — 직렬화되지 않는다.
   */
  generatorRuntime: Record<NodeId, GeneratorRuntime>;
  /** 등록된 패러다임 모음. emit 라우팅에 사용. */
  generatorRegistry: GeneratorRegistry;
  /**
   * Sequence 채널 출력 작업 버퍼. 키: outputKey(nodeId, slot). 누적 추출 등
   * sequence PortSpec slot 의 SequenceValue 스냅샷을 디스크립터가 여기 기록한다.
   * 스칼라 [[next]] 와 분리된 채널.
   */
  sequenceNext: Record<string, SequenceValue>;
  /** 현재 simulation time(ms). 이 step 내 누적·emit 시각의 기준. */
  simulationTimeMs: number;
  /**
   * 이번 step 의 시뮬레이션 시간 증분(ms). 시간 적분이 필요한 노드(Stock 등)가
   * `dt = stepIntervalMs / 1000` 로 환산해 사용. 0 이면 시간이 흐르지 않은 step
   * (수동 recompute·노드 편집 후 재계산 등) — 시간 적분 노드는 이번 step 에서
   * 적분하지 않고 직전 상태를 보존한다.
   */
  stepIntervalMs: number;
  /**
   * 멈춤 상태. true 면 ValueNode 처럼 펄스 도착으로만 갱신되는 노드는 이번
   * 단계에서 source 변화를 흡수하지 않는다 — pending 이면 pending 유지, valid
   * 였다면 마지막 수신값 유지. 시간이 흐르는 step(!paused)에서만 contribute
   * 결합·갱신이 일어난다.
   */
  paused: boolean;
}

/**
 * PortType 해석에 필요한 컨텍스트. ObserveNode처럼 입력 엣지의 source PortType을
 * 따라가는 passthrough 노드만 사용한다. 다른 노드는 인자를 무시.
 *
 * 정적 시점(메뉴 후보 계산 등)에서는 ctx 없이 호출될 수 있어 optional —
 * ctx가 없으면 디스크립터는 정적 폴백을 반환한다.
 */
export interface PortTypeContext {
  model: Model;
  registry: NodeKindRegistry;
}

/**
 * scalar 채널 포트 spec — 한 스텝당 단일 값(+optional 메타) 이 흐른다.
 * `value` 는 알맹이 Value 의 kind, `meta` 는 WrappedValue 의 메타 kind
 * (미정의면 메타 없음). 기본 종류이므로 `kind` 는 생략 가능.
 */
export interface ScalarPortSpec {
  kind?: 'scalar';
  value: ValueKind;
  meta?: ValueKind;
  /** UI/디버깅용 라벨. 없으면 인덱스·value 로 자동 표기. */
  label?: string;
}

/**
 * sequence 채널 포트 spec — 누적된 (value, t) sample 시퀀스가 흐른다.
 * 누적 추출 슬롯(ObserveNode 상단 우측 등) 의 출력 / 통계 노드(AverageNode 등)
 * 의 입력에 쓰인다. scalar 와는 호환되지 않는다(자동 변환 없음 — 명시적 변환 노드 필요).
 */
export interface SequencePortSpec {
  kind: 'sequence';
  /** sample element 의 value kind. 누적원 본체 PortSpec.value 를 따른다. */
  element: ValueKind;
  label?: string;
}

/**
 * 한 포트(입력/출력 슬롯)의 타입 명세. scalar 채널과 sequence 채널의 합집합.
 *
 * 입력 포트는 acceptsList 로 여러 PortSpec 을 OR 매칭.
 * 출력 포트(`OutputSlotSpec`) 는 슬롯당 항상 단일 spec.
 */
export type PortSpec = ScalarPortSpec | SequencePortSpec;

/** scalar/sequence 분기 가드. C4 Sum Type Routing 의 단일 진입점. */
export function isSequencePortSpec(spec: PortSpec): spec is SequencePortSpec {
  return spec.kind === 'sequence';
}

/** 한 출력 슬롯의 명세. 디스크립터는 0..n-1 순서로 반환. */
export type OutputSlotSpec = PortSpec & { index: number };

/**
 * 노드 종류별 동작을 한 곳에 모은 디스크립터.
 * 새 노드 종류 추가 시 디스크립터를 작성·등록하면 전파·초기화·피드백·단위
 * 해석이 모두 라우팅된다.
 */
export interface NodeKindDescriptor<N extends Node = Node> {
  kind: N['kind'];
  /** 초기 state.values에 기록할 Value. undefined면 미기록(propagate 단계에서 채움). */
  initialValue(node: N): Value | undefined;
  /**
   * 초기 validOutputs 에 포함시킬 슬롯 인덱스들. 단출력 노드의 즉시 valid 케이스는
   * `[0]`, 모든 슬롯 invalid 출발이면 `[]`. ConditionNode 처럼 슬롯별로 결정되는
   * 케이스를 일급화하기 위한 자리.
   */
  initialValidSlots(node: N): readonly number[];
  /** 이 노드의 출력 단위. raw 통과(outputsRaw=true)여도 시각화·클램프 폴백용으로 의미가 있다. */
  outputUnit(node: N, catalog: UnitCatalog): ResolvedUnit;
  /**
   * 이 노드가 받을 수 있는 입력 포트 명세 리스트. null 이면 입력을 받지 않는다
   * (예: Constant). 빈 배열은 의도된 "입력 슬롯은 있으나 어떤 spec 도 매칭 못함" —
   * 정상적으론 발생하지 않게 한다.
   *
   * 리스트의 모든 spec 은 OR 매칭 — source 의 출력 PortSpec 이 그 중 하나와
   * value(+meta) 가 일치하면 호환. Generator 같은 메타 인식 입력이 "boolean OR
   * numeric(meta:boolean)" 두 spec 을 동시에 advertise 하는 자리.
   *
   * passthrough 노드(ObserveNode)는 입력 엣지의 source spec 을 따라가야 하므로
   * optional ctx 로 모델·레지스트리를 받는다.
   */
  inputAccepts(node: N, ctx?: PortTypeContext): readonly PortSpec[] | null;
  /**
   * 이 노드의 출력 슬롯 명세. 인덱스 0..n-1 순서. 단출력 노드는 길이 1.
   * Condition 처럼 다출력은 [true 슬롯, false 슬롯] 형태로 P4 에서 정의된다.
   *
   * passthrough 노드는 입력 엣지의 source spec 을 따라가므로 ctx 가 필요하다.
   */
  outputSlots(node: N, ctx?: PortTypeContext): readonly OutputSlotSpec[];
  /**
   * 입력 PortType이 비결정적(passthrough 노드 + 입력 미연결 등)일 때 어떤 source든
   * 받아주겠다는 신호. ObserveNode가 입력 엣지가 없을 때 true를 반환해
   * 첫 연결을 자유롭게 허용한다. 일단 연결되면 false로 떨어져 inputAccepts 가
   * 잠긴 PortType을 반환한다. 미정의면 false 취급.
   */
  acceptsAnyInput?(node: N, ctx?: PortTypeContext): boolean;
  /**
   * 이 노드를 source로 두는 엣지가 raw passthrough인지.
   * true면 ValueNode 타깃의 normalize/shape/denormalize 파이프라인이 우회되고
   * 타깃의 단위 클램프도 건너뛴다 (예: 함수 결과 1760이 cm[0..250]에 짓이겨지지 않게).
   */
  outputsRaw: boolean;
  /** lag=1 feedback 엣지의 target이 될 수 있는지. */
  canBeFeedbackTarget: boolean;
  /**
   * 이 노드 출력의 시간 분포 본질 — 시각화 측에서 두 emit 사이를 lerp할지
   * 결정한다. 미정의면 'continuous' 취급(기존 노드의 안전한 기본).
   *
   * - 'continuous': 매끄러운 변화 — 시각화가 wallTime 비율로 lerp 가능.
   * - 'discrete': 이산 이벤트(step·pulse·schedule 등). 보간하면 sharp 전환이
   *   부드러워져 의도가 왜곡되므로 즉시 전환이어야 한다.
   *
   * 모델·실행 계층은 이 플래그를 read-only로 노출만 한다. 보간 정책은 시각 계층 책임.
   */
  outputInterpolation?(node: N): OutputInterpolation;
  /**
   * lag=0 전파. incoming을 보고 next[node.id]·validOutputs를 갱신.
   * incoming이 비어 있고 디스크립터가 외부 입력이 없는 종류면 기존 값을 유지하는 것이 일반적.
   */
  propagate(node: N, ctx: PropagateContext): void;
}

class NodeKindRegistryImpl {
  private readonly map = new Map<string, NodeKindDescriptor<Node>>();

  register<N extends Node>(desc: NodeKindDescriptor<N>): this {
    this.map.set(desc.kind, desc as unknown as NodeKindDescriptor<Node>);
    return this;
  }

  get(kind: Node['kind']): NodeKindDescriptor<Node> | undefined {
    return this.map.get(kind);
  }

  forNode(node: Node): NodeKindDescriptor<Node> | undefined {
    return this.map.get(node.kind);
  }

  kinds(): string[] {
    return Array.from(this.map.keys());
  }
}

export type NodeKindRegistry = NodeKindRegistryImpl;

export function createNodeKindRegistry(): NodeKindRegistry {
  return new NodeKindRegistryImpl();
}

/** edge의 source가 가리키는 출력 슬롯이 현재 valid한지. */
function isEdgeSourceValid(ctx: PropagateContext, edge: Edge): boolean {
  const slot = edge.sourceSlotIndex ?? 0;
  return ctx.validOutputs.has(outputKey(edge.from, slot));
}

// ---------------------------------------------------------------------------
// Built-in descriptors
// ---------------------------------------------------------------------------

const valueNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'value' }>> = {
  kind: 'value',
  outputsRaw: false,
  canBeFeedbackTarget: true,
  initialValue: (node) => node.initialValue,
  initialValidSlots: () => [0],
  // ValueNode의 PortType은 initialValue의 kind 그대로 — boolean ValueNode가
  // 추가되어도 동일 디스크립터에서 분기된다.
  inputAccepts: (node) => [{ value: node.initialValue.kind }],
  outputSlots: (node) => [{ index: 0, value: node.initialValue.kind }],
  outputUnit: (node, catalog) => {
    // 단위는 numeric Value 안에 종속 — boolean ValueNode는 단위 없음.
    if (!isNumericValue(node.initialValue)) return FREE_FALLBACK;
    const def = catalog.get(node.initialValue.unitId);
    if (!def) return FREE_FALLBACK;
    return resolveUnit(def, node.unitOverride);
  },
  propagate: (node, ctx) => {
    const incoming = ctx.incoming;
    if (incoming.length === 0) return; // 입력 없음: initialValue 권위 유지 (init이 valid로 세팅)

    // 멈춤 상태에서는 source 변화를 즉시 흡수하지 않는다 — 펄스 도착으로만 갱신.
    // 직전 상태가 pending 이면 pending 유지, valid(마지막 수신값) 였다면 그대로 유지.
    if (ctx.paused) return;

    // ValueKind별 propagate 분기 — 같은 'value' 디스크립터 안에서 numeric/boolean을
    // 각자의 경로로 다룬다. 노드 종류를 둘로 쪼개지 않는 이유는 모델·UI·serialize가
    // 동일한 ValueNode 구조를 공유하고 initialValue.kind 하나로 분기 가능하기 때문.
    if (node.initialValue.kind === 'boolean') {
      propagateBooleanValueNode(node, ctx);
      return;
    }

    // numeric ValueNode는 numeric combiner만 받는다. 키가 없거나 ValueKind가
    // 맞지 않으면 동일한 에러로 떨어뜨려 등록 누락과 잘못된 매칭을 한 자리에서 잡는다.
    const combiner = ctx.combinerRegistry.getOfKind(node.combiner, 'numeric');
    if (!combiner) throw new MissingCombinerError(node.combiner);

    const targetUnit = ctx.nodeKindRegistry.forNode(node)?.outputUnit(node, ctx.catalog) ?? FREE_FALLBACK;

    // 의미 모델: source 종류와 무관하게 엣지의 shape이 *비-identity*면 적용한다.
    // - raw-output source(Function/Constant/Condition) + identity shape → raw passthrough (단위 없음).
    // - raw-output source + 비-identity shape → 정규화 폴백으로 shape 적용 (FREE 단위는 [0,1] 클램프).
    // - value source는 항상 normalize→shape→denormalize 파이프라인 (단위 변환·inverted 의미 보존).
    let hasRawPassthrough = false;
    const contributions: number[] = [];
    for (const edge of incoming) {
      const source = ctx.model.nodes[edge.from];
      if (!source) continue;
      if (!isEdgeSourceValid(ctx, edge)) continue;
      const sourceValue = getNumericNext(ctx, edge.from);
      // boolean source 또는 미기록은 numeric ValueNode에 기여하지 않음.
      // (PortType 검사는 3단계에서 도입되어 이런 연결을 차단한다.)
      if (sourceValue === undefined) continue;
      const sourceDesc = ctx.nodeKindRegistry.forNode(source);

      // raw-output source + identity shape: 단위 정보가 없으니 값 그대로 흘림.
      if (sourceDesc?.outputsRaw && isIdentityShape(edge)) {
        hasRawPassthrough = true;
        contributions.push(sourceValue);
        continue;
      }

      const sourceUnit = sourceDesc?.outputUnit(source, ctx.catalog) ?? FREE_FALLBACK;
      const normalizedIn = normalize(sourceValue, sourceUnit);
      const shape = ctx.shapeRegistry.get(edge.shape.kind);
      if (!shape) throw new MissingShapeError(edge.shape.kind);
      const parsed = shape.paramsSchema.safeParse(edge.shape.params);
      const params = parsed.success ? parsed.data : shape.defaultParams;
      let out01 = shape.compute(normalizedIn, params, { rng: ctx.rng });
      if (edge.inverted) out01 = clamp01(1 - out01);
      contributions.push(denormalize(out01, targetUnit));
    }

    if (contributions.length === 0) {
      // 엣지는 있는데 valid한 source가 하나도 없는 경우 — 출력을 invalid로 떨어뜨려
      // stale 값이 다운스트림으로 흐르지 않게 한다. (조건 게이트가 닫힌 직후 등)
      // ctx.next[node.id]는 건드리지 않아 UI가 "마지막 값"을 흐리게 보여줄 수 있다.
      ctx.validOutputs.delete(outputKey(node.id, 0));
      return;
    }
    const combined = combiner.combine(contributions);
    // raw passthrough가 섞이면 target clamp 건너뜀(단위 미정의 의미 보존).
    const finalNumber = hasRawPassthrough ? combined : clampToUnit(combined, targetUnit);
    ctx.next[node.id] = numericValue(finalNumber, node.initialValue.unitId);
    ctx.validOutputs.add(outputKey(node.id, 0));
    ctx.pendingOutputs.delete(outputKey(node.id, 0));
  },
};

/**
 * boolean ValueNode의 lag=0 전파.
 *
 * - 각 incoming edge에서 source의 boolean을 모은다 — numeric source는 PortType
 *   검사로 막혀야 하지만 안전망으로 undefined skip.
 * - edge.inverted=true면 boolean을 뒤집어 기여 (numeric의 1-x 대응).
 * - shape는 boolean에 의미가 없어 무시. raw passthrough 분기도 없음.
 * - boolean combiner(and/or/xor)는 6단계에 등록. 미등록이면 MissingCombinerError.
 */
function propagateBooleanValueNode(
  node: Extract<Node, { kind: 'value' }>,
  ctx: PropagateContext,
): void {
  if (node.initialValue.kind !== 'boolean') return;
  const combiner = ctx.combinerRegistry.getOfKind(node.combiner, 'boolean');
  if (!combiner) throw new MissingCombinerError(node.combiner);

  const contributions: boolean[] = [];
  for (const edge of ctx.incoming) {
    const source = ctx.model.nodes[edge.from];
    if (!source) continue;
    if (!isEdgeSourceValid(ctx, edge)) continue;
    const b = getBooleanNext(ctx, edge.from);
    if (b === undefined) continue;
    contributions.push(edge.inverted ? !b : b);
  }

  if (contributions.length === 0) {
    ctx.validOutputs.delete(outputKey(node.id, 0));
    return;
  }
  ctx.next[node.id] = booleanValue(combiner.combine(contributions));
  ctx.validOutputs.add(outputKey(node.id, 0));
  ctx.pendingOutputs.delete(outputKey(node.id, 0));
}

const constantNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'constant' }>> = {
  kind: 'constant',
  outputsRaw: true,
  canBeFeedbackTarget: false,
  initialValue: (node) => node.value,
  initialValidSlots: () => [0],
  // 상수는 입력을 받지 않는다 — addEdge가 target=Constant 엣지를 거부.
  inputAccepts: () => null,
  outputSlots: (node) => [{ index: 0, value: node.value.kind }],
  outputUnit: () => FREE_FALLBACK,
  // 상수는 incoming을 받지 않는다 — 초기값으로 결정되고 매 step 동일.
  // 슬롯/엣지를 통한 입력이 있더라도 무시하고 자기 value를 유지한다.
  propagate: (node, ctx) => {
    ctx.next[node.id] = node.value;
    ctx.validOutputs.add(outputKey(node.id, 0));
  },
};

/**
 * 조건 노드 디스크립터 — 단일 입력 / 두 출력 게이트 (true·false 슬롯).
 *
 * 동작:
 *   1. slot 0 입력 하나만 사용. source 가 valid 해야 함.
 *   2. `value op node.threshold` 로 비교 (단위 무시, raw 수치).
 *   3. 입력값을 알맹이로, 조건 평가 결과(boolean) 를 메타로 부착한 WrappedValue 를
 *      ctx.next 에 저장.
 *   4. 조건 참 → slot 0(true) valid, slot 1(false) invalid; 거짓 → 반대.
 *      다운스트림은 edge.sourceSlotIndex 로 어느 분기를 받을지 선택한다.
 *   5. raw passthrough — 입력 단위가 그대로 다운스트림으로 전달된다.
 *
 * 메타 부착의 의미: 어느 슬롯을 통해 흘러왔든 알맹이만 보면 입력값 그대로지만,
 * 메타를 들여다보는 다운스트림(예: Generator gate) 은 조건 평가 결과까지 일관되게
 * 활용할 수 있다.
 */
const conditionNodeDescriptor: NodeKindDescriptor<
  Extract<Node, { kind: 'condition' }>
> = {
  kind: 'condition',
  outputsRaw: true,
  canBeFeedbackTarget: false,
  initialValue: () => undefined,
  initialValidSlots: () => [],
  inputAccepts: () => [{ value: 'numeric' }],
  outputSlots: () => [
    { index: 0, value: 'numeric', meta: 'boolean', label: 'true' },
    { index: 1, value: 'numeric', meta: 'boolean', label: 'false' },
  ],
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
    const trueSlot = outputKey(node.id, 0);
    const falseSlot = outputKey(node.id, 1);

    let value: number | undefined;
    let valueObj: Value | undefined;
    for (const edge of ctx.incoming) {
      // 단일 슬롯 게이트 — slotIndex가 명시되지 않은 엣지(undefined)는 슬롯 0으로
      // 간주한다. 명시된 경우엔 0만 허용.
      const slot = edge.slotIndex;
      if (typeof slot === 'number' && slot !== 0) continue;
      const source = ctx.model.nodes[edge.from];
      if (!source) continue;
      if (!isEdgeSourceValid(ctx, edge)) continue;
      const n = getNumericNext(ctx, edge.from);
      if (n === undefined) continue;
      value = n;
      // valueObj 는 raw 알맹이 Value — wrapped 면 unwrap 후 단위만 보존.
      // sequence source 는 Condition 게이트가 다루지 않는다 (port-compat 차단).
      // FunctionHandle 은 ctx 시각의 peek로 환원 후 일반 unwrap.
      const sourceEv = ctx.next[edge.from];
      const sourceVal =
        sourceEv && !isSequence(sourceEv)
          ? unwrap(resolveScalar(sourceEv, ctx.simulationTimeMs))
          : undefined;
      valueObj = sourceVal ?? (isValueNode(source) ? source.initialValue : undefined);
      break;
    }

    if (value === undefined) {
      ctx.validOutputs.delete(trueSlot);
      ctx.validOutputs.delete(falseSlot);
      return;
    }

    // 멈춤 상태에서는 source 값을 즉시 흡수하지 않는다 — 펄스 도착으로만 갱신.
    // 입력이 사라진 경우(value === undefined)는 위에서 이미 invalid 마킹하여 모델
    // 변화는 즉시 반영. 여기서는 valid 입력의 평가만 보류해 prior 상태를 유지.
    if (ctx.paused) return;

    let cond: boolean;
    switch (node.operator) {
      case '>':
        cond = value > node.threshold;
        break;
      case '<':
        cond = value < node.threshold;
        break;
      case '>=':
        cond = value >= node.threshold;
        break;
      case '<=':
        cond = value <= node.threshold;
        break;
      case '==':
        cond = value === node.threshold;
        break;
      case '!=':
        cond = value !== node.threshold;
        break;
      default:
        cond = false;
    }

    const rawValue: Value =
      valueObj && valueObj.kind === 'numeric' ? valueObj : numericValue(value, 'free');
    // 알맹이 + meta(boolean cond) 를 한 WrappedValue 로 묶어 저장 — 두 슬롯이
    // 같은 노드 값 컨테이너를 공유하지만, valid 슬롯 키로 라우팅이 갈린다.
    ctx.next[node.id] = wrap(rawValue, booleanValue(cond));

    if (cond) {
      ctx.validOutputs.add(trueSlot);
      ctx.validOutputs.delete(falseSlot);
    } else {
      ctx.validOutputs.delete(trueSlot);
      ctx.validOutputs.add(falseSlot);
    }
  },
};

/**
 * 식 노드 디스크립터.
 *
 * 동작:
 *   1. `node.variables`가 곧 입력 슬롯 — 각 슬롯 인덱스에 들어온 값을 변수 이름에 바인딩.
 *   2. 모든 변수가 채워져야 평가. 일부라도 비면 invalid.
 *   3. 평가자는 외부 주입 (`ctx.expressionEvaluator`). 미주입이면 noop으로 undefined.
 *   4. 결과는 raw — 단위 변환 없이 흘려보낸다.
 */
const expressionNodeDescriptor: NodeKindDescriptor<
  Extract<Node, { kind: 'expression' }>
> = {
  kind: 'expression',
  outputsRaw: true,
  canBeFeedbackTarget: false,
  initialValue: () => undefined,
  initialValidSlots: () => [],
  // fizzex는 numeric 전용 — boolean 변수는 propagate에서도 거부된다.
  inputAccepts: () => [{ value: 'numeric' }],
  outputSlots: () => [{ index: 0, value: 'numeric' }],
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
    const arity = node.variables.length;
    if (arity === 0) {
      // 변수가 없는 상수식 — diagnose로 평가하여 실패 사유까지 적재.
      const diag = ctx.expressionEvaluator.diagnose(node.latex, {});
      if (diag.ok && Number.isFinite(diag.value)) {
        ctx.next[node.id] = numericValue(diag.value, 'free');
        ctx.validOutputs.add(outputKey(node.id, 0));
        delete ctx.invalidReasons[node.id];
      } else {
        ctx.validOutputs.delete(outputKey(node.id, 0));
        ctx.invalidReasons[node.id] = diag.ok
          ? { ok: false, status: 'divergent', reason: 'non-finite-result' }
          : diag;
      }
      return;
    }

    // fizzex는 numeric 전용 — boolean Value 변수는 invalid로 거부.
    const bindings: Record<string, number> = {};
    const filled = new Array<boolean>(arity).fill(false);
    const missing: string[] = [];
    let booleanBindingVar: string | undefined;

    for (const edge of ctx.incoming) {
      const slot = edge.slotIndex;
      if (typeof slot !== 'number' || slot < 0 || slot >= arity) continue;
      if (filled[slot]) continue;
      const source = ctx.model.nodes[edge.from];
      if (!source) continue;
      if (!isEdgeSourceValid(ctx, edge)) continue;
      // 식 평가는 메타 인식이 아니다 — wrapped 면 알맹이 Value 로 unwrap.
      // sequence 는 식 변수로 흘려보낼 수 없다 (port-compat 차단; 안전망).
      // FunctionHandle 은 ctx 시각의 peek로 환원.
      const sourceEv = ctx.next[edge.from];
      const sourceV: Value | undefined =
        sourceEv && !isSequence(sourceEv)
          ? unwrap(resolveScalar(sourceEv, ctx.simulationTimeMs))
          : isValueNode(source)
            ? source.initialValue
            : undefined;
      if (!sourceV) continue;
      const varName = node.variables[slot];
      if (typeof varName !== 'string') continue;
      if (sourceV.kind === 'boolean') {
        // boolean 입력은 fizzex가 처리하지 못함 — 식 노드를 invalid로.
        booleanBindingVar = varName;
        break;
      }
      bindings[varName] = sourceV.n;
      filled[slot] = true;
    }

    if (booleanBindingVar !== undefined) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      ctx.invalidReasons[node.id] = {
        ok: false,
        status: 'unsupported',
        variable: booleanBindingVar,
        reason: `boolean 입력은 식에 사용 불가: ${booleanBindingVar}`,
      };
      return;
    }

    if (!filled.every((f) => f)) {
      for (let i = 0; i < arity; i++) {
        if (!filled[i]) {
          const v = node.variables[i];
          if (typeof v === 'string') missing.push(v);
        }
      }
      ctx.validOutputs.delete(outputKey(node.id, 0));
      ctx.invalidReasons[node.id] = {
        ok: false,
        status: 'unbound',
        variable: missing[0],
        reason: missing.length > 1 ? `unbound: ${missing.join(', ')}` : undefined,
      };
      return;
    }

    // 멈춤 상태: 모든 변수가 채워진 경우의 평가만 보류 — invalid 사유(unbound·
    // boolean·missing)는 위에서 이미 즉시 반영. 펄스 도착으로만 valid 전환.
    if (ctx.paused) return;

    const diag = ctx.expressionEvaluator.diagnose(node.latex, bindings);
    if (!diag.ok || !Number.isFinite(diag.value)) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      ctx.invalidReasons[node.id] = diag.ok
        ? { ok: false, status: 'divergent', reason: 'non-finite-result' }
        : diag;
      return;
    }
    ctx.next[node.id] = numericValue(diag.value, 'free');
    ctx.validOutputs.add(outputKey(node.id, 0));
    delete ctx.invalidReasons[node.id];
  },
};

/**
 * LogicGateNode 디스크립터 — boolean 입력을 operator로 결합.
 *
 * 이항/N항(and/or/xor)은 combiner registry에 위임 — `node.operator`가 곧 key.
 * boolean ValueNode의 결합 경로와 같은 함수를 쓰므로 결과가 자동으로 정합.
 *
 * NOT은 단항. 입력 1개일 때만 유효하고, 0개·2개+는 모두 invalid —
 * boolean algebra의 표준 정의에 따라 다중 입력의 NOT은 정의하지 않는다
 * (NOR/NAND 시맨틱을 묻어가지 않도록).
 *
 * 입력 0개이거나 모든 입력이 invalid면 출력 invalid — 게이트는 입력이 필수.
 */
const logicGateNodeDescriptor: NodeKindDescriptor<
  Extract<Node, { kind: 'logic-gate' }>
> = {
  kind: 'logic-gate',
  outputsRaw: false,
  canBeFeedbackTarget: false,
  initialValue: () => undefined,
  initialValidSlots: () => [],
  inputAccepts: () => [{ value: 'boolean' }],
  outputSlots: () => [{ index: 0, value: 'boolean' }],
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
    const contributions: boolean[] = [];
    for (const edge of ctx.incoming) {
      const source = ctx.model.nodes[edge.from];
      if (!source) continue;
      if (!isEdgeSourceValid(ctx, edge)) continue;
      const b = getBooleanNext(ctx, edge.from);
      if (b === undefined) continue;
      contributions.push(edge.inverted ? !b : b);
    }

    if (node.operator === 'not') {
      if (contributions.length !== 1) {
        ctx.validOutputs.delete(outputKey(node.id, 0));
        return;
      }
      // 멈춤 상태: invalid 케이스(0개·2개+)는 위에서 즉시 반영하고, 단항 입력의
      // 평가만 보류 — 펄스 도착으로만 valid 전환.
      if (ctx.paused) return;
      ctx.next[node.id] = booleanValue(!contributions[0]);
      ctx.validOutputs.add(outputKey(node.id, 0));
      return;
    }

    const combiner = ctx.combinerRegistry.getOfKind(node.operator, 'boolean');
    if (!combiner) throw new MissingCombinerError(node.operator);

    if (contributions.length === 0) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      return;
    }
    if (ctx.paused) return;
    ctx.next[node.id] = booleanValue(combiner.combine(contributions));
    ctx.validOutputs.add(outputKey(node.id, 0));
  },
};

/**
 * ObserveNode 디스크립터 — 입력값을 그대로 출력으로 통과시키는 모니터.
 *
 * 본체는 passthrough이고 부가 효과는 `ctx.observeBuffers[node.id]`에 통과한 값을
 * 누적하는 것. capacity 정책에 따라 큐 길이를 자른다. 버퍼는 runtime-only —
 * propagateOneStep이 ExecutionState로 회수하지만 직렬화 단계에서는 빠진다.
 *
 * PortType 은 입력 엣지 source 의 출력 슬롯 PortSpec(value + meta) 을 그대로
 * 거울처럼 미러링하며, 입력이 없으면 acceptsAnyInput=true 로 어떤 source 든 첫 연결을 허용한다.
 * 초기 구현은 단일 입력만 — 첫 번째 incoming edge를 본다.
 *
 * "데이터 흐름 도메인 전문가" — ValueNode + Skin이 단위 도메인 전문가인 것과
 * 평행한 구조. 본체는 단순하고 paradigm이 표현을 책임진다.
 */
function firstIncomingEdgeForNode(model: Model, id: NodeId): Edge | undefined {
  for (const eid of model.edgeOrder) {
    const e = model.edges[eid];
    if (e && e.to === id && e.lag === 0) return e;
  }
  return undefined;
}

/** 기존 버퍼의 capacity 정책이 현재 모델 설정과 일치하는지. */
function capacityMatches(
  buf: ObserveBuffer,
  capacity: Extract<Node, { kind: 'observe' }>['capacity'],
): boolean {
  switch (buf.kind) {
    case 'windowed':
      return capacity.kind === 'windowed' && buf.windowMs === capacity.windowMs;
    case 'unbounded':
      return capacity.kind === 'unbounded';
  }
}

/**
 * ObserveNode passthrough 의 source spec 미러링 헬퍼.
 * 입력 엣지가 없거나 source 가 사라졌으면 보수적인 numeric 폴백.
 *
 * source 의 출력 슬롯 spec(value + meta) 을 그대로 가져와 ObserveNode 의
 * 입출력 모두에 동일하게 반영 — passthrough 의 핵심 의미.
 */
function passthroughSourceSpec(
  node: Extract<Node, { kind: 'observe' }>,
  ctx: PortTypeContext | undefined,
): PortSpec {
  if (!ctx) return { value: 'numeric' };
  const edge = firstIncomingEdgeForNode(ctx.model, node.id);
  if (!edge) return { value: 'numeric' };
  const source = ctx.model.nodes[edge.from];
  if (!source) return { value: 'numeric' };
  const srcSlot = edge.sourceSlotIndex ?? 0;
  const sourceSlots = getOutputSlots(source, ctx.registry, ctx.model);
  const slot = sourceSlots[srcSlot] ?? sourceSlots[0];
  if (!slot) return { value: 'numeric' };
  // ObserveNode 본체는 스칼라 passthrough — sequence source 는 port-compat 가
  // 차단해야 정상이지만, 그 결과까지 미러링하지 않는다. 보수적 폴백.
  if (isSequencePortSpec(slot)) return { value: 'numeric' };
  return slot.meta !== undefined
    ? { value: slot.value, meta: slot.meta }
    : { value: slot.value };
}

const observeNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'observe' }>> = {
  kind: 'observe',
  outputsRaw: true, // passthrough — source의 raw성을 그대로 유지
  canBeFeedbackTarget: false,
  initialValue: () => undefined,
  initialValidSlots: () => [],
  inputAccepts: (node, ctx) => [passthroughSourceSpec(node, ctx)],
  // 슬롯 0: 스칼라 passthrough(본체). 슬롯 1: 누적 추출 sequence.
  //   element kind 는 본체 passthrough spec.value 와 같다 — 본체가 numeric 이면
  //   추출 sample 도 numeric.
  outputSlots: (node, ctx) => {
    const bodySpec = passthroughSourceSpec(node, ctx);
    const elementKind: ValueKind = isSequencePortSpec(bodySpec)
      ? 'numeric'
      : bodySpec.value;
    return [
      { index: 0, ...bodySpec },
      { index: 1, kind: 'sequence', element: elementKind, label: '누적 추출' },
    ];
  },
  acceptsAnyInput: (node, ctx) => {
    if (!ctx) return false;
    return firstIncomingEdgeForNode(ctx.model, node.id) === undefined;
  },
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
    const extractionSlotKey = outputKey(node.id, 1);
    const edge = ctx.incoming[0];
    if (!edge) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      // 누적 추출은 본체가 stall 해도 이전 누적 스냅샷을 유지한다 — 다운스트림
      // 통계 노드가 마지막으로 보았던 분포를 잃지 않게. valid 도 그대로.
      return;
    }
    if (!isEdgeSourceValid(ctx, edge)) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      return;
    }
    // 메타 보존 passthrough — source 가 WrappedValue 면 알맹이만 inverted 변환 후
    // 메타를 재부착해 흘려보낸다. 평탄한 Value 면 기존 동작 그대로.
    const sourceNode = ctx.model.nodes[edge.from];
    const fallback: Value | undefined =
      sourceNode && isValueNode(sourceNode) ? sourceNode.initialValue : undefined;
    const sourceEv: ExecValue | undefined = ctx.next[edge.from] ?? fallback;
    if (!sourceEv) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      return;
    }
    // ObserveNode 는 스칼라만 passthrough — sequence source 는 port-compat 단계의
    // 별도 처리(차후 Phase) 대상. 안전망으로 무효 처리. FunctionHandle 은 ctx
    // 시각의 peek로 환원해 메타 없는 스칼라처럼 처리한다.
    if (isSequence(sourceEv)) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      return;
    }
    // 멈춤 상태: invalid 분기(엣지 없음·source invalid·sequence)는 위에서 즉시
    // 반영하고, passthrough 갱신과 observeBuffer 누적만 보류 — 펄스 도착으로만 진행.
    if (ctx.paused) return;
    const inner: Value = unwrap(resolveScalar(sourceEv, ctx.simulationTimeMs));
    const innerOut: Value =
      edge.inverted && inner.kind === 'boolean'
        ? booleanValue(!inner.b)
        : edge.inverted && inner.kind === 'numeric'
          ? numericValue(-inner.n, inner.unitId)
          : inner;
    const passed: ExecValue =
      sourceEv.kind === 'wrapped' ? wrap(innerOut, sourceEv.meta) : innerOut;
    ctx.next[node.id] = passed;
    ctx.validOutputs.add(outputKey(node.id, 0));

    // observeBuffer 에는 (value, t) sample 로 누적 — t 는 현 step 의 simulation time.
    // 메타는 시각화/통계 모두 알맹이만 보면 충분하므로 메타 분리 후 알맹이만 박제.
    // bounded는 ring buffer로 O(1) push + 자동 evict, unbounded는 growable array.
    let buf = ctx.observeBuffers[node.id];
    if (!buf || !capacityMatches(buf, node.capacity)) {
      // 미초기화 또는 capacity 정책이 모델에서 바뀐 경우 — 새로 만든다. capacity
      // 변경은 흔치 않으니 누적 손실은 수용 가능한 트레이드오프.
      buf = createObserveBuffer(node.capacity);
    }
    const sample: SequenceSample = { value: innerOut, t: ctx.simulationTimeMs };
    pushSample(buf, sample);
    ctx.observeBuffers[node.id] = buf;

    // 누적 추출 슬롯의 발사 정책 평가. realtime 은 매번, throttle 은 지난 emit
    // 이후 intervalMs 가 simulation time 으로 지났을 때만 새 스냅샷을 흘려보낸다.
    const extraction = node.extraction;
    const lastEmit = ctx.observeExtractionRuntime[node.id]?.lastEmitTimeMs ?? -Infinity;
    const shouldEmit =
      extraction.kind === 'realtime' ||
      ctx.simulationTimeMs - lastEmit >= extraction.intervalMs;
    if (shouldEmit) {
      const snapshot: SequenceValue = {
        kind: 'sequence',
        samples: observeBufferToArray(buf),
      };
      ctx.sequenceNext[extractionSlotKey] = snapshot;
      ctx.validOutputs.add(extractionSlotKey);
      ctx.observeExtractionRuntime[node.id] = { lastEmitTimeMs: ctx.simulationTimeMs };
    }
    // emit 하지 않으면 직전 스냅샷을 그대로 둔다 — 다운스트림이 stale 값을 계속
    // 본다는 의미가 아니라 "아직 다음 발사 시각이 안 됐다" 의 결정론적 표현.
  },
};

/**
 * GeneratorNode 디스크립터 — cursor를 진행하며 자신의 numeric을 emit.
 *
 * 단일 메타 인식 입력 슬롯이 있다 — boolean 또는 numeric(meta:boolean) 을 OR 매칭:
 *  - 미연결: 글로벌 paused=false 인 한 매 step emit (노드별 토글 없음).
 *  - 연결 (plain boolean): 알맹이 boolean 이 emit gate.
 *  - 연결 (Condition 슬롯 출력): wrapped value 의 meta(boolean) 가 emit gate —
 *    "조건 슬롯을 통과한 펄스만 emit 진행" 의미가 자동으로 성립한다.
 *  - source 가 invalid 거나 게이트로 해석 못 하면 freeze (안전한 정지).
 *
 * - propagate: 위 시맨틱으로 effectivelyEnabled를 산출 후 paradigm.emit. freeze면
 *   ctx.next/validOutputs를 건드리지 않아 마지막 값이 유지된다.
 * - 첫 propagate에서 runtime이 비어 있으면 paradigm.initCursor로 lazy init하지만
 *   initializeFromInitialValues가 미리 채워둬 이 경로는 거의 안 탄다.
 *
 * 출력은 raw('free') — 단위는 다운스트림 ValueNode가 흡수.
 */
const generatorNodeDescriptor: NodeKindDescriptor<
  Extract<Node, { kind: 'generator' }>
> = {
  kind: 'generator',
  outputsRaw: true,
  canBeFeedbackTarget: false,
  // 시간 분포 본질은 paradigm 고유 속성 — defaultGeneratorRegistry에서 paradigm을
  // 조회해 그대로 위임한다. paradigm 객체는 static metadata이므로 인스턴스 차이
  // 없이 안전. 미등록 kind면 안전한 'continuous'로 폴백.
  outputInterpolation: (node): OutputInterpolation =>
    defaultGeneratorRegistry.get(node.params.kind)?.outputInterpolation ?? 'continuous',
  initialValue: () => undefined,
  initialValidSlots: () => [],
  // 메타 인지: plain boolean 또는 numeric+meta:boolean (Condition 슬롯) 둘 다 받는다.
  // port-compat 검사가 둘 중 하나와 매칭되면 호환으로 판정.
  inputAccepts: () => [
    { value: 'boolean' },
    { value: 'numeric', meta: 'boolean' },
  ],
  outputSlots: () => [{ index: 0, value: 'numeric' }],
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
    const existing = ctx.generatorRuntime[node.id];
    const runtime: GeneratorRuntime = existing ?? {
      cursor: ctx.generatorRegistry.initCursor(node.params, ctx.simulationTimeMs),
    };

    // 입력 boolean gate 캐시 동기화 — propagate는 모델 변경/전체 재계산 시점이라
    // 이 자리에서 source state로부터 gateOpen을 새로 채운다. ticker는 이후 이
    // 캐시만 본다(state.values 직접 조회 금지).
    //
    // asBooleanGate 가 알맹이/메타 우선순위를 통일 — Condition 슬롯에서 흘러온
    // wrapped numeric 의 meta:boolean 도 게이트로 인식.
    let gateOpen: boolean | undefined;
    if (ctx.incoming.length > 0) {
      for (const edge of ctx.incoming) {
        if (!isEdgeSourceValid(ctx, edge)) continue;
        const ev = ctx.next[edge.from];
        if (!ev) continue;
        const raw = asBooleanGate(ev);
        if (raw === undefined) continue;
        gateOpen = edge.inverted ? !raw : raw;
        break;
      }
    }

    // 미연결이면 항상 emit, 연결이면 gateOpen만이 결정 — 노드별 토글 없음.
    const effectivelyEnabled =
      ctx.incoming.length === 0 ? true : gateOpen === true;

    if (!effectivelyEnabled) {
      // 비활성(freeze)이어도 gateOpen은 최신 source 상태로 갱신해 둔다.
      ctx.generatorRuntime[node.id] = { cursor: runtime.cursor, gateOpen };
      return;
    }
    const { value, nextCursor } = ctx.generatorRegistry.emit(
      node.params,
      runtime.cursor,
      ctx.simulationTimeMs,
    );
    // value=undefined는 paradigm이 "지금은 출력이 정의되지 않음"으로 freeze한 경우
    // (스텝 generator의 t<startMs 등). ctx.next·validOutputs를 건드리지 않아 마지막
    // 값(또는 invalid)이 유지되고, cursor만 진행한다.
    if (value !== undefined) {
      ctx.next[node.id] = value;
      ctx.validOutputs.add(outputKey(node.id, 0));
    }
    ctx.generatorRuntime[node.id] = { cursor: nextCursor, gateOpen };
  },
};

/**
 * AverageNode 디스크립터 — sequence<numeric> 입력의 표본 평균을 numeric 으로 출력.
 *
 * - 입력은 sequence<numeric> 단일 슬롯. ObserveNode 의 누적 추출 슬롯 등 sequence
 *   PortSpec 을 advertise 하는 source 만 호환.
 * - propagate: ctx.sequenceNext[sourceKey] 에서 SequenceValue 를 꺼내 numeric
 *   sample 만 골라 표본 평균 계산. 빈 sequence / numeric sample 0 개면 invalid.
 * - 출력 단위는 raw('free') — 다운스트림 ValueNode/시각화가 도메인 단위 해석.
 * - canBeFeedbackTarget=false: 통계 결과를 다시 통계 입력으로 되먹이는 의미는
 *   현재 정의되지 않음. 추후 도입 시 명시적 분리.
 */
const averageNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'average' }>> = {
  kind: 'average',
  outputsRaw: true,
  canBeFeedbackTarget: false,
  initialValue: () => undefined,
  initialValidSlots: () => [],
  inputAccepts: () => [{ kind: 'sequence', element: 'numeric' }],
  outputSlots: () => [{ index: 0, value: 'numeric' }],
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
    const slotKey = outputKey(node.id, 0);
    const edge = ctx.incoming[0];
    if (!edge) {
      ctx.validOutputs.delete(slotKey);
      return;
    }
    if (!isEdgeSourceValid(ctx, edge)) {
      ctx.validOutputs.delete(slotKey);
      return;
    }
    const srcSlot = edge.sourceSlotIndex ?? 0;
    const seqKey = outputKey(edge.from, srcSlot);
    const seq = ctx.sequenceNext[seqKey];
    if (!seq) {
      ctx.validOutputs.delete(slotKey);
      return;
    }
    let sum = 0;
    let count = 0;
    for (const sample of seq.samples) {
      if (sample.value.kind !== 'numeric') continue;
      const n = sample.value.n;
      if (!Number.isFinite(n)) continue;
      sum += n;
      count += 1;
    }
    if (count === 0) {
      ctx.validOutputs.delete(slotKey);
      return;
    }
    const mean = sum / count;
    ctx.next[node.id] = numericValue(mean, 'free');
    ctx.validOutputs.add(slotKey);
  },
};

/**
 * Stock 노드 디스크립터 — pulse 도착 시 값을 그대로 누적하는 이산 누적 노드.
 *
 * 입력 슬롯 2개:
 *   - slot 0: inflow (가산, numeric).
 *   - slot 1: outflow (감산, numeric).
 *
 * 출력 슬롯 2개:
 *   - slot 0: level (현재 누적량, unitId 보존). 항상 valid (초기 level 부터).
 *   - slot 1: overflow (capacity 경계를 넘쳐 사라지는 양, raw). propagate 경로에서는
 *     항상 invalid — overflow 는 펄스 도착 시점 사건이라 RAF/scrub/initial 경로에서는
 *     의미를 갖지 않는다. handlePulseArrival 에서 누적 발생 시 spawn.
 *
 * 누적 시맨틱은 propagate 가 아니라 호스트(model-store) 의 handlePulseArrival 에서
 * 직접 수행한다. propagate 는 prev level 을 유지하는 노옵 — RAF/scrub/initial 등
 * 누적과 무관한 경로에서는 값을 흔들지 않는다.
 */
const stockNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'stock' }>> = {
  kind: 'stock',
  outputsRaw: false,
  canBeFeedbackTarget: true,
  initialValue: (node) => numericValue(node.initialLevel, node.unitId),
  initialValidSlots: () => [0],
  inputAccepts: () => [{ value: 'numeric' }],
  outputSlots: () => [
    { index: 0, value: 'numeric', label: 'level' },
    { index: 1, value: 'numeric', label: 'overflow' },
    { index: 2, value: 'numeric', label: 'rate' },
  ],
  outputUnit: (node, catalog) => {
    const def = catalog.get(node.unitId);
    if (!def) return FREE_FALLBACK;
    return resolveUnit(def, node.unitOverride);
  },
  outputInterpolation: () => 'continuous',
  propagate: (node, ctx) => {
    const levelKey = outputKey(node.id, 0);
    const overflowKey = outputKey(node.id, 1);
    const rateKey = outputKey(node.id, 2);
    // overflow / rate 는 펄스 도착 사건 전용 — propagate 경로에서는 invalid.
    // rate 의 노드 본문 표시값은 UI selector 가 stockRuntime 으로 직접 계산해
    // RAF 따라 자연 감쇠시킨다. 다운스트림 전파는 handlePulseArrival 의 spawn 만.
    ctx.validOutputs.delete(overflowKey);
    ctx.validOutputs.delete(rateKey);

    // prev level: ctx.next 우선, 없으면 initialLevel 폴백.
    const prevExec = ctx.next[node.id];
    let prevLevel = node.initialLevel;
    if (prevExec && !isSequence(prevExec)) {
      const v = unwrap(resolveScalar(prevExec, ctx.simulationTimeMs));
      if (v.kind === 'numeric') prevLevel = v.n;
    }

    // 누적은 호스트의 handlePulseArrival 에서 일어난다. 이 propagate 경로는
    // RAF/scrub/initial 등 누적과 무관한 경로 — prev level 을 그대로 유지.
    ctx.next[node.id] = numericValue(prevLevel, node.unitId);
    ctx.validOutputs.add(levelKey);
    ctx.pendingOutputs.delete(levelKey);
  },
};

export function createDefaultNodeKindRegistry(): NodeKindRegistry {
  return createNodeKindRegistry()
    .register(valueNodeDescriptor)
    .register(constantNodeDescriptor)
    .register(conditionNodeDescriptor)
    .register(logicGateNodeDescriptor)
    .register(observeNodeDescriptor)
    .register(expressionNodeDescriptor)
    .register(generatorNodeDescriptor)
    .register(averageNodeDescriptor)
    .register(stockNodeDescriptor);
}

/**
 * 라이브러리 내부에서 등록 누락을 빠르게 잡기 위해 단일 기본 인스턴스를 제공.
 * 옵션을 통해 명시 주입하지 않은 경로의 폴백.
 */
export const defaultNodeKindRegistry = createDefaultNodeKindRegistry();

/**
 * 디스크립터를 통해 출력 단위를 얻는다. 등록되지 않은 종류면 FREE_FALLBACK.
 * propagate.ts와 외부(UI)에서 안전하게 쓰기 위한 헬퍼.
 */
export function getNodeOutputUnit(
  node: Node,
  catalog: UnitCatalog,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
): ResolvedUnit {
  const desc = registry.forNode(node);
  if (!desc) return FREE_FALLBACK;
  return desc.outputUnit(node, catalog);
}

/** 노드의 raw passthrough 여부. 미등록 종류는 false. */
export function isRawOutputNode(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
): boolean {
  return registry.forNode(node)?.outputsRaw ?? false;
}

/** 노드가 피드백 target이 될 수 있는지. 미등록 종류는 false. */
export function canBeFeedbackTarget(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
): boolean {
  return registry.forNode(node)?.canBeFeedbackTarget ?? false;
}

/**
 * 노드의 출력 슬롯 명세 전체. 미등록 종류는 보수적인 단일 numeric 슬롯으로 폴백.
 *
 * `model` 을 주면 passthrough 노드가 source spec 을 미러링한다.
 */
export function getOutputSlots(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): readonly OutputSlotSpec[] {
  const desc = registry.forNode(node);
  if (!desc) return [{ index: 0, value: 'numeric' }];
  return desc.outputSlots(node, model ? { model, registry } : undefined);
}

/**
 * 특정 슬롯 인덱스의 출력 PortSpec. 슬롯이 없으면 undefined.
 */
export function getOutputSlotAt(
  node: Node,
  slot: number,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): OutputSlotSpec | undefined {
  return getOutputSlots(node, registry, model)[slot];
}

/**
 * 노드의 입력 acceptsList. null 이면 입력을 받지 않는다.
 */
export function getInputAccepts(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): readonly PortSpec[] | null {
  const desc = registry.forNode(node);
  if (!desc) return null;
  return desc.inputAccepts(node, model ? { model, registry } : undefined);
}

/**
 * 노드의 scalar 입력 PortType (slot 0, value 만). null 이면 입력 없음 또는 sequence-only.
 * 미등록 종류는 null 로 안전 폴백.
 *
 * 슬롯·메타·sequence 인지 호출자는 [[getInputAccepts]] 를 직접 사용.
 */
export function getInputPortType(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): ValueKind | null {
  const accepts = getInputAccepts(node, registry, model);
  if (accepts === null) return null;
  const first = accepts[0];
  if (!first) return null;
  if (isSequencePortSpec(first)) return null;
  return first.value;
}

/**
 * 노드의 scalar 출력 PortType (slot 0, value 만). 미등록·sequence 슬롯은 'numeric' 폴백.
 *
 * 슬롯별 / sequence 인지 PortType 이 필요하면 [[getOutputSlotAt]] 사용.
 */
export function getOutputPortType(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): ValueKind {
  const first = getOutputSlots(node, registry, model)[0];
  if (!first) return 'numeric';
  if (isSequencePortSpec(first)) return 'numeric';
  return first.value;
}

export type EdgeCompatibility =
  | { compatible: true }
  | { compatible: false; reason: string };

/**
 * 두 PortSpec 이 호환되는지.
 *
 * - `value` 는 항상 일치해야 한다 (자동 변환 없음).
 * - target 이 `meta` 를 명시했으면 source 도 동일한 `meta` 를 가져야 한다.
 *   target 이 meta 를 명시 안 했으면 source meta 유무 무관 — caller 가 unwrap 으로
 *   알맹이만 본다.
 *
 * 이 모델은 "connected but doesn't work" 를 정적으로 차단한다 — Generator 의
 * boolean 게이트가 plain numeric 을 받아 freeze 만 되는 사례를 메뉴에서 제외시킨다.
 */
function specMatches(source: PortSpec, target: PortSpec): boolean {
  // scalar ↔ sequence 는 호환 안 됨 — 자동 변환 없음 (명시적 변환 노드 필요).
  if (isSequencePortSpec(source) !== isSequencePortSpec(target)) return false;
  if (isSequencePortSpec(source) && isSequencePortSpec(target)) {
    return source.element === target.element;
  }
  // 둘 다 scalar — 기존 의미 동일.
  const ss = source as ScalarPortSpec;
  const ts = target as ScalarPortSpec;
  if (ss.value !== ts.value) return false;
  if (ts.meta !== undefined && ss.meta !== ts.meta) return false;
  return true;
}

/**
 * source → target 엣지의 PortType 호환성을 본다.
 *
 * 검사 항목:
 *  1. target 이 입력을 받지 않는 종류면 거부 (Constant 등)
 *  2. source 출력 슬롯의 PortSpec 이 target inputAccepts 의 어떤 spec 과도
 *     매칭되지 않으면 거부
 *
 * 자동 변환은 없다 — numeric을 boolean으로(또는 그 반대) 흘리려면
 * 명시적 변환 노드를 끼워야 한다.
 *
 * `sourceSlotIndex` 미지정 시 슬롯 0 으로 간주. ConditionNode 의 true/false
 * 슬롯이 동일 spec 이면 어느 쪽으로 연결하든 통과.
 */
export function checkEdgeCompatibility(
  source: Node,
  target: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
  sourceSlotIndex: number = 0,
): EdgeCompatibility {
  // target 입력 PortType 이 비결정적인 passthrough(ObserveNode 미연결 상태 등)면
  // 어떤 source 든 받아준다 — acceptsAnyInput=true 케이스. 첫 연결을 자유롭게 허용해
  // 이후 PortType 이 그 source 로 잠긴다.
  const targetDesc = registry.forNode(target);
  if (
    targetDesc?.acceptsAnyInput &&
    targetDesc.acceptsAnyInput(target, model ? { model, registry } : undefined)
  ) {
    return { compatible: true };
  }
  const targetAccepts = getInputAccepts(target, registry, model);
  if (targetAccepts === null) {
    return {
      compatible: false,
      reason: `target node "${target.kind}" does not accept inputs`,
    };
  }
  const sourceSlot = getOutputSlotAt(source, sourceSlotIndex, registry, model);
  if (!sourceSlot) {
    return {
      compatible: false,
      reason: `source node "${source.kind}" has no output slot ${sourceSlotIndex}`,
    };
  }
  for (const accept of targetAccepts) {
    if (specMatches(sourceSlot, accept)) return { compatible: true };
  }
  const wanted = targetAccepts.map(describePortSpec).join('|');
  return {
    compatible: false,
    reason: `port type mismatch: source outputs "${describePortSpec(sourceSlot)}", target expects "${wanted}"`,
  };
}

/** PortSpec → 사람이 읽을 수 있는 라우팅 라벨. scalar/sequence 양쪽을 한 형식으로. */
function describePortSpec(spec: PortSpec): string {
  if (isSequencePortSpec(spec)) return `sequence<${spec.element}>`;
  return spec.value;
}
