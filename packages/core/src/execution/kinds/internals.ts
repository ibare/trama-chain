import type { Edge, Model, Node, NodeId } from '../../model/index.js';
import { isValueNode, isNumericValue } from '../../model/index.js';
import { isSequence, resolveScalar, unwrap } from '../exec-value.js';
import type { ObserveBuffer } from '../observe-buffer.js';
import { outputKey } from '../state.js';
import type { PortTypeContext, PropagateContext } from './context.js';
import {
  isSequencePortSpec,
  type PortSpec,
} from './port-spec.js';
import { getOutputSlots } from './queries.js';

/**
 * propagate 컨텍스트에서 source 노드의 현재 numeric value를 꺼낸다.
 * - ctx.next에 기록돼 있으면 그것 (Value sum type 중 numeric만 인정).
 * - WrappedValue 면 알맹이 Value 로 unwrap 후 검사.
 * - 없으면 ValueNode의 initialValue에서 폴백.
 * - boolean Value거나 미기록이면 undefined — caller가 skip해야 한다.
 */
export function getNumericNext(ctx: PropagateContext, id: NodeId): number | undefined {
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
export function getBooleanNext(ctx: PropagateContext, id: NodeId): boolean | undefined {
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

/** edge의 source가 가리키는 출력 슬롯이 현재 valid한지. */
export function isEdgeSourceValid(ctx: PropagateContext, edge: Edge): boolean {
  const slot = edge.sourceSlotIndex ?? 0;
  return ctx.validOutputs.has(outputKey(edge.from, slot));
}

/** 노드의 첫 incoming lag=0 엣지. ObserveNode passthrough 등이 사용. */
export function firstIncomingEdgeForNode(model: Model, id: NodeId): Edge | undefined {
  for (const eid of model.edgeOrder) {
    const e = model.edges[eid];
    if (e && e.to === id && e.lag === 0) return e;
  }
  return undefined;
}

/** 기존 버퍼의 capacity 정책이 현재 모델 설정과 일치하는지. */
export function capacityMatches(
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
export function passthroughSourceSpec(
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
