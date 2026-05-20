import type { Node, Value, ValueKind } from '../model/index.js';
import { booleanValue, isValueNode, isNumericValue, numericValue } from '../model/index.js';
import type {
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
} from '../units/index.js';
import { MissingCombinerError, MissingShapeError } from './errors.js';
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
} from './observe-buffer.js';

import { outputKey } from './state.js';
import {
  FREE_FALLBACK,
  type ObserveExtractionRuntime,
  type PortTypeContext,
  type PropagateContext,
} from './kinds/context.js';
import {
  isIdentityShape,
  isSequencePortSpec,
  type OutputSlotSpec,
  type PortSpec,
  type ScalarPortSpec,
  type SequencePortSpec,
} from './kinds/port-spec.js';
import {
  checkEdgeCompatibility,
  type EdgeCompatibility,
} from './kinds/edge-compatibility.js';
import type { NodeKindDescriptor } from './kinds/descriptor.js';

// C1 (kinds-split): 분리된 4 모듈의 심볼을 public surface 보존 위해 re-export.
// 외부 (projector-web/embed) 가 `@trama/core` 에서 보던 이름은 그대로 유효.
export { FREE_FALLBACK, isIdentityShape, isSequencePortSpec, checkEdgeCompatibility };
export type {
  EdgeCompatibility,
  NodeKindDescriptor,
  ObserveExtractionRuntime,
  OutputSlotSpec,
  PortSpec,
  PortTypeContext,
  PropagateContext,
  ScalarPortSpec,
  SequencePortSpec,
};

// C2 (kinds-split): 분리된 3 모듈에서 필요한 심볼을 import.
// public surface 보존: getNodeOutputUnit/isRawOutputNode/canBeFeedbackTarget/
// getOutputSlots/getOutputSlotAt/getInputAccepts/getInputPortType/getOutputPortType
// 그리고 NodeKindRegistry/createNodeKindRegistry 를 그대로 re-export.
import {
  getNumericNext,
  getBooleanNext,
  isEdgeSourceValid,
  firstIncomingEdgeForNode,
  capacityMatches,
  passthroughSourceSpec,
} from './kinds/internals.js';
import {
  createNodeKindRegistry,
  type NodeKindRegistry,
} from './kinds/registry.js';
import {
  getNodeOutputUnit,
  isRawOutputNode,
  canBeFeedbackTarget,
  getOutputSlots,
  getOutputSlotAt,
  getInputAccepts,
  getInputPortType,
  getOutputPortType,
} from './kinds/queries.js';

export {
  createNodeKindRegistry,
  getNodeOutputUnit,
  isRawOutputNode,
  canBeFeedbackTarget,
  getOutputSlots,
  getOutputSlotAt,
  getInputAccepts,
  getInputPortType,
  getOutputPortType,
};
export type { NodeKindRegistry };

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
    { index: 0, value: 'numeric', meta: 'boolean', label: 'true', branching: true },
    { index: 1, value: 'numeric', meta: 'boolean', label: 'false', branching: true },
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
  outputSlots: () => [{ index: 0, value: 'boolean', branching: true }],
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
// firstIncomingEdgeForNode / capacityMatches / passthroughSourceSpec 는
// ./kinds/internals.js 로 이동 (C2).

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

// getNodeOutputUnit / isRawOutputNode / canBeFeedbackTarget /
// getOutputSlots / getOutputSlotAt / getInputAccepts /
// getInputPortType / getOutputPortType 는 ./kinds/queries.js 로 이동 (C2).

// EdgeCompatibility / checkEdgeCompatibility 는 ./kinds/edge-compatibility.js 로 이동 (C1).
