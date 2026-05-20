import type { Node } from '../../../model/index.js';
import { numericValue } from '../../../model/index.js';
import { outputKey } from '../../state.js';
import { FREE_FALLBACK } from '../context.js';
import type { NodeKindDescriptor } from '../descriptor.js';
import { isEdgeSourceValid } from '../internals.js';

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
export const averageNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'average' }>> = {
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
