import type { Node } from '../../../model/index.js';
import {
  booleanValue,
  isNumericValue,
  numericValue,
} from '../../../model/index.js';
import {
  clamp01,
  clampToUnit,
  denormalize,
  normalize,
  resolveUnit,
} from '../../../units/index.js';
import { MissingCombinerError, MissingShapeError } from '../../errors.js';
import { outputKey } from '../../state.js';
import { FREE_FALLBACK, type PropagateContext } from '../context.js';
import type { NodeKindDescriptor } from '../descriptor.js';
import {
  getBooleanNext,
  getNumericNext,
  isEdgeSourceValid,
} from '../internals.js';
import { isIdentityShape } from '../port-spec.js';

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
    ctx.setSlotInvalid(outputKey(node.id, 0));
    return;
  }
  ctx.next[node.id] = booleanValue(combiner.combine(contributions));
  ctx.setSlotValid(outputKey(node.id, 0));
}

export const valueNodeDescriptor: NodeKindDescriptor<Extract<Node, { kind: 'value' }>> = {
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
      ctx.setSlotInvalid(outputKey(node.id, 0));
      return;
    }
    const combined = combiner.combine(contributions);
    // raw passthrough가 섞이면 target clamp 건너뜀(단위 미정의 의미 보존).
    const finalNumber = hasRawPassthrough ? combined : clampToUnit(combined, targetUnit);
    ctx.next[node.id] = numericValue(finalNumber, node.initialValue.unitId);
    ctx.setSlotValid(outputKey(node.id, 0));
  },
};
