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
  addStockNode as addStockNodeOp,
  addValueNode as addValueNodeOp,
  buildTopology,
  computeStockRate,
  createEmptyModel,
  defaultGeneratorRegistry,
  defaultNodeKindRegistry,
  executeModel,
  hasFeedbackEdges,
  initializeFromInitialValues,
  pruneStockWindow,
  isConditionNode,
  isExpressionNode,
  isGeneratorNode,
  isLogicGateNode,
  isStockNode,
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
  AddStockNodeInput,
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
import {
  asBooleanGate,
  booleanValue,
  isNumericValue,
  isSequence,
  isValueNode,
  numericValue,
  resolveScalar,
  unwrap,
} from '@trama/core';
import { tokens } from '@trama/tokens';
import { combinerRegistry, shapeRegistry } from './registries.js';
import { fizzexExpressionEvaluator } from '../expression/fizzex-evaluator.js';
import type { PulseRegistry, Pulse } from '../pulse/pulse-registry.js';
import type { NodeFlashRegistry } from '../pulse/node-flash-registry.js';
import type { SimulationOrchestrator } from './simulation-orchestrator.js';
import type { TimeSettingsStore } from './time-settings.js';
import type { AnimationLoop } from '../canvas/animation-loop.js';

/**
 * N-step playback의 step 간 wall-time 지연. multiplier로 나뉜다. 시뮬레이션
 * 시간축과는 무관 — playback은 *이미 계산된 trajectory*를 시각적으로 재생할
 * 뿐이라, 사용자가 "한 step을 보는 시간"을 정의하는 UI 상수.
 */
const STEP_TICK_MS = parseFloat(tokens.motion.durationStepTick);

/**
 * 시뮬레이션 고정 dt — RAF 단일 클락에 결속된 1급 시간축의 step 단위.
 * 60Hz에 정합. 한 시뮬레이션 step마다 propagate가 호출되고 simulationTimeMs가
 * 이 값만큼 진행한다. 배속(multiplier)은 dt에 곱하지 않는다 — accumulator가
 * 빠르게 차서 한 RAF 안에서 step 횟수가 늘어나는 방식으로 흡수한다.
 */
const FIXED_DT_MS = 1000 / 60;

/**
 * spiral-of-death 회피 — propagate 비용이 FIXED_DT를 넘으면 accumulator가
 * 영원히 못 따라잡는다. 누적량과 한 RAF당 step 횟수에 상한을 둬 시뮬레이션이
 * 벽시간 대비 *느려지는* 안전한 fallback으로 수렴.
 */
