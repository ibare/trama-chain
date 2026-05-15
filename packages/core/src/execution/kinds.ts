import type { CombinerRegistry } from '../combiners/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import type { Edge, Model, Node, NodeId, Value, ValueKind } from '../model/index.js';
import { booleanValue, isValueNode, isNumericValue, numericValue } from '../model/index.js';
import type { GeneratorRegistry, GeneratorRuntime } from '../generators/index.js';
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
import { outputKey } from './state.js';

/**
 * propagate 컨텍스트에서 source 노드의 현재 numeric value를 꺼낸다.
 * - ctx.next에 기록돼 있으면 그것 (Value sum type 중 numeric만 인정).
 * - 없으면 ValueNode의 initialValue에서 폴백.
 * - boolean Value거나 미기록이면 undefined — caller가 skip해야 한다.
 */
function getNumericNext(ctx: PropagateContext, id: NodeId): number | undefined {
  const v = ctx.next[id];
  if (v) {
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
 * source가 numeric이면 undefined — PortType 검사가 막아야 하지만 안전망.
 */
function getBooleanNext(ctx: PropagateContext, id: NodeId): boolean | undefined {
  const v = ctx.next[id];
  if (v) {
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
  next: Record<NodeId, Value>;
  validOutputs: Set<string>;
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
   * ObserveNode가 통과한 값을 시간순으로 누적해 두는 버퍼.
   * 디스크립터가 mutate하며, propagateOneStep이 결과를 ExecutionState로 회수한다.
   * runtime-only — 직렬화되지 않는다.
   */
  observeBuffers: Record<NodeId, Value[]>;
  /**
   * GeneratorNode의 enabled 플래그와 cursor. propagate가 emit할 때 mutate한다.
   * runtime-only — 직렬화되지 않는다.
   */
  generatorRuntime: Record<NodeId, GeneratorRuntime>;
  /** 등록된 패러다임 모음. emit 라우팅에 사용. */
  generatorRegistry: GeneratorRegistry;
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
 * 노드 종류별 동작을 한 곳에 모은 디스크립터.
 * 새 노드 종류 추가 시 디스크립터를 작성·등록하면 전파·초기화·피드백·단위
 * 해석이 모두 라우팅된다.
 */
export interface NodeKindDescriptor<N extends Node = Node> {
  kind: N['kind'];
  /** 초기 state.values에 기록할 Value. undefined면 미기록(propagate 단계에서 채움). */
  initialValue(node: N): Value | undefined;
  /** 초기 validOutputs(슬롯 0)에 포함시킬지. 단출력 노드 전제. */
  initialValid(node: N): boolean;
  /** 이 노드의 출력 단위. raw 통과(outputsRaw=true)여도 시각화·클램프 폴백용으로 의미가 있다. */
  outputUnit(node: N, catalog: UnitCatalog): ResolvedUnit;
  /**
   * 이 노드의 입력 PortType. null이면 이 노드는 입력을 받지 않는다
   * (예: Constant). 현재는 노드 전체가 단일 PortType — 슬롯별 분기 필요해지면
   * 별도 슬롯 인자 시그니처로 확장한다.
   *
   * ObserveNode처럼 passthrough성 노드는 입력 엣지의 source PortType을 따라가야
   * 하므로 optional ctx로 모델과 레지스트리를 전달받는다. 정적 시점에 ctx 없이
   * 호출되면 보수적인 폴백(예: 'numeric')을 반환.
   */
  inputPortType(node: N, ctx?: PortTypeContext): ValueKind | null;
  /** 이 노드 출력의 PortType. 단출력 전제. ctx 시맨틱은 [[inputPortType]]과 동일. */
  outputPortType(node: N, ctx?: PortTypeContext): ValueKind;
  /**
   * 입력 PortType이 비결정적(passthrough 노드 + 입력 미연결 등)일 때 어떤 source든
   * 받아주겠다는 신호. ObserveNode가 입력 엣지가 없을 때 true를 반환해
   * 첫 연결을 자유롭게 허용한다. 일단 연결되면 false로 떨어져 inputPortType이
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
  initialValid: () => true,
  // ValueNode의 PortType은 initialValue의 kind 그대로 — boolean ValueNode가
  // 추가되어도 동일 디스크립터에서 분기된다. propagate 로직은 5단계에서 분기 강화.
  inputPortType: (node) => node.initialValue.kind,
  outputPortType: (node) => node.initialValue.kind,
  outputUnit: (node, catalog) => {
    // 단위는 numeric Value 안에 종속 — boolean ValueNode는 단위 없음.
    if (!isNumericValue(node.initialValue)) return FREE_FALLBACK;
    const def = catalog.get(node.initialValue.unitId);
    if (!def) return FREE_FALLBACK;
    return resolveUnit(def, node.unitOverride);
  },
  propagate: (node, ctx) => {
    const incoming = ctx.incoming;
    if (incoming.length === 0) return; // 입력 없음: 기존 값 유지

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
}

const constantNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'constant' }>> = {
  kind: 'constant',
  outputsRaw: true,
  canBeFeedbackTarget: false,
  initialValue: (node) => node.value,
  initialValid: () => true,
  // 상수는 입력을 받지 않는다 — addEdge가 target=Constant 엣지를 거부.
  inputPortType: () => null,
  outputPortType: (node) => node.value.kind,
  outputUnit: () => FREE_FALLBACK,
  // 상수는 incoming을 받지 않는다 — 초기값으로 결정되고 매 step 동일.
  // 슬롯/엣지를 통한 입력이 있더라도 무시하고 자기 value를 유지한다.
  propagate: (node, ctx) => {
    ctx.next[node.id] = node.value;
    ctx.validOutputs.add(outputKey(node.id, 0));
  },
};

/**
 * 조건 노드 디스크립터 — 단일 입력 / 단일 출력 게이트.
 *
 * 동작:
 *   1. slot 0 입력 하나만 사용. source가 valid해야 함.
 *   2. `value op node.threshold`로 비교 (단위 무시, raw 수치).
 *   3. 참이면 입력값을 그대로 next에 흘려보내고 slot 0 valid.
 *      거짓이면 slot 0 invalid — 출력이 끊긴다.
 *   4. raw passthrough: 입력의 단위가 그대로 다음 노드에 전달된다.
 *
 * boolean을 생산하지 않는 데이터 통과 게이트 의미. 참/거짓 신호가 필요한
 * 논리 회로는 별도의 Comparator 노드(추후 도입)가 담당.
 */
const conditionNodeDescriptor: NodeKindDescriptor<
  Extract<Node, { kind: 'condition' }>
> = {
  kind: 'condition',
  outputsRaw: true,
  canBeFeedbackTarget: false,
  initialValue: () => undefined,
  initialValid: () => false,
  // 조건 게이트는 numeric을 비교 — boolean 입력은 ComparisonNode(7단계)로.
  // 출력은 입력 numeric의 raw passthrough.
  inputPortType: () => 'numeric',
  outputPortType: () => 'numeric',
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
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
      // 조건 노드는 numeric 비교 — boolean source는 입력으로 받지 않음(PortType 검사가
      // 3단계에서 막는다). 1단계에선 boolean이 들어오면 skip.
      const n = getNumericNext(ctx, edge.from);
      if (n === undefined) continue;
      value = n;
      valueObj = ctx.next[edge.from] ?? (isValueNode(source) ? source.initialValue : undefined);
      break;
    }

    if (value === undefined) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      return;
    }

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

    if (cond) {
      // raw passthrough — 입력 numeric Value를 그대로 흘려보낸다.
      // valueObj가 있으면 그대로, 없으면 'free' 단위로 wrap.
      ctx.next[node.id] = valueObj && valueObj.kind === 'numeric'
        ? valueObj
        : numericValue(value, 'free');
      ctx.validOutputs.add(outputKey(node.id, 0));
    } else {
      ctx.validOutputs.delete(outputKey(node.id, 0));
    }
  },
};

/**
 * 비교 노드 디스크립터 — numeric 입력을 받아 boolean 출력을 *생산*하는 연산자.
 *
 * 동작:
 *   1. 단일 numeric 슬롯(0)만 사용. source가 valid해야 함.
 *   2. `value op node.threshold` 결과를 boolean Value로 next에 기록.
 *      ConditionNode와 달리 입력값을 흘리는 게 아니라 boolean을 *만들어* 낸다.
 *   3. 입력 source가 invalid·없음이면 출력도 invalid (boolean false를 노출하지 않음 —
 *      "비교 자체가 의미 없다" vs "false다"가 구분되어야 한다).
 *
 * 통상의 사용: 노드 한 개로 numeric→boolean 변환. 결과를 boolean ValueNode·
 * boolean Combiner와 연결해 논리 회로를 짠다.
 */
const comparisonNodeDescriptor: NodeKindDescriptor<
  Extract<Node, { kind: 'comparison' }>
> = {
  kind: 'comparison',
  outputsRaw: false,
  canBeFeedbackTarget: false,
  initialValue: () => undefined,
  initialValid: () => false,
  inputPortType: () => 'numeric',
  outputPortType: () => 'boolean',
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
    let value: number | undefined;
    for (const edge of ctx.incoming) {
      const slot = edge.slotIndex;
      if (typeof slot === 'number' && slot !== 0) continue;
      const source = ctx.model.nodes[edge.from];
      if (!source) continue;
      if (!isEdgeSourceValid(ctx, edge)) continue;
      const n = getNumericNext(ctx, edge.from);
      if (n === undefined) continue;
      value = n;
      break;
    }

    if (value === undefined) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      return;
    }

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

    ctx.next[node.id] = booleanValue(cond);
    ctx.validOutputs.add(outputKey(node.id, 0));
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
  initialValid: () => false,
  // fizzex는 numeric 전용 — boolean 변수는 propagate에서도 거부된다.
  inputPortType: () => 'numeric',
  outputPortType: () => 'numeric',
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
      const sourceV = ctx.next[edge.from] ?? (isValueNode(source) ? source.initialValue : undefined);
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
  initialValid: () => false,
  inputPortType: () => 'boolean',
  outputPortType: () => 'boolean',
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
    ctx.next[node.id] = booleanValue(combiner.combine(contributions));
    ctx.validOutputs.add(outputKey(node.id, 0));
  },
};

