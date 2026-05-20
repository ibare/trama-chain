import type { Node } from '../../../model/index.js';
import { numericValue } from '../../../model/index.js';
import { resolveUnit } from '../../../units/index.js';
import { isSequence, resolveScalar, unwrap } from '../../exec-value.js';
import { outputKey } from '../../state.js';
import { FREE_FALLBACK } from '../context.js';
import type { NodeKindDescriptor } from '../descriptor.js';

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
export const stockNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'stock' }>> = {
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
    ctx.setSlotInvalid(overflowKey);
    ctx.setSlotInvalid(rateKey);

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
    ctx.setSlotValid(levelKey);
  },
};
