import type { StoreApi } from 'zustand';
import {
  outputKey,
  type ExecutionState,
  type ExecValue,
  type Model,
  type NodeId,
} from '@trama/core';
import { commitExecutionState } from './execution-commit.js';
import {
  selectCableMedium,
  selectIsSlotActive,
  selectSourceExecValue,
} from './edge-selectors.js';
import type { ModelStore } from './model-store.js';
import type { Pulse, PulseRegistry } from '../pulse/pulse-registry.js';
import type { TimeSettingsStore } from './time-settings.js';

/**
 * 펄스 발사(spawn) 정책의 단일 자리. EdgeView 가 `selectIs*` selectors 로 케이블
 * 활성/연속 source 판정의 진실을 가져가는 것처럼, store 의 *발사* 진실은 본 모듈이
 * 갖는다. createModelStore 의 책임에서 분리(L5-2) — 본문 mechanic 은 그대로,
 * deps 만 주입.
 *
 * deps:
 *  - store: 현재 모델/실행상태 조회 + slot valid/pending commit
 *  - timeSettingsStore: paused 가드의 단일 출처
 *  - pulseRegistry: 시각 펄스 spawn 백엔드 (이산 source)
 *  - getHandlePulseArrival: continuous source 의 즉시 도착(direct) 펄스 라우팅.
 *    *lazy getter* 인 이유 — handlePulseArrival 은 createModelStore 안 함수 선언으로
 *    factory 호출 시점에 아직 바인딩되지 않았을 수 있어, 호출 시점에 해소되도록
 *    한 단계 우회한다.
 *
 * 모듈 스코프 전역(예: `nextDirectPulseSerial = 0`) 은 두지 않는다 — factory closure
 * 내부 변수로 보관해 다중 인스턴스가 시리얼을 공유하지 않도록 한다. (rule-guard 권고)
 */
export interface SpawnPolicyDeps {
  store: StoreApi<ModelStore>;
  timeSettingsStore: TimeSettingsStore;
  pulseRegistry: PulseRegistry;
  getHandlePulseArrival: () => (pulse: Pulse) => void;
}

export interface SpawnPolicy {
  /**
   * 주어진 source 노드의 lag=0 outgoing edges 에 대해 펄스를 spawn.
   * lag=1 feedback 엣지는 제외. 출력 슬롯이 invalid 면 skip. playback 중이면
   * spawn 자체를 막는다.
   *
   * allowedSlots 가 주어지면 해당 슬롯 인덱스에 속한 outgoing edge 만 spawn —
   * 호출자가 "이번 step 에 실제로 갱신/emit 된 슬롯" 만 추려 넘기는 경로용.
   * ObserveNode 누적 추출처럼 throttle 미충족 step 에서 valid 가 *유지* 되는
   * 슬롯이 있어 valid 만 기준으로 하면 시각(펄스)이 실제 인과(emit)와 어긋난다.
   * 미지정이면 기존 동작 — 모든 valid outgoing 슬롯에 spawn.
   */
  spawnOutgoingPulses(
    model: Model,
    executionState: ExecutionState,
    sourceNodeId: NodeId,
    allowedSlots?: ReadonlySet<number>,
  ): void;

  /**
   * Stock 노드의 단일 슬롯에 대해 lag=0 outgoing 엣지를 순회하며 펄스를 spawn.
   * Stock 은 undulation medium source 라 시각 입자 없이 즉시 도착 Pulse 로 동기 propagate.
   * sourceValue 는 호출자가 명시 — slot 0=level, slot 1=overflow, slot 2=rate 가
   * 각각 다른 값이므로.
   */
  spawnStockSlotPulse(
    model: Model,
    stockId: NodeId,
    slot: 0 | 1 | 2,
    sourceValue: ExecValue,
  ): void;
}

