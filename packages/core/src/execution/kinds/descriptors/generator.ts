import type { Node } from '../../../model/index.js';
import type {
  GeneratorRuntime,
  OutputInterpolation,
} from '../../../generators/index.js';
import { defaultGeneratorRegistry } from '../../../generators/index.js';
import { asBooleanGate } from '../../exec-value.js';
import { outputKey } from '../../state.js';
import { FREE_FALLBACK } from '../context.js';
import type { NodeKindDescriptor } from '../descriptor.js';
import { isEdgeSourceValid } from '../internals.js';

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
export const generatorNodeDescriptor: NodeKindDescriptor<
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
