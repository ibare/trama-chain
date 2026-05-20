import type { Node, Value, ValueKind } from '../model/index.js';
import { booleanValue, isValueNode, numericValue } from '../model/index.js';
import type {
  GeneratorRuntime,
  OutputInterpolation,
} from '../generators/index.js';
import { defaultGeneratorRegistry } from '../generators/index.js';
import { resolveUnit } from '../units/index.js';
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

// C3 (kinds-split): scalar/raw 디스크립터 5종을 descriptors/ 로 분리.
// 디스크립터 본문은 더 이상 이 파일에 없고, register 호출만 createDefault... 에 남는다.
import { valueNodeDescriptor } from './kinds/descriptors/value.js';
import { constantNodeDescriptor } from './kinds/descriptors/constant.js';
import { conditionNodeDescriptor } from './kinds/descriptors/condition.js';
import { expressionNodeDescriptor } from './kinds/descriptors/expression.js';
import { logicGateNodeDescriptor } from './kinds/descriptors/logic-gate.js';

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
