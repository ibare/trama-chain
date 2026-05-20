import type { Node, Value, ValueKind } from '../../../model/index.js';
import {
  booleanValue,
  isValueNode,
  numericValue,
} from '../../../model/index.js';
import {
  isSequence,
  resolveScalar,
  unwrap,
  wrap,
  type ExecValue,
  type SequenceSample,
  type SequenceValue,
} from '../../exec-value.js';
import { observeBufferToArray } from '../../observe-buffer.js';
import { outputKey } from '../../state.js';
import { FREE_FALLBACK } from '../context.js';
import type { NodeKindDescriptor } from '../descriptor.js';
import {
  firstIncomingEdgeForNode,
  isEdgeSourceValid,
  passthroughSourceSpec,
} from '../internals.js';
import { isSequencePortSpec } from '../port-spec.js';

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
export const observeNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'observe' }>> = {
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
      ctx.setSlotInvalid(outputKey(node.id, 0));
      // 누적 추출은 본체가 stall 해도 이전 누적 스냅샷을 유지한다 — 다운스트림
      // 통계 노드가 마지막으로 보았던 분포를 잃지 않게. valid 도 그대로.
      return;
    }
    if (!isEdgeSourceValid(ctx, edge)) {
      ctx.setSlotInvalid(outputKey(node.id, 0));
      return;
    }
    // 메타 보존 passthrough — source 가 WrappedValue 면 알맹이만 inverted 변환 후
    // 메타를 재부착해 흘려보낸다. 평탄한 Value 면 기존 동작 그대로.
    const sourceNode = ctx.model.nodes[edge.from];
    const fallback: Value | undefined =
      sourceNode && isValueNode(sourceNode) ? sourceNode.initialValue : undefined;
    const sourceEv: ExecValue | undefined = ctx.next[edge.from] ?? fallback;
    if (!sourceEv) {
      ctx.setSlotInvalid(outputKey(node.id, 0));
      return;
    }
    // ObserveNode 는 스칼라만 passthrough — sequence source 는 port-compat 단계의
    // 별도 처리(차후 Phase) 대상. 안전망으로 무효 처리. FunctionHandle 은 ctx
    // 시각의 peek로 환원해 메타 없는 스칼라처럼 처리한다.
    if (isSequence(sourceEv)) {
      ctx.setSlotInvalid(outputKey(node.id, 0));
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
    ctx.setSlotValid(outputKey(node.id, 0));

    // observeBuffer 에는 (value, t) sample 로 누적 — t 는 현 step 의 simulation time.
    // 메타는 시각화/통계 모두 알맹이만 보면 충분하므로 메타 분리 후 알맹이만 박제.
    // bounded는 ring buffer로 O(1) push + 자동 evict, unbounded는 growable array.
    const sample: SequenceSample = { value: innerOut, t: ctx.simulationTimeMs };
    ctx.pushObserveSample(node, sample);

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
        samples: observeBufferToArray(ctx.observeBuffers[node.id]!),
      };
      ctx.emitSequence(extractionSlotKey, snapshot);
      ctx.markExtractionEmitted(node.id, ctx.simulationTimeMs);
    }
    // emit 하지 않으면 직전 스냅샷을 그대로 둔다 — 다운스트림이 stale 값을 계속
    // 본다는 의미가 아니라 "아직 다음 발사 시각이 안 됐다" 의 결정론적 표현.
  },
};