/**
 * 단일 source 노드의 현재 Value를 ctx에서 꺼낸다 (numeric·boolean 공통).
 * 노드의 kind에 따라 ValueNode의 initialValue로 폴백 — ObserveNode 같은
 * 정체불명 source의 폴백은 ValueNode 한정으로만 안전.
 */
function getAnyNext(ctx: PropagateContext, id: NodeId): Value | undefined {
  const v = ctx.next[id];
  if (v) return v;
  const source = ctx.model.nodes[id];
  if (source && isValueNode(source)) return source.initialValue;
  return undefined;
}

/**
 * ObserveNode 디스크립터 — 입력값을 그대로 출력으로 통과시키는 모니터.
 *
 * 본체는 passthrough이고 부가 효과는 `ctx.observeBuffers[node.id]`에 통과한 값을
 * 누적하는 것. capacity 정책에 따라 큐 길이를 자른다. 버퍼는 runtime-only —
 * propagateOneStep이 ExecutionState로 회수하지만 직렬화 단계에서는 빠진다.
 *
 * PortType은 입력 엣지 source의 outputPortType을 그대로 거울처럼 따라가며,
 * 입력이 없으면 acceptsAnyInput=true로 어떤 source든 첫 연결을 허용한다.
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

const observeNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'observe' }>> = {
  kind: 'observe',
  outputsRaw: true, // passthrough — source의 raw성을 그대로 유지
  canBeFeedbackTarget: false,
  initialValue: () => undefined,
  initialValid: () => false,
  inputPortType: (node, ctx) => {
    if (!ctx) return 'numeric'; // 정적 폴백
    const edge = firstIncomingEdgeForNode(ctx.model, node.id);
    if (!edge) return 'numeric';
    const source = ctx.model.nodes[edge.from];
    if (!source) return 'numeric';
    return getOutputPortType(source, ctx.registry, ctx.model);
  },
  outputPortType: (node, ctx) => {
    if (!ctx) return 'numeric';
    const edge = firstIncomingEdgeForNode(ctx.model, node.id);
    if (!edge) return 'numeric';
    const source = ctx.model.nodes[edge.from];
    if (!source) return 'numeric';
    return getOutputPortType(source, ctx.registry, ctx.model);
  },
  acceptsAnyInput: (node, ctx) => {
    if (!ctx) return false;
    return firstIncomingEdgeForNode(ctx.model, node.id) === undefined;
  },
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
    const edge = ctx.incoming[0];
    if (!edge) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      return;
    }
    if (!isEdgeSourceValid(ctx, edge)) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      return;
    }
    const v = getAnyNext(ctx, edge.from);
    if (!v) {
      ctx.validOutputs.delete(outputKey(node.id, 0));
      return;
    }
    const passed: Value =
      edge.inverted && v.kind === 'boolean'
        ? booleanValue(!v.b)
        : edge.inverted && v.kind === 'numeric'
          ? numericValue(-v.n, v.unitId)
          : v;
    ctx.next[node.id] = passed;
    ctx.validOutputs.add(outputKey(node.id, 0));

    const buf = ctx.observeBuffers[node.id] ? [...ctx.observeBuffers[node.id]!] : [];
    buf.push(passed);
    if (node.capacity.kind === 'bounded') {
      while (buf.length > node.capacity.size) buf.shift();
    }
    ctx.observeBuffers[node.id] = buf;
  },
};

/**
 * GeneratorNode 디스크립터 — 입력 없이 cursor를 진행하며 자신의 numeric을 emit.
 *
 * - propagate: ctx.generatorRuntime[node.id]를 보고 enabled=true면 paradigm.emit으로
 *   한 칸 진행해 ctx.next 갱신. enabled=false면 ctx.next는 건드리지 않아 기존 값
 *   (마지막 emit한 값)이 유지된다 — validOutputs도 유지.
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
  initialValue: () => undefined,
  initialValid: () => false,
  inputPortType: () => null,
  outputPortType: () => 'numeric',
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
    const existing = ctx.generatorRuntime[node.id];
    const runtime: GeneratorRuntime = existing ?? {
      enabled: false,
      cursor: ctx.generatorRegistry.initCursor(node.params),
    };
    if (!runtime.enabled) {
      // 정지 상태 — 마지막 값을 그대로 유지. ctx.next에 이미 기존 값이 들어 있고
      // validOutputs도 보존되므로 손대지 않는다.
      if (!existing) ctx.generatorRuntime[node.id] = runtime;
      return;
    }
    const { value, nextCursor } = ctx.generatorRegistry.emit(node.params, runtime.cursor);
    ctx.next[node.id] = value;
    ctx.validOutputs.add(outputKey(node.id, 0));
    ctx.generatorRuntime[node.id] = { enabled: true, cursor: nextCursor };
  },
};

export function createDefaultNodeKindRegistry(): NodeKindRegistry {
  return createNodeKindRegistry()
    .register(valueNodeDescriptor)
    .register(constantNodeDescriptor)
    .register(conditionNodeDescriptor)
    .register(comparisonNodeDescriptor)
    .register(logicGateNodeDescriptor)
    .register(observeNodeDescriptor)
    .register(expressionNodeDescriptor)
    .register(generatorNodeDescriptor);
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
 * 노드의 입력 PortType. null이면 입력을 받지 않는다.
 * 미등록 종류는 null로 안전 폴백.
 *
 * `model`을 주면 passthrough 노드(ObserveNode 등)가 입력 엣지의 source PortType을
 * 따라가 동적으로 PortType을 해석한다. 없으면 디스크립터의 정적 폴백.
 */
