import type { StoreApi } from 'zustand';
import {
  defaultGeneratorRegistry,
  isGeneratorNode,
  outputKey,
  type ExecValue,
  type GeneratorRuntime,
  type Model,
  type NodeId,
} from '@trama-chain/core';
import { commitExecutionState } from './execution-commit.js';
import type { ModelStore } from './model-store.js';
import type { AnimationLoop } from '../canvas/animation-loop.js';
import type { NodeFlashRegistry } from '../pulse/node-flash-registry.js';
import type { SpawnPolicy } from './spawn-policy.js';
import type { TimeSettingsStore } from './time-settings.js';

/**
 * 시뮬레이션 시간축의 단일 출처 — RAF 단일 클락에 결속된 1급 시간축의 step 단위.
 * 60Hz 정합. 한 시뮬레이션 step 마다 propagate 가 호출되고 simulationTimeMs 가
 * 이 값만큼 진행한다. 배속(multiplier)은 dt 에 곱하지 않는다 — accumulator 가
 * 빠르게 차서 한 RAF 안에서 step 횟수가 늘어나는 방식으로 흡수한다.
 */
const FIXED_DT_MS = 1000 / 60;

/**
 * spiral-of-death 회피 — propagate 비용이 FIXED_DT_MS 를 넘으면 accumulator 가
 * 영원히 못 따라잡는다. 누적량과 한 RAF 당 step 횟수에 상한을 둬 시뮬레이션이
 * 벽시간 대비 *느려지는* 안전한 fallback 으로 수렴.
 */
const MAX_ACCUM_MS = 250;
const MAX_STEPS_PER_RAF = 8;

/**
 * 시뮬레이션 클락 + RAF 펌프의 단일 자리 (L5-4). createModelStore 의 책임에서
 * 분리. tickGenerators / rafSimulationStep / start·stop·reconcile 가 한 모듈에
 * 캡슐화되어 accumulator state(simAccumMs, lastWallNowMs) 와 ticker 등록 상태가
 * 모듈 closure 안에서만 가시.
 *
 * 외부 표면은 3 함수만:
 *  - startSimulationLoopIfNeeded — pausedTransitionHandler 진입 시
 *  - stopSimulationLoop — paused 진입 / reset
 *  - reconcileSimulationLoop — mutation actions 직후
 *
 * tickGenerators / rafSimulationStep 은 내부 전용 — 외부 호출 경로 없음.
 */
export interface SimulationLoopDeps {
  store: StoreApi<ModelStore>;
  timeSettingsStore: TimeSettingsStore;
  animationLoop: AnimationLoop;
  nodeFlashRegistry: NodeFlashRegistry;
  spawnOutgoingPulses: SpawnPolicy['spawnOutgoingPulses'];
}

export interface SimulationLoop {
  startSimulationLoopIfNeeded(): void;
  stopSimulationLoop(): void;
  reconcileSimulationLoop(): void;
}