const MAX_ACCUM_MS = 250;
const MAX_STEPS_PER_RAF = 8;

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
  addStockNode: (input: AddStockNodeInput) => Node | null;
  updateNode: (id: NodeId, patch: NodePatch) => void;
  removeNode: (id: NodeId) => void;

  addEdge: (input: AddEdgeInput) => Edge | null;
  updateEdge: (id: EdgeId, patch: Partial<Omit<Edge, 'id'>>) => void;
  removeEdge: (id: EdgeId) => void;

  setQuestion: (q: string | null) => void;
  setExecution: (e: Partial<Model['execution']>) => void;

  /**
   * ValueNode 매뉴얼 송출 — 값 박제만. 재생/멈춤/초기 모두 호출 가능.
   * 다운스트림 펄스 발사는 emitValueOutput 이 별도로 책임 (drag 종료/toggle click).
   */
  scrubInitialValue: (id: NodeId, nextValue: number | boolean) => void;

  /**
   * ValueNode 다운스트림 펄스 발사. ValueNodeSlider drag 종료(onPointerUp) 및
   * BooleanValueNodeView 토글 click 시점에 호출. simulationTimeMs===0 이면 보류
   * (첫 ▶ 진입 시 unpause 분기가 모든 ValueNode 를 일괄 시드한다).
   */
  emitValueOutput: (id: NodeId) => void;

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
  animationLoop: AnimationLoop;
  /**
   * paused 전이 진입점. 미지정이면 timeSettingsStore.subscribe 직접 사용 (호환).
   * 지정하면 'effects' phase 에 등록 — pulse-registry 의 'time-axis' 가 시간 축을
   * 봉합한 후에 시드·loop 변경이 일어나도록 순서가 강제된다.
   */
  simulationOrchestrator?: SimulationOrchestrator;
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
      // stepIntervalMs 는 *호출자가 명시적으로 시간이 흐르는 step* 임을 선언할
      // 때만 전달한다. computeExecutionState 의 호출 경로는 전부 모델 편집 직후
      // fresh 재구성 — 시간이 흐르지 않는 정적 재계산이므로 0 유지 (기본).
      // 실 시뮬레이션 시간 누적은 RAF stepTicker 가 simulationTimeMs += stepDelta
      // 로 단독 책임 (:416). 여기서 STEP_TICK_MS 를 전달하면 첫 ▶ 시드 sentinel
      // (`executionState.simulationTimeMs === 0`) 과 UI 의 isInitial sentinel
      // (ValueNodeView, BooleanValueNodeView) 이 모델 편집 한 번에 깨진다.
    });
    fresh = { executionState: traj[traj.length - 1]!, trajectory: traj };
  } catch {
    const init = initializeFromInitialValues(model);
    fresh = { executionState: init, trajectory: [init] };
  }
  if (!prior) return fresh;
  // 생성기 런타임(cursor)과 마지막 emit 값은 모델 편집으로 리셋되면 안 된다.
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
  // Stock 노드의 누적 level 은 모델 편집으로 리셋되지 않는다 — 펄스 도착으로
  // 누적된 상태이므로 엣지 추가/제거로 사라져서는 안 된다. priorModel 의 존재
  // 여부와 상관없이 prior 에 같은 노드가 있다면 그대로 채택. rate 윈도우(stockRuntime)
  // 도 동일 — 마지막 1초 누적의 흔적이라 편집으로 비워지면 안 된다.
  const mergedStockRuntime: typeof fresh.executionState.stockRuntime = {
    ...fresh.executionState.stockRuntime,
  };
  for (const nid of model.nodeOrder) {
    const node = model.nodes[nid];
    if (!node || !isStockNode(node)) continue;
    const priorVal = prior.values[nid];
    if (priorVal !== undefined) {
      mergedValues[nid] = priorVal;
      const levelKey = outputKey(nid, 0);
      if (prior.validOutputs.has(levelKey)) {
        mergedValid.add(levelKey);
        mergedPending.delete(levelKey);
      }
    }
    const priorRt = prior.stockRuntime?.[nid];
    if (priorRt) mergedStockRuntime[nid] = priorRt;
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
      // cursor는 prior에서 유지(진행 상태 보존), gateOpen은 모델 편집 후 새 source
      // 토폴로지를 반영한 fresh 쪽을 채택.
      mergedRuntime[nid] = {
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
      stockRuntime: mergedStockRuntime,
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
  animationLoop,
  simulationOrchestrator,
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
   * 시뮬레이션 클락 — RAF 단일 루프에 결속. 매 RAF에서 wallDt를 측정해
   * multiplier만큼 시뮬레이션 시간으로 환산하고, FIXED_DT_MS 단위로 잘라
   * tickGenerators를 N회 호출한다. 한 step에서 simulationTimeMs += FIXED_DT_MS.
   *
   * 사용자는 시뮬레이션 시간(simulationTimeMs)을 본다 — wall time이 아니라.
   * 배속이 변해도 한 step의 dt는 일정(결정성·정밀도 보존), 대신 한 wall
   * 단위에서 처리되는 step 수가 달라진다.
   *
   * propagateOneStep을 거치지 않고 paradigm.emit으로 cursor만 진행한 뒤 펄스를
   * spawn — 다운스트림 갱신은 기존 펄스 hot-path가 담당하므로 펄스 시각화·flash가
   * 자연스럽게 흐른다.
   */
  let unregisterSimulationTicker: (() => void) | null = null;
  let simAccumMs = 0;
  let lastWallNowMs: number | null = null;

  /**
   * 한 generator가 실제로 이번 tick에 emit해야 하는지.
   *
   * 시맨틱은 [[generatorNodeDescriptor]] propagate와 동일:
   *  - 입력 미연결: 항상 emit (글로벌 paused가 시간의 단일 출처)
   *  - 입력 연결: incoming boolean이 true여야 emit. invalid·boolean 아님이면 freeze
   *
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
    if (!hasIncoming) return true;
    return rt.gateOpen === true;
  }

  function tickGenerators(): void {
    const { model, executionState, playbackStep } = store.getState();
    if (playbackStep !== null) return;
    // 시뮬레이션 시간은 generator 유무와 무관하게 paused=false 동안 항상 진행한다.
    // RAF 루프가 시뮬레이션 시간축의 유일한 출처. generator emit은 그 시간 안에서
    // 일어나는 부수 효과로, gate 조건을 만족하는 generator가 있을 때만 함께 갱신된다.
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
      if (!isGeneratorEffectivelyEnabled(model, executionState, nid)) continue;
      const node = model.nodes[nid];
      if (!node || !isGeneratorNode(node)) continue;
      const { value, nextCursor } = defaultGeneratorRegistry.emit(
        node.params,
        rt.cursor,
        nextSimulationTimeMs,
      );
      // value=undefined는 paradigm이 freeze한 경우(스텝 t<startMs 등). values/validOutputs를
      // 건드리지 않아 이전 상태를 유지하고 cursor만 진행. 다운스트림 펄스도 띄우지 않는다.
      if (value !== undefined) {
        newValues[nid] = value;
        newValid.add(outputKey(nid, 0));
        emittedIds.push(nid);
      }
      // gateOpen 캐시는 펄스로만 갱신되는 단일 진입 — ticker tick에서 드롭하면
      // 다음 tick에 게이트 false로 평가돼 emit이 멈춘다 (ticker 자체는 계속 시간만 진행).
      newRuntime[nid] = { cursor: nextCursor, gateOpen: rt.gateOpen };
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
  /**
   * Stock 노드의 단일 슬롯에 대해 lag=0 outgoing 엣지를 순회하며 펄스를 spawn.
   * Stock 은 continuous source 라 시각 입자 없이 즉시 도착 Pulse 로 동기 propagate.
   * sourceValue 는 호출자가 명시 — slot 0=level, slot 1=overflow, slot 2=rate 가
   * 각각 다른 값이므로.
   */
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
        executionState: {
          ...s.executionState,
          validOutputs: newValid,
          pendingOutputs: newPending,
        },
      };
    });
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

  /**
   * playback step 간 wall-time 지연. multiplier로 나눠 "한 step을 보는 시간"을
   * 환산한다. 시뮬레이션 ticker와 무관 — trajectory 재생용 setTimeout 경로 전용.
   */
  function currentPlaybackStepIntervalMs(): number {
    const m = timeSettingsStore.getState().stepSpeedMultiplier;
    return STEP_TICK_MS / (m > 0 ? m : 1);
  }

  /**
   * 매 RAF에서 호출되는 시뮬레이션 step 펌프.
   *
   * wallDt를 측정 → multiplier 곱해 simAccumMs에 누적 → FIXED_DT_MS 단위로 잘라
   * 가능한 만큼 tickGenerators 호출. 한 RAF에서 propagate가 너무 많이 일어나
   * 프레임이 막히는 spiral-of-death는 MAX_ACCUM_MS·MAX_STEPS_PER_RAF로 막는다.
   *
   * paused=true 동안은 wallDt 추적만 유지(다음 resume 시 첫 frame이 큰 점프를
   * 만들지 않도록) accumulator는 0으로 리셋. unregister하지 않고 분기로 처리해
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
   * on/off의 진실의 출처는 paused 상태 — generator 유무와 무관하다.
   * 변이 후에도 paused=false면 루프가 계속 돌아야 시뮬레이션 시간이 진행된다.
   */
  function reconcileSimulationLoop(): void {
    if (timeSettingsStore.getState().paused) stopSimulationLoop();
    else startSimulationLoopIfNeeded();
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
    }, currentPlaybackStepIntervalMs());
  }

  // timeSettings 변경 구독 — paused 변화에 시뮬레이션 루프·playback 반영.
  // multiplier는 RAF 콜백이 매 frame마다 읽으므로 별도 재시작 불필요.
  // orchestrator 가 있으면 'effects' phase 로 — pulse-registry 의 'time-axis' 가
  // pausedAt·startTime 봉합을 마친 후에 시드·spawn 이 일어나도록 보장된다.
  const pausedTransitionHandler = (
    state: { paused: boolean },
    prev: { paused: boolean },
  ): void => {
    if (state.paused !== prev.paused) {
      if (state.paused) {
        stopSimulationLoop();
        stopPlaybackTimer();
      } else {
        // 첫 ▶ 진입 (직전 t=0) 이면 ValueNode 매뉴얼 송출기들의 초기값을 일괄
        // 시드한다. nodeOrder 순회로 결정성 유지. 이후 ▶/||/▶ 토글에는
        // 시뮬레이션 시간이 진행된 상태이므로 시드하지 않는다.
        // (다른 source 시드는 generator ticker / pulse arrival propagate 가 책임.)
        const seedState = store.getState();
        if (seedState.executionState.simulationTimeMs === 0) {
          const seedModel = seedState.model;
          const seedExec = seedState.executionState;
          for (const nid of seedModel.nodeOrder) {
            const node = seedModel.nodes[nid];
            if (!node || !isValueNode(node)) continue;
            spawnOutgoingPulses(seedModel, seedExec, nid);
          }
        }
        startSimulationLoopIfNeeded();
        const playbackStep = store.getState().playbackStep;
        if (playbackStep !== null) {
          schedulePlaybackStep(activePlaybackToken, playbackStep + 1);
        }
      }
    }
  };
  if (simulationOrchestrator) {
    simulationOrchestrator.onPauseTransition('effects', pausedTransitionHandler);
  } else {
    timeSettingsStore.subscribe(pausedTransitionHandler);
  }

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
    // continuous source(현재 sine paradigm) 는 매 tick 신호값이 변하는 흐름이라
    // 시각적 "입자(펄스)" 시맨틱과 어울리지 않는다. EdgeView 가 stroke 변조로
    // 흐름을 표현하므로 시각 펄스는 띄우지 않고, 그래도 다운스트림 상태(예:
    // ObserveNode 누적 버퍼) 는 갱신되어야 하므로 즉시 도착한 합성 Pulse 로
    // 동기 propagate 만 수행한다.
    const sourceNode = model.nodes[sourceNodeId];
    const sourceInterp =
      sourceNode &&
      defaultNodeKindRegistry.forNode(sourceNode)?.outputInterpolation?.(sourceNode);
    const isContinuousSource = sourceInterp === 'continuous';
    for (const eid of model.edgeOrder) {
      const e = model.edges[eid];
      if (!e || e.from !== sourceNodeId) continue;
      if ((e.lag ?? 0) !== 0) continue;
      const slot = e.sourceSlotIndex ?? 0;
      if (allowedSlots && !allowedSlots.has(slot)) continue;
      if (!executionState.validOutputs.has(outputKey(sourceNodeId, slot))) continue;
      const sourceValue = executionState.values[sourceNodeId];
      if (!sourceValue) continue;
      if (isContinuousSource) {
        handlePulseArrival({
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
  let nextDirectPulseSerial = 0;

  /**
   * 펄스 도착 처리.
   * 1. target 재계산 (펄스의 source 슬롯 값을 sourceOverride 로 박제)
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
      reconcileSimulationLoop();
      return;
    }

    // Stock — pulse 도착 시 값을 그대로 누적. propagate descriptor 는
    // RAF/scrub 경로에서 level 을 유지만 하므로, 누적의 단일 출처가 여기에 박힌다.
    if (isStockNode(targetNode)) {
      const edge = model.edgeOrder
        .map((eid) => model.edges[eid])
        .find(
          (e): e is Edge =>
            !!e &&
            e.to === pulse.targetNodeId &&
            e.from === pulse.sourceNodeId &&
            (e.lag ?? 0) === 0 &&
            (e.sourceSlotIndex ?? 0) === (pulse.sourceSlotIndex ?? 0),
        );
      if (!edge) return;

      // pulse 가 운반한 값에서 numeric 추출. sequence 거나 비-numeric 이면 무시.
      const sv = pulse.sourceValue;
      let n: number | undefined;
      if (!isSequence(sv)) {
        const v = unwrap(resolveScalar(sv, executionState.simulationTimeMs));
        if (v.kind === 'numeric') n = v.n;
      }
      if (n === undefined) return;

      const signed = edge.inverted ? -n : n;
      const slot = edge.slotIndex ?? 0;
      // slot 0=incoming (가산), slot 1=outgoing (감산).
      const delta = slot === 0 ? signed : -signed;

      // prev level
      const prevEv = executionState.values[pulse.targetNodeId];
      let prevLevel = targetNode.initialLevel;
      if (prevEv && !isSequence(prevEv)) {
        const v = unwrap(resolveScalar(prevEv, executionState.simulationTimeMs));
        if (v.kind === 'numeric') prevLevel = v.n;
      }

      const desired = prevLevel + delta;
      let clamped = desired;
      if (targetNode.capacity.min !== null && clamped < targetNode.capacity.min) {
        clamped = targetNode.capacity.min;
      }
      if (targetNode.capacity.max !== null && clamped > targetNode.capacity.max) {
        clamped = targetNode.capacity.max;
      }
      const overflowAmount = desired - clamped;
      const newLevelVal = numericValue(clamped, targetNode.unitId);
      // 누적 후 실제로 level 에 반영된 양 — capacity 클램프 이후의 순 증분.
      // 윈도우 항목은 desired 가 아니라 clamped 기준이어야 "탱크에 실제로 들어온 양"
      // 의 직관과 맞는다. overflow 만큼은 다운스트림으로 빠져나간 양이라 rate 합에
      // 포함시키지 않는다.
      const effectiveDelta = clamped - prevLevel;

      // 윈도우 push + 만료 prune → rate 계산.
      const nowMs = executionState.simulationTimeMs;
      const prevWindow =
        executionState.stockRuntime[pulse.targetNodeId]?.window ?? [];
      const prunedPrev = pruneStockWindow(prevWindow, nowMs);
      const nextWindow =
        effectiveDelta !== 0
          ? [...prunedPrev, { ts: nowMs, delta: effectiveDelta }]
          : prunedPrev;
      const rate = computeStockRate(nextWindow);

      store.setState((s) => {
        const newValues: Record<NodeId, ExecValue> = { ...s.executionState.values };
        newValues[pulse.targetNodeId] = newLevelVal;
        const newValid = new Set(s.executionState.validOutputs);
        newValid.add(outputKey(pulse.targetNodeId, 0));
        const newPending = new Set(s.executionState.pendingOutputs);
        newPending.delete(outputKey(pulse.targetNodeId, 0));
        const newStockRuntime = {
          ...s.executionState.stockRuntime,
          [pulse.targetNodeId]: { window: nextWindow },
        };
        return {
          executionState: {
            ...s.executionState,
            values: newValues,
            validOutputs: newValid,
            pendingOutputs: newPending,
            stockRuntime: newStockRuntime,
          },
        };
      });

      nodeFlashRegistry.trigger(pulse.targetNodeId);

      // level 변경 → 슬롯 0 outgoing 펄스 spawn.
      const latest = store.getState();
      spawnOutgoingPulses(
        latest.model,
        latest.executionState,
        pulse.targetNodeId,
        new Set([0]),
      );

      // overflow 가 발생했다면 슬롯 1 펄스를 명시 값으로 spawn.
      if (overflowAmount !== 0) {
        const overflowVal = numericValue(overflowAmount, 'free');
        spawnStockSlotPulse(latest.model, pulse.targetNodeId, 1, overflowVal);
      }

      // rate 슬롯(slot 2) 펄스 spawn — 1초 윈도우의 누적 합. effectiveDelta=0 이면
      // 이번 펄스는 클램프로 흡수되어 새 항목이 푸시되지 않았더라도, 만료 prune 으로
      // rate 가 바뀌었을 수 있으므로 항상 spawn (외부에서 본 "초당 유량" 의 일관성).
      const rateVal = numericValue(rate, 'free');
      spawnStockSlotPulse(latest.model, pulse.targetNodeId, 2, rateVal);
      return;
    }

    const result = recomputeNode(pulse.targetNodeId, executionState, model, {
      shapeRegistry,
      combinerRegistry,
      expressionEvaluator: fizzexExpressionEvaluator,
      sourceOverride: {
        sourceNodeId: pulse.sourceNodeId,
        sourceSlotIndex: pulse.sourceSlotIndex,
        value: pulse.sourceValue,
      },
      observeBuffers: executionState.observeBuffers,
      observeExtractionRuntime: executionState.observeExtractionRuntime,
      sequenceOutputs: executionState.sequenceOutputs,
      simulationTimeMs: executionState.simulationTimeMs,
    });

    const prevValue = executionState.values[pulse.targetNodeId];
    const valueChanged =
      result.newValue !== undefined && result.newValue !== prevValue;
    // 슬롯 단위 valid→invalid 전환만으로 cascade 를 트리거 — Condition 같은 다출력
    // 노드도 슬롯 하나만 꺼져도 다운스트림에 invalidation 이 전파돼야 한다.
    // 노드 단위 OR(`wasValid && !isValid`) 는 slotBecameInvalid 의 부분집합이므로
    // (한 슬롯도 valid 가 없으면 노드도 valid 가 아님) 별도 항이 필요 없다.
    const becameInvalid = result.outputSlotKeys.some(
      (k) => executionState.validOutputs.has(k) && !result.validOutputs.has(k),
    );

    nodeFlashRegistry.trigger(pulse.targetNodeId);

    // valid → invalid 전이만 전체 재계산. 펄스 체인은 valid source 만 흘리는
    // 시각·증분 경로라 invalid 전파를 표현하지 못하므로 한 번에 그래프 상태를
    // 잡는다. 반대 방향(invalid/pending → valid) 은 증분 경로로 가야 다운스트림이
    // 펄스 체인을 따라 자연스럽게 cascade — 한 step 에 모두 흡수되면 시각 펄스가
    // 사라진다.
    if (becameInvalid) {
      // 펄스 도착은 시간이 흐르는 step — paused=false 로 재계산해 ValueNode 가
      // source 변화를 흡수하도록 한다. prior+priorModel 을 함께 전달해 Stock
      // level, observe buffer, generator cursor 의 누적이 fresh 빈 값으로
      // 덮이지 않게 한다 (펄스 도착 사이에 모델은 변하지 않으므로 priorModel===model).
      const recomputed = computeExecutionState(model, executionState, false, model);
      store.setState({
        executionState: recomputed.executionState,
        trajectory: recomputed.trajectory,
      });
      // 전체 재계산은 invalid 전파를 한 step 으로 잡지만, 같은 target 의
      // 다른 슬롯이 동시에 invalid→valid 로 뒤집힌 경우(Condition 판정 전환 등)
      // 다운스트림으로 흘러야 할 cascade 가 끊긴다. 펄스 체인은 valid source 만
      // 운반하므로, 새로 valid 가 된 슬롯에 대해서는 명시적으로 spawn 해 줘야
      // Cond→다운스트림 케이블에 펄스가 정상적으로 흐르고 시각도 잇는다.
      const prevValid = executionState.validOutputs;
      const nextValid = recomputed.executionState.validOutputs;
      const prefix = `${pulse.targetNodeId}:`;
      const newlyValidSlots = new Set<number>();
      for (const slotKey of nextValid) {
        if (!slotKey.startsWith(prefix)) continue;
        if (prevValid.has(slotKey)) continue;
        const slot = Number.parseInt(slotKey.slice(prefix.length), 10);
        if (!Number.isNaN(slot)) newlyValidSlots.add(slot);
      }
      if (newlyValidSlots.size > 0) {
        spawnOutgoingPulses(
          model,
          recomputed.executionState,
          pulse.targetNodeId,
          newlyValidSlots,
        );
      }
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
          invalidReasons: result.newInvalidReasons,
          observeBuffers: result.newObserveBuffers,
          observeExtractionRuntime: result.newObserveExtractionRuntime,
          generatorRuntime: s.executionState.generatorRuntime,
          stockRuntime: s.executionState.stockRuntime,
          simulationTimeMs: s.executionState.simulationTimeMs,
        },
      };
    });

    // 이번 step 에 실제로 갱신/emit 된 슬롯만 펄스 spawn. 슬롯별 정책:
    //   1) invalid → valid 전환: 무조건 spawn (펄스 체인 cascade 시작)
    //   2) 계속 valid + 스칼라 본체 값 바뀜: spawn
    //   3) 계속 valid + sequence emit reference 바뀜: spawn
    //   4) 그 외: skip — throttle 미충족 step 의 sequence 슬롯이 valid 유지된
    //      채로 펄스가 비지 않게.
    // Condition(2 슬롯) 처럼 다출력 노드는 slot 1 전환도 같은 규칙으로 spawn된다.
    const allowedSlots = new Set<number>();
    const prevSeq = executionState.sequenceOutputs;
    const prefix = `${pulse.targetNodeId}:`;
    for (const slotKey of result.outputSlotKeys) {
      if (!result.validOutputs.has(slotKey)) continue;
      const slot = Number.parseInt(slotKey.slice(prefix.length), 10);
      if (Number.isNaN(slot)) continue;
      const wasSlotValid = executionState.validOutputs.has(slotKey);
      if (!wasSlotValid) {
        allowedSlots.add(slot);
        continue;
      }
      if (valueChanged) {
        allowedSlots.add(slot);
        continue;
      }
      const newSeq = result.newSequenceOutputs[slotKey];
      if (newSeq !== undefined && prevSeq[slotKey] !== newSeq) {
        allowedSlots.add(slot);
      }
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
      reconcileSimulationLoop();
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

    addStockNode: (input) => {
      if (!assertEditable()) return null;
      const s = get();
      const after = addStockNodeOp(s.model, input);
      const newId = after.nodeOrder[after.nodeOrder.length - 1]!;
      const node = after.nodes[newId]!;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      return node;
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
      reconcileSimulationLoop();
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
      reconcileSimulationLoop();
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
      reconcileSimulationLoop();
    },

    removeEdge: (id) => {
      if (!assertEditable()) return;
      const s = get();
      const after = removeEdgeOp(s.model, id);
      if (after === s.model) return;
      const exec = computeExecutionState(after, s.executionState, true, s.model);
      set({ model: after, ...exec });
      reconcileSimulationLoop();
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

    // ValueNode 는 "사용자 매뉴얼 송출기" — paused/실행 중 모두 슬라이더로 값
    // 박제 가능. 두 분기 모두 model.initialValue 를 mutate 한다:
    //  - ValueNodeSlider 의 핸들 위치가 node.initialValue.n 에서 계산 — 박제 후
    //    핸들이 사용자 손을 따라가게 하려면 모델이 동기되어야 한다.
    //  - 펄스 도착 시 handlePulseArrival 의 becameInvalid 분기가 computeExecutionState
    //    를 fresh 호출하면 ValueNode 의 값이 model.initialValue 로 복원된다 — 박제값이
    //    이때 휘발되면 ConditionNode 평가가 stale.
    // 차이는 trajectory 재계산뿐: paused 는 play() baseline 이므로 재계산하고, 실행 중
    // 에는 RAF stepTicker 와 펄스 cascade 가 단독 출처이므로 trajectory 는 그대로 둔다.
    // assertEditable 의 "재생 중 모델 mutation 차단" 단언은 구조 편집(노드/엣지 추가·
    // 삭제, 파라미터 변경) 을 대상으로 하지 ValueNode 의 매뉴얼 송출 값 변경은 우회 경로.
    // 다운스트림 펄스 발사는 호출자가 emitValueOutput 으로 별도 트리거.
    scrubInitialValue: (id, nextValue) => {
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
      const isPaused = timeSettingsStore.getState().paused;
      const nextTrajectory = isPaused
        ? computeExecutionState(after, get().executionState, true, before).trajectory
        : null;
      set((s) => {
        const nextValues: Record<NodeId, ExecValue> = {
          ...s.executionState.values,
          [id]: nextValueRecord,
        };
        const nextValid = new Set(s.executionState.validOutputs);
        nextValid.add(outputKey(id, 0));
        return {
          model: after,
          executionState: {
            ...s.executionState,
            values: nextValues,
            validOutputs: nextValid,
          },
          ...(nextTrajectory ? { trajectory: nextTrajectory } : {}),
        };
      });
      nodeFlashRegistry.trigger(id);
    },

    emitValueOutput: (id) => {
      const { model, executionState } = get();
      const node = model.nodes[id];
      if (!node || !isValueNode(node)) return;
      // 초기(t=0)에는 다운스트림 박제만 — 첫 ▶ 진입 시 모든 ValueNode 를 일괄
      // 시드하는 unpause 분기가 책임. spawnOutgoingPulses 의 paused/playback
      // 가드는 그 함수 안에서 처리한다.
      if (executionState.simulationTimeMs === 0) return;
      spawnOutgoingPulses(model, executionState, id);
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
      stopSimulationLoop();
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
