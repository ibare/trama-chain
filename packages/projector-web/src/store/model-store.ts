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
  createEmptyModel,
  hasFeedbackEdges,
  initializeFromInitialValues,
  isConditionNode,
  isExpressionNode,
  isGeneratorNode,
  isLogicGateNode,
  modelToDocument,
  outputKey,
  propagateOneStep,
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
  Model,
  Node,
  NodeId,
  NodePatch,
  Value,
} from '@trama/core';
import {
  booleanValue,
  isNumericValue,
  isValueNode,
  numericValue,
} from '@trama/core';
import { tokens } from '@trama/tokens';
import { commitExecutionState } from './execution-commit.js';
import { computeExecutionState } from './execution-merge.js';
import { createSpawnPolicy, type SpawnPolicy } from './spawn-policy.js';
import { createPulseArrivalHandler } from './pulse-arrival.js';
import { createSimulationLoop } from './simulation-loop.js';
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
  // spawn 정책(L5-2)·펄스 도착 처리(L5-3)는 외부 모듈이 캡슐화. 호출 표면은
  // free function 그대로 유지하기 위해 let + 늦은 assign — definite assignment
  // assertion 으로 TS 의 "used before assigned" 검사를 우회한다. 호출 시점에는
  // 이미 init 완료. spawn-policy 의 getHandlePulseArrival lazy ref 가 본
  // handlePulseArrival 변수를 가리킨다.
  let spawnOutgoingPulses!: SpawnPolicy['spawnOutgoingPulses'];
  let spawnStockSlotPulse!: SpawnPolicy['spawnStockSlotPulse'];
  let handlePulseArrival!: (pulse: Pulse) => void;
  // L5-4: simulation-loop 모듈로 추출된 RAF 시뮬레이션 펌프의 표면.
  // closure 변수(accumulator·lastWallNow·ticker handle) 는 모두 simulation-loop
  // factory 안으로 이전. 본 모듈은 lazy-let 으로 호출 표면만 보유한다.
  let startSimulationLoopIfNeeded!: () => void;
  let stopSimulationLoop!: () => void;
  let reconcileSimulationLoop!: () => void;
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
   * playback step 간 wall-time 지연. multiplier로 나눠 "한 step을 보는 시간"을
   * 환산한다. 시뮬레이션 ticker와 무관 — trajectory 재생용 setTimeout 경로 전용.
   */
  function currentPlaybackStepIntervalMs(): number {
    const m = timeSettingsStore.getState().stepSpeedMultiplier;
    return STEP_TICK_MS / (m > 0 ? m : 1);
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
          executionState: commitExecutionState(s.executionState, {
            values: nextValues,
            validOutputs: nextValid,
          }),
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

  // L5-2/L5-3/L5-4 의 늦은 init — store 가 정의된 *지금* 시점에 한 번만 assign.
  //
  // 호출 순서가 중요:
  //  1. createSpawnPolicy  — pulse-arrival/sim-loop 가 spawn 함수를 deps 로 받음
  //  2. createSimulationLoop — pulse-arrival 이 reconcile 을 deps 로 받음
  //  3. createPulseArrivalHandler — 마지막
  //
  // 순환 (spawn-policy → handlePulseArrival → spawn-policy) 은 spawn-policy 의
  // getHandlePulseArrival lazy ref 한 곳으로만 우회. 나머지는 즉시 주입.
  ({ spawnOutgoingPulses, spawnStockSlotPulse } = createSpawnPolicy({
    store,
    timeSettingsStore,
    pulseRegistry,
    getHandlePulseArrival: () => handlePulseArrival,
  }));
  ({ startSimulationLoopIfNeeded, stopSimulationLoop, reconcileSimulationLoop } =
    createSimulationLoop({
      store,
      timeSettingsStore,
      animationLoop,
      nodeFlashRegistry,
      spawnOutgoingPulses,
    }));
  handlePulseArrival = createPulseArrivalHandler({
    store,
    nodeFlashRegistry,
    spawnOutgoingPulses,
    spawnStockSlotPulse,
    reconcileSimulationLoop,
  });

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