export function createSpawnPolicy(deps: SpawnPolicyDeps): SpawnPolicy {
  const { store, timeSettingsStore, pulseRegistry, getHandlePulseArrival } = deps;
  // direct(즉시 도착) 펄스의 ID 시리얼. factory closure 에 보관 — 모듈 전역으로
  // 두면 동일 페이지의 다중 store 인스턴스가 시리얼을 공유해 결정성/디버깅
  // 추적이 깨진다.
  let nextDirectPulseSerial = 0;

  function spawnOutgoingPulses(
    model: Model,
    executionState: ExecutionState,
    sourceNodeId: NodeId,
    allowedSlots?: ReadonlySet<number>,
  ): void {
    // 정지(paused)면 어떤 경로로도 펄스가 흐르지 않는다 — 사용자의 명시적 ▶
    // 행위 전까지는 시간·값 전파 모두 침묵. 정지 중 mutation으로 인한 즉시
    // 박제와는 별개 — 시각·인과 전파만 차단한다.
    if (timeSettingsStore.getState().paused) return;
    if (store.getState().playbackStep !== null) return;
    // medium 결정은 selector 한 자리. 'undulation' (현재 sine paradigm 같은
    // continuous source 의 본체 슬롯) 은 매 tick 신호값이 변하는 흐름이라 시각적
    // "입자(펄스)" 시맨틱과 어울리지 않는다. EdgeView 가 stroke 변조로 흐름을
    // 표현하므로 시각 펄스는 띄우지 않고, 그래도 다운스트림 상태(예: ObserveNode
    // 누적 버퍼) 는 갱신되어야 하므로 즉시 도착한 합성 Pulse 로 동기 propagate 만
    // 수행. 'particle' 은 기존 시각 펄스 스폰.
    // slot 마다 평가 — SequencePortSpec 슬롯(예: 누적 추출) 은 같은 source 라도
    // particle 로 떨어지는 케이스가 있다.
    for (const eid of model.edgeOrder) {
      const e = model.edges[eid];
      if (!e || e.from !== sourceNodeId) continue;
      if ((e.lag ?? 0) !== 0) continue;
      const slot = e.sourceSlotIndex ?? 0;
      if (allowedSlots && !allowedSlots.has(slot)) continue;
      if (!selectIsSlotActive(executionState, sourceNodeId, slot)) continue;
      const sourceValue = selectSourceExecValue(executionState, sourceNodeId);
      if (!sourceValue) continue;
      const cableMedium = selectCableMedium(model, sourceNodeId, slot);
      if (cableMedium === 'undulation') {
        getHandlePulseArrival()({
          id: `direct-${nextDirectPulseSerial++}`,
          edgeId: eid,
          sourceNodeId,
          sourceSlotIndex: slot,
          targetNodeId: e.to,
          sourceValue,
          startTime: performance.now(),
          travelDurationMs: 0,
        });
        continue;
      }
      pulseRegistry.spawn({
        edgeId: eid,
        sourceNodeId,
        sourceSlotIndex: slot,
        targetNodeId: e.to,
        sourceValue,
      });
    }
  }

  function spawnStockSlotPulse(
    model: Model,
    stockId: NodeId,
    slot: 0 | 1 | 2,
    sourceValue: ExecValue,
  ): void {
    if (timeSettingsStore.getState().paused) return;
    if (store.getState().playbackStep !== null) return;
    // source slot 을 valid 로 켜고 pending 해제 — 펄스 발사 직전에 commit 해
    // EdgeView 의 isBranchingInactive selector 가 케이블을 solid 로 인식.
    // slot 0 (level) 은 handlePulseArrival stock 분기 setState 에서 이미 처리
    // 되지만, slot 1 (overflow)/ slot 2 (rate) 는 본 캡슐화가 단일 진입점.
    store.setState((s) => {
      const slotKey = outputKey(stockId, slot);
      if (
        s.executionState.validOutputs.has(slotKey) &&
        !s.executionState.pendingOutputs.has(slotKey)
      ) {
        return {};
      }
      const newValid = new Set(s.executionState.validOutputs);
      newValid.add(slotKey);
      const newPending = new Set(s.executionState.pendingOutputs);
      newPending.delete(slotKey);
      return {
        executionState: commitExecutionState(s.executionState, {
          validOutputs: newValid,
          pendingOutputs: newPending,
        }),
      };
    });
    const handlePulseArrival = getHandlePulseArrival();
    for (const eid of model.edgeOrder) {
      const e = model.edges[eid];
      if (!e || e.from !== stockId) continue;
      if ((e.lag ?? 0) !== 0) continue;
      if ((e.sourceSlotIndex ?? 0) !== slot) continue;
      handlePulseArrival({
        id: `direct-${nextDirectPulseSerial++}`,
        edgeId: eid,
        sourceNodeId: stockId,
        sourceSlotIndex: slot,
        targetNodeId: e.to,
        sourceValue,
        startTime: performance.now(),
        travelDurationMs: 0,
      });
    }
  }

  return { spawnOutgoingPulses, spawnStockSlotPulse };
}
