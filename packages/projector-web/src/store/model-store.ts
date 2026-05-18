import { create, type StoreApi, type UseBoundStore } from 'zustand';
import {
  addAverageNode as addAverageNodeOp,
  addConditionNode as addConditionNodeOp,
  addLogicGateNode as addLogicGateNodeOp,
  addObserveNode as addObserveNodeOp,
  addConstantNode as addConstantNodeOp,
  addEdge as addEdgeOp,
  addExpressionNode as addExpressionNodeOp,
  addGeneratorNode as addGeneratorNodeOp,
  addValueNode as addValueNodeOp,
  buildTopology,
  createEmptyModel,
  defaultGeneratorRegistry,
  executeModel,
  hasFeedbackEdges,
  initializeFromInitialValues,
  isConditionNode,
  isExpressionNode,
  isGeneratorNode,
  isLogicGateNode,
  modelToDocument,
  outputKey,
  propagateOneStep,
  recomputeNode,
  removeEdge as removeEdgeOp,
  removeNode as removeNodeOp,
  serializeTrama,
  setExecution as setExecutionOp,
  setQuestion as setQuestionOp,
  updateEdge as updateEdgeOp,
  updateNode as updateNodeOp,
} from '@trama/core';
import type {
  AddAverageNodeInput,
  AddConditionNodeInput,
  AddConstantNodeInput,
  AddLogicGateNodeInput,
  AddObserveNodeInput,
  AddEdgeInput,
  AddExpressionNodeInput,
  AddGeneratorNodeInput,
  AddValueNodeInput,
  Edge,
  EdgeId,
  ExecutionState,
  ExecValue,
  GeneratorRuntime,
  Model,
  Node,
  NodeId,
  NodePatch,
  Value,
} from '@trama/core';
import { asBooleanGate, booleanValue, isNumericValue, isValueNode, numericValue } from '@trama/core';
import { tokens } from '@trama/tokens';
import { combinerRegistry, shapeRegistry } from './registries.js';
import { fizzexExpressionEvaluator } from '../expression/fizzex-evaluator.js';
import type { PulseRegistry, Pulse } from '../pulse/pulse-registry.js';
import type { NodeFlashRegistry } from '../pulse/node-flash-registry.js';
import type { TimeSettingsStore } from './time-settings.js';

const STEP_TICK_MS = parseFloat(tokens.motion.durationStepTick);

export interface ModelStore {
  model: Model;
  /** propagation/iteration 결과의 최종 상태(가장 마지막 timestep). UI는 이걸 본다. */
  executionState: ExecutionState;
  /** N-step trajectory (steps>1일 때만 의미). */
  trajectory: ExecutionState[];
  /** 재생 중이면 현재 step index(0..N-1), 아니면 null. */
  playbackStep: number | null;

  // commands ---------------------------------------------------------------
  setModel: (next: Model) => void;
  recompute: () => void;
  loadFromJson: (json: string) => boolean;
  exportToJson: () => string;

  /**
   * 노드 추가 류. 정지(paused) 상태에서만 동작 — 재생 중에는 모델 편집이 잠겨
   * `null`을 반환한다. UI는 paused일 때 진입을 차단해 도달 자체를 막아야 하며,
   * 본 가드는 우회 경로에 대한 안전망.
   */
  addNode: (input: AddValueNodeInput) => Node | null;
  addConstantNode: (input: AddConstantNodeInput) => Node | null;
  addConditionNode: (input: AddConditionNodeInput) => Node | null;
  addLogicGateNode: (input: AddLogicGateNodeInput) => Node | null;
  addObserveNode: (input: AddObserveNodeInput) => Node | null;
  addExpressionNode: (input: AddExpressionNodeInput) => Node | null;
  addGeneratorNode: (input: AddGeneratorNodeInput) => Node | null;
  addAverageNode: (input: AddAverageNodeInput) => Node | null;
  updateNode: (id: NodeId, patch: NodePatch) => void;
  removeNode: (id: NodeId) => void;

  /** GeneratorNode 시작(true)/정지(false). cursor와 마지막 값은 그대로 유지. */
  setGeneratorEnabled: (id: NodeId, enabled: boolean) => void;
  /** GeneratorNode 초기 상태로. cursor를 params로 재초기화하고 enabled=false. */
  resetGenerator: (id: NodeId) => void;

  addEdge: (input: AddEdgeInput) => Edge | null;
  updateEdge: (id: EdgeId, patch: Partial<Omit<Edge, 'id'>>) => void;
  removeEdge: (id: EdgeId) => void;

  setQuestion: (q: string | null) => void;
  setExecution: (e: Partial<Model['execution']>) => void;

  /** 노드 값 스크럽: 펄스 spawn 트리거 + 즉시 값 반영. */
  scrubInitialValue: (id: NodeId, nextValue: number | boolean) => void;

  /** trajectory를 step-by-step 애니메이션 재생 (§ 11.7). feedback 모델에서만 의미. */
  play: () => void;

  /**
   * 시뮬레이션 전체 리셋. 모델(노드/엣지/initialValue)은 보존, 실행상태만 초기화.
   * simulationTimeMs=0, generator cursor 재초기화, observe 누적·sequence 비움,
   * in-flight 펄스 제거, ticker/playback 정지.
   */
  resetSimulation: () => void;
}

export type ModelStoreInstance = UseBoundStore<StoreApi<ModelStore>>;

