import type { Node } from '../../../model/index.js';
import { outputKey } from '../../state.js';
import { FREE_FALLBACK } from '../context.js';
import type { NodeKindDescriptor } from '../descriptor.js';

export const constantNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'constant' }>> = {
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
