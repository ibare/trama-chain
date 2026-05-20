import type { Node, Value } from '../../../model/index.js';
import { isValueNode, numericValue } from '../../../model/index.js';
import { isSequence, resolveScalar, unwrap } from '../../exec-value.js';
import { outputKey } from '../../state.js';
import { FREE_FALLBACK } from '../context.js';
import type { NodeKindDescriptor } from '../descriptor.js';
import { isEdgeSourceValid } from '../internals.js';

/**
 * 식 노드 디스크립터.
 *
 * 동작:
 *   1. `node.variables`가 곧 입력 슬롯 — 각 슬롯 인덱스에 들어온 값을 변수 이름에 바인딩.
 *   2. 모든 변수가 채워져야 평가. 일부라도 비면 invalid.
 *   3. 평가자는 외부 주입 (`ctx.expressionEvaluator`). 미주입이면 noop으로 undefined.
 *   4. 결과는 raw — 단위 변환 없이 흘려보낸다.
 */
export const expressionNodeDescriptor: NodeKindDescriptor<
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
