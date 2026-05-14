import type { CombinerRegistry } from '../combiners/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import type { Edge, Model, Node, NodeId } from '../model/index.js';
import { isValueNode } from '../model/index.js';
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
  next: Record<NodeId, number>;
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
}

/**
 * 노드 종류별 동작을 한 곳에 모은 디스크립터.
 * 새 노드 종류 추가 시 디스크립터를 작성·등록하면 전파·초기화·피드백·단위
 * 해석이 모두 라우팅된다.
 */
export interface NodeKindDescriptor<N extends Node = Node> {
  kind: N['kind'];
  /** 초기 state.values에 기록할 값. undefined면 미기록(propagate 단계에서 채움). */
  initialValue(node: N): number | undefined;
  /** 초기 validOutputs(슬롯 0)에 포함시킬지. 단출력 노드 전제. */
  initialValid(node: N): boolean;
  /** 이 노드의 출력 단위. raw 통과(outputsRaw=true)여도 시각화·클램프 폴백용으로 의미가 있다. */
  outputUnit(node: N, catalog: UnitCatalog): ResolvedUnit;
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
  outputUnit: (node, catalog) => {
    const def = catalog.get(node.unitId);
    if (!def) return FREE_FALLBACK;
    return resolveUnit(def, node.unitOverride);
  },
  propagate: (node, ctx) => {
    const incoming = ctx.incoming;
    if (incoming.length === 0) return; // 입력 없음: 기존 값 유지

    const combiner = ctx.combinerRegistry.get(node.combiner);
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
      const sourceValue =
        ctx.next[edge.from] ?? (isValueNode(source) ? source.initialValue : 0);
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

    if (contributions.length === 0) return; // 모든 source 무효: 값 유지
    const combined = combiner.combine(contributions);
    // raw passthrough가 섞이면 target clamp 건너뜀(단위 미정의 의미 보존).
    ctx.next[node.id] = hasRawPassthrough ? combined : clampToUnit(combined, targetUnit);
    ctx.validOutputs.add(outputKey(node.id, 0));
  },
};

const constantNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'constant' }>> = {
  kind: 'constant',
  outputsRaw: true,
  canBeFeedbackTarget: false,
  initialValue: (node) => node.value,
  initialValid: () => true,
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
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
    let value: number | undefined;
    for (const edge of ctx.incoming) {
      const slot = edge.slotIndex;
      if (typeof slot !== 'number' || slot !== 0) continue;
      const source = ctx.model.nodes[edge.from];
      if (!source) continue;
      if (!isEdgeSourceValid(ctx, edge)) continue;
      value =
        ctx.next[edge.from] ?? (isValueNode(source) ? source.initialValue : 0);
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
      ctx.next[node.id] = value;
      ctx.validOutputs.add(outputKey(node.id, 0));
    } else {
      ctx.validOutputs.delete(outputKey(node.id, 0));
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
  initialValid: () => false,
  outputUnit: () => FREE_FALLBACK,
  propagate: (node, ctx) => {
    const arity = node.variables.length;
    if (arity === 0) {
      // 변수가 없는 상수식 — diagnose로 평가하여 실패 사유까지 적재.
      const diag = ctx.expressionEvaluator.diagnose(node.latex, {});
      if (diag.ok && Number.isFinite(diag.value)) {
        ctx.next[node.id] = diag.value;
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

    const bindings: Record<string, number> = {};
    const filled = new Array<boolean>(arity).fill(false);
    const missing: string[] = [];

    for (const edge of ctx.incoming) {
      const slot = edge.slotIndex;
      if (typeof slot !== 'number' || slot < 0 || slot >= arity) continue;
      if (filled[slot]) continue;
      const source = ctx.model.nodes[edge.from];
      if (!source) continue;
      if (!isEdgeSourceValid(ctx, edge)) continue;
      const value =
        ctx.next[edge.from] ?? (isValueNode(source) ? source.initialValue : 0);
      const varName = node.variables[slot];
      if (typeof varName !== 'string') continue;
      bindings[varName] = value;
      filled[slot] = true;
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
    ctx.next[node.id] = diag.value;
    ctx.validOutputs.add(outputKey(node.id, 0));
    delete ctx.invalidReasons[node.id];
  },
};

export function createDefaultNodeKindRegistry(): NodeKindRegistry {
  return createNodeKindRegistry()
    .register(valueNodeDescriptor)
    .register(constantNodeDescriptor)
    .register(conditionNodeDescriptor)
    .register(expressionNodeDescriptor);
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