export interface ModelStoreDeps {
  pulseRegistry: PulseRegistry;
  nodeFlashRegistry: NodeFlashRegistry;
  timeSettingsStore: TimeSettingsStore;
}

/** Node patch가 propagation 결과에 영향을 줄 수 있는 필드를 포함하는지. */
function patchAffectsValues(patch: NodePatch): boolean {
  const p = patch as Record<string, unknown>;
  return (
    'initialValue' in p ||
    'value' in p ||
    'unitId' in p ||
    'unitOverride' in p ||
    'combiner' in p ||
    'isFocal' in p ||
    'latex' in p ||
    'variables' in p ||
    'operator' in p ||
    'params' in p
  );
}

function computeExecutionState(
  model: Model,
  prior?: ExecutionState,
  paused: boolean = true,
  priorModel?: Model,
): {
  executionState: ExecutionState;
  trajectory: ExecutionState[];
} {
  let fresh: { executionState: ExecutionState; trajectory: ExecutionState[] };
  try {
    const traj = executeModel(model, {
      shapeRegistry,
      combinerRegistry,
      expressionEvaluator: fizzexExpressionEvaluator,
      paused,
    });
    fresh = { executionState: traj[traj.length - 1]!, trajectory: traj };
  } catch {
    const init = initializeFromInitialValues(model);
    fresh = { executionState: init, trajectory: [init] };
  }
  if (!prior) return fresh;
  // 생성기 런타임(enabled·cursor)과 마지막 emit 값은 모델 편집으로 리셋되면 안 된다.
  // paradigm kind가 바뀌었다면 fresh가 params에 맞게 초기화한 cursor를 쓴다.
  const mergedRuntime: Record<NodeId, GeneratorRuntime> = {};
  const mergedValues: Record<NodeId, ExecValue> = { ...fresh.executionState.values };
  const mergedValid = new Set(fresh.executionState.validOutputs);
  const mergedPending = new Set(fresh.executionState.pendingOutputs);
  // ValueNode 의 "마지막 수신값" 은 모델 편집으로 리셋되지 않는다 — 멈춤 상태에서
  // source(scrub) 가 바뀌어도 펄스가 아직 도착하지 않은 것이므로 target 의 직전
  // 수신값이 유지돼야 한다. 단, "prior valid" 가 last-received 인지 단순한
  // initialValue 권위인지 구분이 필요하다. priorModel 에서도 같은 노드가 lag=0
  // incoming 을 갖고 있던 경우만 "수신값" 으로 간주 — 새로 엣지가 추가된 경우엔
  // initialValue 권위였을 뿐이므로 pending 으로 두고 첫 펄스 도착을 기다린다.
  if (priorModel) {
    const priorLag0Targets = new Set<NodeId>();
    for (const eid of priorModel.edgeOrder) {
      const e = priorModel.edges[eid];
      if (!e) continue;
      if ((e.lag ?? 0) !== 0) continue;
      priorLag0Targets.add(e.to);
    }
    for (const nid of model.nodeOrder) {
      const node = model.nodes[nid];
      if (!node || !isValueNode(node)) continue;
      const slot = outputKey(nid, 0);
      if (!fresh.executionState.pendingOutputs.has(slot)) continue;
      if (!priorLag0Targets.has(nid)) continue;
      const priorVal = prior.values[nid];
      if (priorVal === undefined) continue;
      if (!prior.validOutputs.has(slot)) continue;
      mergedValues[nid] = priorVal;
      mergedValid.add(slot);
      mergedPending.delete(slot);
    }
  }
  // ObserveNode 누적·throttle 런타임·sequence 슬롯 출력은 모델 편집(엣지 추가
  // 등) 으로 리셋되면 안 된다. executeModel 은 initializeFromInitialValues 에서
  // 빈 버퍼로 시작하므로 fresh 만 쓰면 한 step 분량만 남는다. prior 에 있던
  // 살아있는 노드/슬롯의 버퍼를 그대로 채택.
  const mergedObserveBuffers = { ...fresh.executionState.observeBuffers };
  for (const [nid, buf] of Object.entries(prior.observeBuffers ?? {})) {
    if (!model.nodes[nid]) continue;
    mergedObserveBuffers[nid] = buf;
  }
  const mergedExtractionRuntime = { ...fresh.executionState.observeExtractionRuntime };
  for (const [nid, rt] of Object.entries(prior.observeExtractionRuntime ?? {})) {
    if (!model.nodes[nid]) continue;
    mergedExtractionRuntime[nid] = rt;
  }
  const mergedSequenceOutputs = { ...fresh.executionState.sequenceOutputs };
  for (const [key, seq] of Object.entries(prior.sequenceOutputs ?? {})) {
    const colon = key.lastIndexOf(':');
    const nid = colon >= 0 ? key.slice(0, colon) : key;
    if (!model.nodes[nid]) continue;
    mergedSequenceOutputs[key] = seq;
  }
  for (const nid in fresh.executionState.generatorRuntime) {
    const node = model.nodes[nid];
    if (!node || !isGeneratorNode(node)) continue;
    const priorRt = prior.generatorRuntime[nid];
    const freshRt = fresh.executionState.generatorRuntime[nid]!;
    if (priorRt && priorRt.cursor.kind === freshRt.cursor.kind) {
      // cursor·enabled는 prior에서 유지(사용자 토글/진행 상태 보존), gateOpen은
      // 모델 편집 후 새 source 토폴로지를 반영한 fresh 쪽을 채택.
      mergedRuntime[nid] = {
        enabled: priorRt.enabled,
        cursor: priorRt.cursor,
        gateOpen: freshRt.gateOpen,
      };
      const priorVal = prior.values[nid];
      if (priorVal) {
        mergedValues[nid] = priorVal;
        if (prior.validOutputs.has(outputKey(nid, 0))) {
          mergedValid.add(outputKey(nid, 0));
        }
      }
    } else {
      mergedRuntime[nid] = freshRt;
    }
  }
  return {
    executionState: {
      ...fresh.executionState,
      values: mergedValues,
      validOutputs: mergedValid,
      pendingOutputs: mergedPending,
      generatorRuntime: mergedRuntime,
      observeBuffers: mergedObserveBuffers,
      observeExtractionRuntime: mergedExtractionRuntime,
      sequenceOutputs: mergedSequenceOutputs,
    },
    trajectory: fresh.trajectory,
  };
}