export function createSimulationLoop(deps: SimulationLoopDeps): SimulationLoop {
  const { store, timeSettingsStore, animationLoop, nodeFlashRegistry, spawnOutgoingPulses } =
    deps;

  let unregisterSimulationTicker: (() => void) | null = null;
  let simAccumMs = 0;
  let lastWallNowMs: number | null = null;

  /**
   * 한 generator 가 실제로 이번 tick 에 emit 해야 하는지.
   *
   * 시맨틱은 [[generatorNodeDescriptor]] propagate 와 동일:
   *  - 입력 미연결: 항상 emit (글로벌 paused 가 시간의 단일 출처)
   *  - 입력 연결: incoming boolean 이 true 여야 emit. invalid·boolean 아님이면 freeze
   *
   * 입력 연결: `rt.gateOpen` 캐시만 본다 — `executionState.values[source]` 를
   * 직접 읽으면 펄스 도착 전에 ticker 가 그래프 변화를 감지해 효과가 사후 펄스보다
   * 먼저 발현되는 비대칭 버그가 생긴다. 캐시는 펄스 도착 시점에만 갱신된다.
   */
  function isGeneratorEffectivelyEnabled(
    model: Model,
    executionState: ModelStore['executionState'],
    nid: NodeId,
  ): boolean {
    const rt = executionState.generatorRuntime[nid];
    if (!rt) return false;
    const hasIncoming = model.edgeOrder.some((eid) => {
      const e = model.edges[eid];
      return !!e && e.to === nid && e.lag === 0;
    });
    if (!hasIncoming) return true;
    return rt.gateOpen === true;
  }

  function tickGenerators(): void {
    const { model, executionState, playbackStep } = store.getState();
    if (playbackStep !== null) return;
    // 시뮬레이션 시간은 generator 유무와 무관하게 paused=false 동안 항상 진행한다.
    // RAF 루프가 시뮬레이션 시간축의 유일한 출처. generator emit 은 그 시간 안에서
    // 일어나는 부수 효과로, gate 조건을 만족하는 generator 가 있을 때만 함께 갱신된다.
    const stepDelta = FIXED_DT_MS;
    const nextSimulationTimeMs = executionState.simulationTimeMs + stepDelta;
    const newValues: Record<NodeId, ExecValue> = { ...executionState.values };
    const newValid = new Set(executionState.validOutputs);
    const newRuntime: Record<NodeId, GeneratorRuntime> = {
      ...executionState.generatorRuntime,
    };
    const emittedIds: NodeId[] = [];
    for (const nid in executionState.generatorRuntime) {
      const rt = executionState.generatorRuntime[nid];
      if (!rt) continue;
      const node = model.nodes[nid];
      if (!node || !isGeneratorNode(node)) continue;
      if (!isGeneratorEffectivelyEnabled(model, executionState, nid)) {
        // freeze 동안에도 cursor 의 시간 필드는 sim 시간에 동기화 — gate 해제 시
        // drift-free 스케줄 paradigm 이 catch-up 폭주하지 않도록 paradigm 에 위임.
        // gateOpen 캐시는 펄스 도착 시점에만 갱신되므로 여기서는 건드리지 않는다.
        const resynced = defaultGeneratorRegistry.resyncCursor(
          node.params,
          rt.cursor,
          nextSimulationTimeMs,
        );
        newRuntime[nid] = { cursor: resynced, gateOpen: rt.gateOpen };
        continue;
      }
      const { value, nextCursor } = defaultGeneratorRegistry.emit(
        node.params,
        rt.cursor,
        nextSimulationTimeMs,
      );
      // value=undefined 는 paradigm 이 freeze 한 경우(스텝 t<startMs 등).
      // values/validOutputs 를 건드리지 않아 이전 상태를 유지하고 cursor 만 진행.
      // 다운스트림 펄스도 띄우지 않는다.
      if (value !== undefined) {
        newValues[nid] = value;
        newValid.add(outputKey(nid, 0));
        emittedIds.push(nid);
      }
      // gateOpen 캐시는 펄스로만 갱신되는 단일 진입 — ticker tick 에서 드롭하면
      // 다음 tick 에 게이트 false 로 평가돼 emit 이 멈춘다 (ticker 자체는 계속
      // 시간만 진행).
      newRuntime[nid] = { cursor: nextCursor, gateOpen: rt.gateOpen };
    }
    store.setState((s) => ({
      executionState: commitExecutionState(s.executionState, {
        values: newValues,
        validOutputs: newValid,
        generatorRuntime: newRuntime,
        simulationTimeMs: s.executionState.simulationTimeMs + stepDelta,
      }),
    }));
    if (emittedIds.length === 0) return;
    const latest = store.getState();
    for (const nid of emittedIds) {
      nodeFlashRegistry.trigger(nid);
      spawnOutgoingPulses(latest.model, latest.executionState, nid);
    }
  }

  /**
   * 매 RAF 에서 호출되는 시뮬레이션 step 펌프.
   *
   * wallDt 를 측정 → multiplier 곱해 simAccumMs 에 누적 → FIXED_DT_MS 단위로 잘라
   * 가능한 만큼 tickGenerators 호출. 한 RAF 에서 propagate 가 너무 많이 일어나
   * 프레임이 막히는 spiral-of-death 는 MAX_ACCUM_MS·MAX_STEPS_PER_RAF 로 막는다.
   *
   * paused=true 동안은 wallDt 추적만 유지(다음 resume 시 첫 frame 이 큰 점프를
   * 만들지 않도록) accumulator 는 0 으로 리셋. unregister 하지 않고 분기로 처리해
   * paused 토글의 부수 효과(register/unregister 무한 토글)를 피한다.
   */
  function rafSimulationStep(): void {
    const now = performance.now();
    if (lastWallNowMs === null) {
      lastWallNowMs = now;
      return;
    }
    const wallDt = now - lastWallNowMs;
    lastWallNowMs = now;
    if (timeSettingsStore.getState().paused) {
      simAccumMs = 0;
      return;
    }
    if (store.getState().playbackStep !== null) {
      simAccumMs = 0;
      return;
    }
    const multiplier = timeSettingsStore.getState().stepSpeedMultiplier;
    const effectiveMult = multiplier > 0 ? multiplier : 1;
    simAccumMs = Math.min(simAccumMs + wallDt * effectiveMult, MAX_ACCUM_MS);
    let steps = 0;
    while (simAccumMs >= FIXED_DT_MS && steps < MAX_STEPS_PER_RAF) {
      tickGenerators();
      simAccumMs -= FIXED_DT_MS;
      steps++;
    }
  }

  function startSimulationLoopIfNeeded(): void {
    if (unregisterSimulationTicker !== null) return;
    if (timeSettingsStore.getState().paused) return;
    lastWallNowMs = null;
    simAccumMs = 0;
    unregisterSimulationTicker = animationLoop.register(rafSimulationStep);
  }

  function stopSimulationLoop(): void {
    if (unregisterSimulationTicker !== null) {
      unregisterSimulationTicker();
      unregisterSimulationTicker = null;
    }
    lastWallNowMs = null;
    simAccumMs = 0;
  }

  /**
   * 모델·실행상태 변이 후 시뮬레이션 루프 상태를 reconcile.
   *
   * on/off 의 진실의 출처는 paused 상태 — generator 유무와 무관하다.
   * 변이 후에도 paused=false 면 루프가 계속 돌아야 시뮬레이션 시간이 진행된다.
   */
  function reconcileSimulationLoop(): void {
    if (timeSettingsStore.getState().paused) stopSimulationLoop();
    else startSimulationLoopIfNeeded();
  }

  return { startSimulationLoopIfNeeded, stopSimulationLoop, reconcileSimulationLoop };
}
