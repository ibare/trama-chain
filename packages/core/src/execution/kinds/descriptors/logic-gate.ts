import type { Node } from '../../../model/index.js';
import { booleanValue } from '../../../model/index.js';
import { MissingCombinerError } from '../../errors.js';
import { outputKey } from '../../state.js';
import { FREE_FALLBACK } from '../context.js';
import type { NodeKindDescriptor } from '../descriptor.js';
import { getBooleanNext, isEdgeSourceValid } from '../internals.js';

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
export const logicGateNodeDescriptor: NodeKindDescriptor<
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