export function createModelStore({
  pulseRegistry,
  nodeFlashRegistry,
  timeSettingsStore,
}: ModelStoreDeps): ModelStoreInstance {
  const initial = createEmptyModel();
  const initialExec = computeExecutionState(initial);
  let activePlaybackToken = 0;
  let playbackTimeoutId: number | null = null;

  /**
   * 모델 편집 가능 여부 — paused일 때만 true. 재생 중에는 console.warn 후 false.
   * 단일 진입점으로 모든 mutation 액션이 통과해 "정지 중에만 편집"을 강제한다.
   * UI는 paused일 때 진입 차단으로 도달 자체를 막고, 본 가드는 우회 경로 안전망.
   */
  function assertEditable(): boolean {
    if (timeSettingsStore.getState().paused) return true;
    console.warn(
      '[trama] 재생 중에는 모델 편집이 잠겨 있습니다. ⏸ 후 시도해주세요.',
    );
    return false;
  }

  /**
   * GeneratorNode step ticker — enabled가 1개라도 있으면 STEP_TICK_MS 주기로
   * 모든 enabled generator를 한 칸씩 진행시킨다. 트라마 전역 step과 동기.
   *
   * propagateOneStep을 거치지 않고 paradigm.emit으로 cursor만 진행한 뒤 펄스를
   * spawn — 다운스트림 갱신은 기존 펄스 hot-path가 담당하므로 펄스 시각화·flash가
   * 자연스럽게 흐른다.
   */
  let generatorTicker: number | null = null;

  /**
   * 한 generator가 실제로 이번 tick에 emit해야 하는지.
   *
   * 시맨틱은 [[generatorNodeDescriptor]] propagate와 동일:
   *  - 입력 미연결: runtime.enabled (사용자 ▶ 토글) 사용
   *  - 입력 연결: incoming boolean이 true여야 emit. invalid·boolean 아님이면 freeze
   *
   * 입력 미연결: 사용자 토글(`rt.enabled`).
   * 입력 연결: `rt.gateOpen` 캐시만 본다 — `executionState.values[source]`를
   * 직접 읽으면 펄스 도착 전에 ticker가 그래프 변화를 감지해 효과가 사후 펄스보다
   * 먼저 발현되는 비대칭 버그가 생긴다. 캐시는 펄스 도착 시점에만 갱신된다.
   */
  function isGeneratorEffectivelyEnabled(
    model: ReturnType<typeof store.getState>['model'],
    executionState: ReturnType<typeof store.getState>['executionState'],
    nid: NodeId,
  ): boolean {
    const rt = executionState.generatorRuntime[nid];
    if (!rt) return false;
    const hasIncoming = model.edgeOrder.some((eid) => {
      const e = model.edges[eid];
      return !!e && e.to === nid && e.lag === 0;
    });
    if (!hasIncoming) return rt.enabled;
    return rt.gateOpen === true;
  }

  function tickGenerators(): void {
    const { model, executionState, playbackStep } = store.getState();
    if (playbackStep !== null) return;
    // 시뮬레이션 시간은 generator 유무와 무관하게 paused=false 동안 항상 진행한다.
    // ticker는 시뮬레이션 시간축의 유일한 출처. generator emit은 그 시간 안에서
    // 일어나는 부수 효과로, enabled generator가 있을 때만 함께 갱신된다.
    const stepDelta = currentStepIntervalMs();
    const newValues: Record<NodeId, ExecValue> = { ...executionState.values };
    const newValid = new Set(executionState.validOutputs);
    const newRuntime: Record<NodeId, GeneratorRuntime> = {
      ...executionState.generatorRuntime,
    };
    const emittedIds: NodeId[] = [];
    for (const nid in executionState.generatorRuntime) {
      const rt = executionState.generatorRuntime[nid];
      if (!rt) continue;
      if (!isGeneratorEffectivelyEnabled(model, executionState, nid)) continue;
      const node = model.nodes[nid];
      if (!node || !isGeneratorNode(node)) continue;
      const { value, nextCursor } = defaultGeneratorRegistry.emit(node.params, rt.cursor);
      newValues[nid] = value;
      newValid.add(outputKey(nid, 0));
      // runtime.enabled는 사용자 토글 의도를 보존. gateOpen 캐시는 펄스로만 갱신되는
      // 단일 진입 — ticker tick에서 드롭하면 다음 tick에 게이트 false로 평가돼
      // emit이 멈춘다 (ticker 자체는 계속 시간만 진행).
      newRuntime[nid] = { enabled: rt.enabled, cursor: nextCursor, gateOpen: rt.gateOpen };
      emittedIds.push(nid);
    }
    store.setState((s) => ({
      executionState: {
        ...s.executionState,
        values: newValues,
        validOutputs: newValid,
        generatorRuntime: newRuntime,
        simulationTimeMs: s.executionState.simulationTimeMs + stepDelta,
      },
    }));
    if (emittedIds.length === 0) return;
    const latest = store.getState();
    for (const nid of emittedIds) {
      nodeFlashRegistry.trigger(nid);
      spawnOutgoingPulses(latest.model, latest.executionState, nid);
    }
  }
  function currentStepIntervalMs(): number {
    const m = timeSettingsStore.getState().stepSpeedMultiplier;
    return STEP_TICK_MS / (m > 0 ? m : 1);
  }
  function startGeneratorTickerIfNeeded(): void {
    if (generatorTicker !== null) return;
    if (timeSettingsStore.getState().paused) return;
    generatorTicker = window.setInterval(tickGenerators, currentStepIntervalMs());
  }
  function stopGeneratorTicker(): void {
    if (generatorTicker !== null) {
      window.clearInterval(generatorTicker);
      generatorTicker = null;
    }
  }
  function restartGeneratorTickerIfRunning(): void {
    // multiplier 변경: 돌고 있던 ticker만 새 주기로 재시작. 정지 상태면 그대로.
    if (generatorTicker === null) return;
    stopGeneratorTicker();
    startGeneratorTickerIfNeeded();
  }
  /**
   * 모델·실행상태 변이 후 ticker 상태를 reconcile.
   *
   * ticker on/off의 진실의 출처는 paused 상태 — generator 유무와 무관하다.
   * 변이 후에도 paused=false면 ticker가 계속 돌아야 시뮬레이션 시간이 진행된다.
   */
  function reconcileGeneratorTicker(): void {
    if (timeSettingsStore.getState().paused) stopGeneratorTicker();
    else startGeneratorTickerIfNeeded();
  }

  /**
   * N-step playback. 자가 reschedule 패턴 — 다음 step 하나만 setTimeout으로 예약하고
   * 발화 시 다음 step을 다시 예약한다. 이렇게 하면 multiplier 변경이 자연스럽게
   * 다음 간격에 반영되고, pause는 timer 한 개만 끊으면 끝.
   */
  function applyStep(s: ExecutionState, stepIndex: number, isLast: boolean): void {
    const prev = store.getState().executionState;
    for (const nid of Object.keys(s.values)) {
      if (s.values[nid] !== prev.values[nid]) nodeFlashRegistry.trigger(nid);
    }
    store.setState({ executionState: s, playbackStep: isLast ? null : stepIndex });
  }
  function stopPlaybackTimer(): void {
    if (playbackTimeoutId !== null) {
      window.clearTimeout(playbackTimeoutId);
      playbackTimeoutId = null;
    }
  }
  function schedulePlaybackStep(token: number, nextIndex: number): void {
    if (activePlaybackToken !== token) return;
    if (timeSettingsStore.getState().paused) return;
    const traj = store.getState().trajectory;
    if (nextIndex >= traj.length) return;
    playbackTimeoutId = window.setTimeout(() => {
      playbackTimeoutId = null;
      if (activePlaybackToken !== token) return;
      const trajNow = store.getState().trajectory;
      if (nextIndex >= trajNow.length) return;
      const s = trajNow[nextIndex]!;
      const isLast = nextIndex === trajNow.length - 1;
      applyStep(s, nextIndex, isLast);
      if (!isLast) schedulePlaybackStep(token, nextIndex + 1);
    }, currentStepIntervalMs());
  }

  /**
   * 재생 진입 시 pending ValueNode 들에 첫 펄스를 흘려준다.
   *
   * 멈춤 중 새로 추가된 lag=0 엣지의 target 은 pending 상태로 남아 있다 — 멈춤
   * 중에는 source 변화를 흡수하지 않기로 했으므로(인과 일관). 재생 진입 순간에야
   * "시간이 흐르기 시작" 했으니 source 의 첫 펄스를 spawn 해 target 이 시각·인과
   * 정상 경로로 값을 받게 한다. 효과는 펄스 도착 시점의 handlePulseArrival 에서만
   * 일어나므로 시각이 효과를 앞서지 않는다.
   */
  function flushPendingOnUnpause(): void {
    const { model, executionState } = store.getState();
    if (executionState.pendingOutputs.size === 0) return;
    const pendingTargets = new Set<NodeId>();
    for (const slot of executionState.pendingOutputs) {
      const colon = slot.lastIndexOf(':');
      const nid = colon >= 0 ? slot.slice(0, colon) : slot;
      const node = model.nodes[nid];
      if (!node || !isValueNode(node)) continue;
      pendingTargets.add(nid);
    }
    if (pendingTargets.size === 0) return;
    const sourceToSlots = new Map<NodeId, Set<number>>();
    for (const eid of model.edgeOrder) {
      const e = model.edges[eid];
      if (!e) continue;
      if ((e.lag ?? 0) !== 0) continue;
      if (!pendingTargets.has(e.to)) continue;
      const slot = e.sourceSlotIndex ?? 0;
      if (!executionState.validOutputs.has(outputKey(e.from, slot))) continue;
      let set = sourceToSlots.get(e.from);
      if (!set) {
        set = new Set();
        sourceToSlots.set(e.from, set);
      }
      set.add(slot);
    }
    for (const [sourceId, slots] of sourceToSlots) {
      spawnOutgoingPulses(model, executionState, sourceId, slots);
    }
  }

  // timeSettings 변경 구독 — multiplier·paused 변화에 ticker·playback 반영.
  timeSettingsStore.subscribe((state, prev) => {
    if (state.paused !== prev.paused) {
      if (state.paused) {
        stopGeneratorTicker();
        stopPlaybackTimer();
      } else {
        // pending 흡수는 ticker 시작 전에 한 번 — generator emit 보다 인과적으로
        // 먼저 시작된 "새 엣지의 첫 신호" 가 시각화되도록.
        flushPendingOnUnpause();
        startGeneratorTickerIfNeeded();
        const playbackStep = store.getState().playbackStep;
        if (playbackStep !== null) {
          schedulePlaybackStep(activePlaybackToken, playbackStep + 1);
        }
      }
      return;
    }
    if (state.stepSpeedMultiplier !== prev.stepSpeedMultiplier) {
      restartGeneratorTickerIfRunning();
      // playback 진행 중이면 다음 간격에 새 multiplier 자동 반영 — 별도 처리 불필요.
    }
  });

  /**
   * 주어진 source 노드의 lag=0 outgoing edges에 대해 펄스를 spawn.
   * lag=1 feedback 엣지는 제외 (방식 가). 출력 슬롯이 invalid면 skip.
   * playback 중이면 spawn 자체를 막는다.
   *
   * allowedSlots 가 주어지면 해당 슬롯 인덱스에 속한 outgoing edge 만 spawn —
   * 호출자가 "이번 step 에 실제로 갱신/emit 된 슬롯" 만 추려 넘기는 경로용.
   * ObserveNode 누적 추출처럼 throttle 미충족 step 에서 valid 가 *유지* 되는
   * 슬롯이 있어 valid 만 기준으로 하면 시각(펄스)이 실제 인과(emit)와 어긋난다.
   * 미지정이면 기존 동작 — 모든 valid outgoing 슬롯에 spawn.
   */
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
    for (const eid of model.edgeOrder) {
      const e = model.edges[eid];
      if (!e || e.from !== sourceNodeId) continue;
      if ((e.lag ?? 0) !== 0) continue;
      const slot = e.sourceSlotIndex ?? 0;
      if (allowedSlots && !allowedSlots.has(slot)) continue;
      if (!executionState.validOutputs.has(outputKey(sourceNodeId, slot))) continue;
      const sourceValue = executionState.values[sourceNodeId];
      if (!sourceValue) continue;
      pulseRegistry.spawn({
        edgeId: eid,
        sourceNodeId,
        sourceSlotIndex: slot,
        targetNodeId: e.to,
        sourceValue,
      });
    }
  }

  /**
   * 펄스 도착 처리.
   * 1. target 재계산 (펄스의 source 값을 sourceValueOverrides로 박제)
   * 2. flash 트리거
   * 3. 결과값이 *바뀐 경우에만* outgoing edges로 펄스 전파
   *
   * playback 중에는 무시 (재생 모드와 충돌 방지).
   */
  function handlePulseArrival(pulse: Pulse): void {
    const { model, executionState, playbackStep } = store.getState();
    if (playbackStep !== null) return;

    const targetNode = model.nodes[pulse.targetNodeId];
    if (!targetNode || !model.nodes[pulse.sourceNodeId]) return;

    // Generator는 boolean gate 입력을 받지만 자기 값은 ticker가 만든다.
    // 펄스 도착 시 (a) gateOpen 캐시를 펄스 source 값으로 갱신, (b) ticker
    // reconcile만 수행. 즉시 emit은 ticker가 다음 틱에 처리 → 인과 시점 일치.
    if (isGeneratorNode(targetNode)) {
      const edge = model.edgeOrder
        .map((eid) => model.edges[eid])
        .find(
          (e): e is Edge =>
            !!e &&
            e.to === pulse.targetNodeId &&
            e.from === pulse.sourceNodeId &&
            e.lag === 0,
        );
      // 펄스의 sourceValue 는 ExecValue — asBooleanGate 가 알맹이 boolean / wrapped
      // value:boolean / wrapped meta:boolean 우선순위로 게이트를 추출해 준다. Condition
      // 슬롯에서 흘러온 wrapped numeric 의 meta:boolean 도 동일하게 게이트로 인식.
      // 추출 실패 시 prev.gateOpen 을 유지 — 잘못된 펄스 하나로 ticker 가 영구
      // freeze 되는 일이 없게.
      store.setState((s) => {
        const prev = s.executionState.generatorRuntime[pulse.targetNodeId];
        if (!prev) return s;
        let nextGateOpen = prev.gateOpen;
        if (edge) {
          const raw = asBooleanGate(pulse.sourceValue);
          if (raw !== undefined) {
            nextGateOpen = edge.inverted ? !raw : raw;
          }
        }
        const newRuntime = {
          ...s.executionState.generatorRuntime,
          [pulse.targetNodeId]: {
            enabled: prev.enabled,
            cursor: prev.cursor,
            gateOpen: nextGateOpen,
          },
        };
        return {
          executionState: {
            ...s.executionState,
            generatorRuntime: newRuntime,
          },
        };
      });
      nodeFlashRegistry.trigger(pulse.targetNodeId);
      reconcileGeneratorTicker();
      return;
    }

    const result = recomputeNode(pulse.targetNodeId, executionState, model, {
      shapeRegistry,
      combinerRegistry,
      expressionEvaluator: fizzexExpressionEvaluator,
      sourceValueOverrides: { [pulse.sourceNodeId]: pulse.sourceValue },
      observeBuffers: executionState.observeBuffers,
      observeExtractionRuntime: executionState.observeExtractionRuntime,
      sequenceOutputs: executionState.sequenceOutputs,
      simulationTimeMs: executionState.simulationTimeMs,
    });

    const prevValue = executionState.values[pulse.targetNodeId];
    const wasValid = executionState.validOutputs.has(outputKey(pulse.targetNodeId, 0));
    const isValid = result.isValid;
    const valueChanged =
      result.newValue !== undefined && result.newValue !== prevValue;
    const validityChanged = wasValid !== isValid;

    nodeFlashRegistry.trigger(pulse.targetNodeId);

    // valid↔invalid 전이가 일어났다면 다운스트림 전체에 invalid가 전파되어야 한다.
    // 펄스 체인은 valid source만 흘리는 시각·증분 경로라 invalid 전파를 표현하지
    // 못한다. 이 경우엔 전체 재계산으로 정확한 그래프 상태를 한 번에 잡는다.
    if (validityChanged) {
      // 펄스 도착은 시간이 흐르는 step — paused=false 로 재계산해 ValueNode 가
      // source 변화를 흡수하도록 한다.
      const recomputed = computeExecutionState(model, undefined, false);
      store.setState({
        executionState: recomputed.executionState,
        trajectory: recomputed.trajectory,
      });
      return;
    }

    store.setState((s) => {
      const newValues: Record<NodeId, ExecValue> = { ...s.executionState.values };
      if (result.newValue !== undefined) newValues[pulse.targetNodeId] = result.newValue;
      return {
        executionState: {
          values: newValues,
          sequenceOutputs: {
            ...s.executionState.sequenceOutputs,
            ...result.newSequenceOutputs,
          },
          validOutputs: result.validOutputs,
          pendingOutputs: result.pendingOutputs,
          invalidReasons: s.executionState.invalidReasons,
          observeBuffers: result.newObserveBuffers,
          observeExtractionRuntime: result.newObserveExtractionRuntime,
          generatorRuntime: s.executionState.generatorRuntime,
          simulationTimeMs: s.executionState.simulationTimeMs,
        },
      };
    });

    // 이번 step 에 실제로 갱신/emit 된 슬롯만 펄스 spawn — slot 0 은 스칼라
    // 본체 값이 바뀐 경우, slot 1+ 는 sequenceOutputs reference 가 바뀐(=새 emit)
    // 경우. throttle 미충족 step 에서도 valid 는 유지되는 sequence 슬롯이 있어
    // valid 만 기준으로 하면 시각과 인과가 어긋난다.
    const allowedSlots = new Set<number>();
    if (valueChanged) allowedSlots.add(0);
    const prevSeq = executionState.sequenceOutputs;
    const prefix = `${pulse.targetNodeId}:`;
    for (const [key, seq] of Object.entries(result.newSequenceOutputs)) {
      if (!key.startsWith(prefix)) continue;
      if (prevSeq[key] === seq) continue;
      const slot = Number.parseInt(key.slice(prefix.length), 10);
      if (!Number.isNaN(slot)) allowedSlots.add(slot);
    }
    if (allowedSlots.size > 0) {
      const latest = store.getState();
      spawnOutgoingPulses(
        latest.model,
        latest.executionState,
        pulse.targetNodeId,
        allowedSlots,
      );
    }
  }

  const store = create<ModelStore>((set, get) => ({
    model: initial,
    executionState: initialExec.executionState,
    trajectory: initialExec.trajectory,
    playbackStep: null,

    setModel: (next) => {
      if (!assertEditable()) return;
      const s = get();
      const exec = computeExecutionState(next, s.executionState, true, s.model);
      set({ model: next, ...exec });
      reconcileGeneratorTicker();
    },

    recompute: () => {
      const s = get();
      const exec = computeExecutionState(s.model, s.executionState, true, s.model);
      set(exec);
    },

    loadFromJson: (json) => {
      try {
        const obj = JSON.parse(json);
        if (typeof obj !== 'object' || obj == null) return false;
        return false;
      } catch {
        return false;
      }
    },

    exportToJson: () => {
      return serializeTrama(modelToDocument(get().model));
    },

    addNode: (input) => {
      if (!assertEditable()) return null;
      const s = get();
      const after = addValueNodeOp(s.model, input);
      const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
      const node = after.nodes[newId]!;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      return node;
    },

    addConstantNode: (input) => {
      if (!assertEditable()) return null;
      const s = get();
      const after = addConstantNodeOp(s.model, input);
      const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
      const node = after.nodes[newId]!;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      return node;
    },

    addConditionNode: (input) => {
      if (!assertEditable()) return null;
      const s = get();
      const after = addConditionNodeOp(s.model, input);
      const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
      const node = after.nodes[newId]!;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      return node;
    },

    addLogicGateNode: (input) => {
      if (!assertEditable()) return null;
      const s = get();
      const after = addLogicGateNodeOp(s.model, input);
      const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
      const node = after.nodes[newId]!;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      return node;
    },

    addObserveNode: (input) => {
      if (!assertEditable()) return null;
      const s = get();
      const after = addObserveNodeOp(s.model, input);
      const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
      const node = after.nodes[newId]!;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      return node;
    },

    addExpressionNode: (input) => {
      if (!assertEditable()) return null;
      const s = get();
      const after = addExpressionNodeOp(s.model, input);
      const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
      const node = after.nodes[newId]!;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      return node;
    },

    addGeneratorNode: (input) => {
      if (!assertEditable()) return null;
      const s = get();
      const after = addGeneratorNodeOp(s.model, input);
      const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
      const node = after.nodes[newId]!;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      return node;
    },

    addAverageNode: (input) => {
      if (!assertEditable()) return null;
      const s = get();
      const after = addAverageNodeOp(s.model, input);
      const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
      const node = after.nodes[newId]!;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      return node;
    },

    setGeneratorEnabled: (id, enabled) => {
      if (!assertEditable()) return;
      const s = get();
      const node = s.model.nodes[id];
      if (!node || !isGeneratorNode(node)) return;
      const current = s.executionState.generatorRuntime[id];
      // 노드는 있는데 runtime이 비어 있는 경우(레이스) — params로 새 cursor 생성.
      const cursor = current?.cursor ?? defaultGeneratorRegistry.initCursor(node.params);
      if (current?.enabled === enabled) return;
      set({
        executionState: {
          ...s.executionState,
          generatorRuntime: {
            ...s.executionState.generatorRuntime,
            [id]: { enabled, cursor, gateOpen: current?.gateOpen },
          },
        },
      });
      // ticker는 paused 기준만 본다 — enabled가 false여도 시간 진행은 계속.
    },

    resetGenerator: (id) => {
      if (!assertEditable()) return;
      const s = get();
      const node = s.model.nodes[id];
      if (!node || !isGeneratorNode(node)) return;
      const cursor = defaultGeneratorRegistry.initCursor(node.params);
      // 값은 비우지 않는다 — idle peek로 다시 "다음 emit 값"을 노출.
      // (cursor를 origin으로 되돌렸으니 peek 결과는 counter.start / random(seed) 첫 샘플).
      const newValues: Record<NodeId, ExecValue> = { ...s.executionState.values };
      newValues[id] = defaultGeneratorRegistry.peek(node.params, cursor);
      const newValid = new Set(s.executionState.validOutputs);
      newValid.add(outputKey(id, 0));
      set({
        executionState: {
          ...s.executionState,
          values: newValues,
          validOutputs: newValid,
          generatorRuntime: {
            ...s.executionState.generatorRuntime,
            [id]: {
              enabled: false,
              cursor,
              gateOpen: s.executionState.generatorRuntime[id]?.gateOpen,
            },
          },
        },
      });
    },

    updateNode: (id, rawPatch) => {
      const before = get().model;
      const node = before.nodes[id];
      const patch: NodePatch =
        node &&
        isExpressionNode(node) &&
        typeof (rawPatch as { latex?: unknown }).latex === 'string'
          ? (() => {
              const nextLatex = (rawPatch as { latex: string }).latex;
              const analysis = fizzexExpressionEvaluator.analyze(nextLatex);
              return {
                ...rawPatch,
                variables: [...analysis.required, ...analysis.constants],
              };
            })()
          : rawPatch;
      const affectsValues = patchAffectsValues(patch);
      // 비실행 patch(position/label/displayMode 등)는 재생 중에도 허용 — 관찰 편의.
      // affectsValues=true 패치만 정지 상태로 제한.
      if (affectsValues && !assertEditable()) return;

      const after = updateNodeOp(before, id, patch);
      if (after === before) return;

      const exec = affectsValues
        ? computeExecutionState(after, get().executionState, true, before)
        : null;
      set({ model: after, ...(exec ?? {}) });
      if (affectsValues) {
        nodeFlashRegistry.trigger(id);
        const latest = get();
        spawnOutgoingPulses(latest.model, latest.executionState, id);
      }
      reconcileGeneratorTicker();
    },

    removeNode: (id) => {
      if (!assertEditable()) return;
      const s = get();
      const after = removeNodeOp(s.model, id);
      if (after === s.model) return;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
    },

    addEdge: (input) => {
      if (!assertEditable()) return null;
      const before = get().model;
      const targetNode = before.nodes[input.to];
      if (targetNode && isExpressionNode(targetNode)) {
        const arity = targetNode.variables.length;
        const slot = input.slotIndex;
        if (typeof slot !== 'number' || slot < 0 || slot >= arity) return null;
        const occupied = before.edgeOrder
          .map((eid) => before.edges[eid])
          .filter((e) => e && e.to === input.to);
        if (occupied.some((e) => e!.slotIndex === slot)) return null;
      }
      if (targetNode && isConditionNode(targetNode)) {
        const slot = input.slotIndex;
        if (typeof slot !== 'number' || slot < 0 || slot > 1) return null;
        const occupied = before.edgeOrder
          .map((eid) => before.edges[eid])
          .filter((e) => e && e.to === input.to);
        if (occupied.some((e) => e!.slotIndex === slot)) return null;
      }
      // NOT 게이트는 단항 — 두 번째 엣지를 기록 단계에서 거부해 의미와 슬롯 수를 일치시킨다.
      if (
        targetNode &&
        isLogicGateNode(targetNode) &&
        targetNode.operator === 'not'
      ) {
        const occupied = before.edgeOrder
          .map((eid) => before.edges[eid])
          .filter((e) => e && e.to === input.to);
        if (occupied.length >= 1) return null;
      }
      // GeneratorNode는 boolean gate 단항 입력 — 두 번째 엣지 거부.
      if (targetNode && isGeneratorNode(targetNode)) {
        const occupied = before.edgeOrder
          .map((eid) => before.edges[eid])
          .filter((e) => e && e.to === input.to);
        if (occupied.length >= 1) return null;
      }
      const candidate = addEdgeOp(before, input);
      if ((input.lag ?? 0) === 0) {
        try {
          buildTopology(candidate);
        } catch {
          return null;
        }
      }
      const after = candidate;
      const newId = after.edgeOrder[after.edgeOrder.length - 1]!;
      const edge = after.edges[newId]!;
      const exec = computeExecutionState(after, get().executionState, true, before);
      set({ model: after, ...exec });
      reconcileGeneratorTicker();
      return edge;
    },

    updateEdge: (id, patch) => {
      if (!assertEditable()) return;
      const s = get();
      const candidate = updateEdgeOp(s.model, id, patch);
      if (candidate === s.model) return;
      if ('lag' in patch || 'from' in patch || 'to' in patch) {
        try {
          buildTopology(candidate);
        } catch {
          return;
        }
      }
      const after = candidate;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      reconcileGeneratorTicker();
    },

    removeEdge: (id) => {
      if (!assertEditable()) return;
      const s = get();
      const after = removeEdgeOp(s.model, id);
      if (after === s.model) return;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      reconcileGeneratorTicker();
    },

    setQuestion: (q) => {
      const before = get().model;
      const after = setQuestionOp(before, q);
      set({ model: after });
    },

    setExecution: (e) => {
      if (!assertEditable()) return;
      const s = get();
      const after = setExecutionOp(s.model, e);
      if (after === s.model) return;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
    },

    scrubInitialValue: (id, nextValue) => {
      if (!assertEditable()) return;
      const before = get().model;
      const node = before.nodes[id];
      if (!node || !isValueNode(node)) return;
      let nextValueRecord: Value;
      if (typeof nextValue === 'number' && isNumericValue(node.initialValue)) {
        nextValueRecord = numericValue(nextValue, node.initialValue.unitId);
      } else if (
        typeof nextValue === 'boolean' &&
        node.initialValue.kind === 'boolean'
      ) {
        nextValueRecord = booleanValue(nextValue);
      } else {
        return;
      }
      const after = updateNodeOp(before, id, { initialValue: nextValueRecord });
      if (after === before) return;
      const recomputed = computeExecutionState(after, get().executionState, true, before);
      const playbackActive = get().playbackStep !== null;
      set((s) => {
        const nextValues: Record<NodeId, ExecValue> = playbackActive
          ? s.executionState.values
          : { ...s.executionState.values, [id]: nextValueRecord };
        const nextValid = playbackActive
          ? s.executionState.validOutputs
          : new Set(s.executionState.validOutputs);
        if (!playbackActive) nextValid.add(outputKey(id, 0));
        return {
          model: after,
          executionState: playbackActive
            ? s.executionState
            : {
                values: nextValues,
                sequenceOutputs: s.executionState.sequenceOutputs,
                validOutputs: nextValid,
                pendingOutputs: s.executionState.pendingOutputs,
                invalidReasons: s.executionState.invalidReasons,
                observeBuffers: s.executionState.observeBuffers,
                observeExtractionRuntime: s.executionState.observeExtractionRuntime,
                generatorRuntime: s.executionState.generatorRuntime,
                simulationTimeMs: s.executionState.simulationTimeMs,
              },
          trajectory: recomputed.trajectory,
        };
      });
      if (!playbackActive) {
        nodeFlashRegistry.trigger(id);
        const latest = get();
        spawnOutgoingPulses(latest.model, latest.executionState, id);
      }
    },

    play: () => {
      const { trajectory } = get();
      if (trajectory.length <= 1) return;
      stopPlaybackTimer();
      const token = ++activePlaybackToken;
      // step 0은 즉시 적용, 1+는 self-rescheduling으로 진행.
      applyStep(trajectory[0]!, 0, false);
      schedulePlaybackStep(token, 1);
    },

    resetSimulation: () => {
      // 재생 중 리셋을 누르면 시간 0 + 정지 상태로 — "처음으로 되감기".
      timeSettingsStore.getState().setPaused(true);
      stopGeneratorTicker();
      stopPlaybackTimer();
      activePlaybackToken++;
      pulseRegistry.clearAll();
      const fresh = initializeFromInitialValues(get().model);
      set({
        executionState: fresh,
        trajectory: [fresh],
        playbackStep: null,
      });
    },
  }));

  pulseRegistry.setArrivalHandler(handlePulseArrival);

  return store;
}

/** feedback 엣지 유무는 N-step 컨트롤 표시 결정에 사용. */
export function selectHasFeedback(s: Pick<ModelStore, 'model'>): boolean {
  return hasFeedbackEdges(s.model);
}

/**
 * 외부에서 propagation 결과만 빠르게 가져오는 helper.
 * 실시간 스크럽 중에는 store가 이미 갱신하지만, ad-hoc 미리보기에는 유용.
 */
export function previewPropagation(model: Model): ExecutionState {
  const init = initializeFromInitialValues(model);
  return propagateOneStep(init, model, {
    shapeRegistry,
    combinerRegistry,
  });
}
