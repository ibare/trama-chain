import type { Node, Value } from '../../../model/index.js';
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
} from '../../exec-value.js';
import { outputKey } from '../../state.js';
import { FREE_FALLBACK } from '../context.js';
import type { NodeKindDescriptor } from '../descriptor.js';
import { getNumericNext, isEdgeSourceValid } from '../internals.js';

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
export const conditionNodeDescriptor: NodeKindDescriptor<
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
      ctx.setSlotInvalid(trueSlot);
      ctx.setSlotInvalid(falseSlot);
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
      ctx.setSlotValid(trueSlot);
      ctx.setSlotInvalid(falseSlot);
    } else {
      ctx.setSlotInvalid(trueSlot);
      ctx.setSlotValid(falseSlot);
    }
  },
};