export function getInputPortType(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): ValueKind | null {
  const desc = registry.forNode(node);
  if (!desc) return null;
  return desc.inputPortType(node, model ? { model, registry } : undefined) ?? null;
}

/**
 * 노드의 출력 PortType. 미등록 종류는 'numeric'으로 안전 폴백 —
 * 1단계 호환성 검사가 통과하도록.
 *
 * `model`을 주면 passthrough 노드가 입력 엣지를 보고 동적으로 PortType을 해석.
 */
export function getOutputPortType(
  node: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): ValueKind {
  const desc = registry.forNode(node);
  if (!desc) return 'numeric';
  return desc.outputPortType(node, model ? { model, registry } : undefined);
}

export type EdgeCompatibility =
  | { compatible: true }
  | { compatible: false; reason: string };

/**
 * source → target 엣지의 PortType 호환성을 본다.
 *
 * 검사 항목:
 *  1. target이 입력을 받지 않는 종류면 거부 (Constant 등)
 *  2. source의 outputPortType과 target의 inputPortType이 다르면 거부
 *
 * 자동 변환은 없다 — numeric을 boolean으로(또는 그 반대) 흘리려면
 * 명시적 노드(ComparisonNode 등)를 끼워야 한다.
 */
export function checkEdgeCompatibility(
  source: Node,
  target: Node,
  registry: NodeKindRegistry = defaultNodeKindRegistry,
  model?: Model,
): EdgeCompatibility {
  // target이 입력 PortType이 비결정적인 passthrough(ObserveNode 미연결 상태 등)면
  // 어떤 source든 받아준다 — acceptsAnyInput=true 케이스. 첫 연결을 자유롭게 허용해
  // 이후 PortType이 그 source로 잠긴다.
  const targetDesc = registry.forNode(target);
  if (
    targetDesc?.acceptsAnyInput &&
    targetDesc.acceptsAnyInput(target, model ? { model, registry } : undefined)
  ) {
    return { compatible: true };
  }
  const targetIn = getInputPortType(target, registry, model);
  if (targetIn === null) {
    return {
      compatible: false,
      reason: `target node "${target.kind}" does not accept inputs`,
    };
  }
  const sourceOut = getOutputPortType(source, registry, model);
  if (sourceOut !== targetIn) {
    return {
      compatible: false,
      reason: `port type mismatch: source outputs "${sourceOut}", target expects "${targetIn}"`,
    };
  }
  return { compatible: true };
}
