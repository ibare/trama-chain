import type { Model, NodeId } from '../model/index.js';
import type { ExecValue, SequenceValue } from './exec-value.js';
import type { ObserveBuffer } from './observe-buffer.js';
import type { ObserveExtractionRuntime } from './kinds/index.js';
import { recomputeNode, type RecomputeNodeOptions, type RecomputeNodeResult } from './recompute-node.js';
import { outputKey, type ExecutionState } from './state.js';
import { buildTopology } from './topology.js';

/**
 * 펄스 도착이 root 노드의 *슬롯 valid → invalid* 전이를 일으켰을 때 다운스트림으로
 * incremental 하게 cascade 한다. `computeExecutionState` (정적 재구성용) 와 달리
 * caller 의 누적 상태 — observeBuffers·observeExtractionRuntime·sequenceOutputs·
 * generatorRuntime·stockRuntime·**simulationTimeMs** — 를 시드로 시작해 cascade 가
 * 건드린 노드의 결과만 머지한다. *모델 편집이 아니라 런타임 인과 갱신* 이므로
 * 시간축을 0 으로 리셋하지 않는 것이 본 함수의 핵심 시맨틱.
 *
 * 알고리즘 (위상순서 단일 패스):
 *   1. caller state 에서 시작해 root 의 recomputeNode 결과를 머지 (`workingState`).
 *      root 의 변경 슬롯 (valid→invalid, invalid→valid, 값 변경) 을 추출.
 *   2. 변경 슬롯의 `outgoingBySourceSlot` 다운스트림 노드들을 `dirty` 셋에 push.
 *   3. `topology.order` 를 처음부터 끝까지 한 번 순회.
 *      - root 는 이미 머지됨 → skip.
 *      - dirty 에 있는 노드만 recomputeNode 호출 → 결과 머지 → 변경 슬롯의
 *        다운스트림을 dirty 에 추가. Kahn 위상정렬 보장에 의해 다운스트림은 항상
 *        현재 노드보다 order 에서 뒤에 있으므로 한 번의 forward pass 로 cascade 완결.
 *
 * 같은 자손이 두 부모에서 dirty 되더라도 dirty 셋이 단일 엔트리이므로 정확히
 * 한 번만 recompute. heap·priority queue 불필요.
 *
 * `paused` / `stepIntervalMs` 사용하지 않음 — 시간이 흐르지 않는 *인과 갱신*.
 * 펄스 도착은 이미 RAF ticker 가 시간을 진행시킨 뒤 spawn 한 결과이므로 cascade
 * 자체는 시간 흐름이 없다.
 */
export function cascadeInvalidation(
  rootNodeId: NodeId,
  rootResult: RecomputeNodeResult,
  state: ExecutionState,
  model: Model,
  options: RecomputeNodeOptions,
): {
  executionState: ExecutionState;
  rootNewlyValidSlots: Set<number>;
} {
  const topology = options.topology ?? buildTopology(model);

  // 워킹 state 초기화 — caller 의 누적 상태를 모두 그대로 시드. 머지 단계에서
  // root 와 cascade 노드들의 결과만 덮어쓴다. simulationTimeMs 는 절대 건드리지 않음.
  const workingValues: Record<NodeId, ExecValue> = { ...state.values };
  const workingValid = new Set(state.validOutputs);
  const workingPending = new Set(state.pendingOutputs);
  const workingInvalidReasons: ExecutionState['invalidReasons'] = {
    ...state.invalidReasons,
  };
  const workingObserveBuffers: Record<NodeId, ObserveBuffer> = {
    ...state.observeBuffers,
  };
  const workingObserveExtractionRuntime: Record<NodeId, ObserveExtractionRuntime> = {
    ...state.observeExtractionRuntime,
  };
  const workingSequenceOutputs: Record<string, SequenceValue> = {
    ...state.sequenceOutputs,
  };

  // root 결과 머지 + 변경 슬롯 추출.
  const rootSlotChanges = mergeResultIntoWorking(
    rootNodeId,
    rootResult,
    state,
    workingValues,
    workingValid,
    workingPending,
    workingInvalidReasons,
    workingObserveBuffers,
    workingObserveExtractionRuntime,
    workingSequenceOutputs,
  );
  const rootNewlyValidSlots = rootSlotChanges.newlyValidSlots;

  // dirty 셋 — recompute 가 필요한 다운스트림 노드.
  const dirty = new Set<NodeId>();
  for (const slot of rootSlotChanges.changedSlots) {
    const slotKey = outputKey(rootNodeId, slot);
    const edges = topology.outgoingBySourceSlot.get(slotKey) ?? [];
    for (const e of edges) dirty.add(e.to);
  }

  // 위상순서 단일 패스 — Kahn 정렬에 의해 다운스트림은 항상 뒤에 있다.
  for (const nid of topology.order) {
    if (nid === rootNodeId) continue;
    if (!dirty.has(nid)) continue;
    const downstreamState: ExecutionState = {
      values: workingValues,
      sequenceOutputs: workingSequenceOutputs,
      validOutputs: workingValid,
      pendingOutputs: workingPending,
      invalidReasons: workingInvalidReasons,
      observeBuffers: workingObserveBuffers,
      observeExtractionRuntime: workingObserveExtractionRuntime,
      generatorRuntime: state.generatorRuntime,
      stockRuntime: state.stockRuntime,
      simulationTimeMs: state.simulationTimeMs,
    };
    const nodeResult = recomputeNode(nid, downstreamState, model, {
      ...options,
      topology,
      // sourceOverride 없이 호출 — 워킹 state 에 이미 source 변경이 반영돼 있음.
      sourceOverride: undefined,
      observeBuffers: workingObserveBuffers,
      observeExtractionRuntime: workingObserveExtractionRuntime,
      sequenceOutputs: workingSequenceOutputs,
      simulationTimeMs: state.simulationTimeMs,
    });
    const nodeChanges = mergeResultIntoWorking(
      nid,
      nodeResult,
      state,
      workingValues,
      workingValid,
      workingPending,
      workingInvalidReasons,
      workingObserveBuffers,
      workingObserveExtractionRuntime,
      workingSequenceOutputs,
    );
    for (const slot of nodeChanges.changedSlots) {
      const slotKey = outputKey(nid, slot);
      const edges = topology.outgoingBySourceSlot.get(slotKey) ?? [];
      for (const e of edges) dirty.add(e.to);
    }
  }

  return {
    executionState: {
      values: workingValues,
      sequenceOutputs: workingSequenceOutputs,
      validOutputs: workingValid,
      pendingOutputs: workingPending,
      invalidReasons: workingInvalidReasons,
      observeBuffers: workingObserveBuffers,
      observeExtractionRuntime: workingObserveExtractionRuntime,
      // 누적 런타임은 prior 그대로 — cascade 는 generator·stock 의 내부 누적을
      // 진행시키지 않는다. RAF ticker 가 단독 책임.
      generatorRuntime: state.generatorRuntime,
      stockRuntime: state.stockRuntime,
      simulationTimeMs: state.simulationTimeMs,
    },
    rootNewlyValidSlots,
  };
}

/**
 * recomputeNode 결과를 워킹 state 에 머지하고, 어떤 슬롯이 변경됐는지 추출한다.
 * "변경" = validity 전이 (valid↔invalid) 또는 값 변경. 변경된 슬롯의 다운스트림이
 * cascade dirty 셋에 추가될 자격을 가짐.
 *
 * newlyValidSlots 는 invalid→valid 전환만 별도 추적 — 호출자가 펄스 spawn 트리거에
 * 쓰기 위함. Condition 의 true→false flip 시 falseSlot 이 여기에 들어간다.
 */
function mergeResultIntoWorking(
  nodeId: NodeId,
  result: RecomputeNodeResult,
  priorState: ExecutionState,
  workingValues: Record<NodeId, ExecValue>,
  workingValid: Set<string>,
  workingPending: Set<string>,
  workingInvalidReasons: ExecutionState['invalidReasons'],
  workingObserveBuffers: Record<NodeId, ObserveBuffer>,
  workingObserveExtractionRuntime: Record<NodeId, ObserveExtractionRuntime>,
  workingSequenceOutputs: Record<string, SequenceValue>,
): {
  changedSlots: Set<number>;
  newlyValidSlots: Set<number>;
} {
  const changedSlots = new Set<number>();
  const newlyValidSlots = new Set<number>();

  const priorValue = priorState.values[nodeId];
  if (result.newValue !== undefined) {
    workingValues[nodeId] = result.newValue;
  } else {
    delete workingValues[nodeId];
  }
  const valueChanged = result.newValue !== priorValue;

  for (const slotKey of result.outputSlotKeys) {
    const wasValid = priorState.validOutputs.has(slotKey);
    const nowValid = result.validOutputs.has(slotKey);
    const slot = parseSlot(nodeId, slotKey);
    if (slot === null) continue;
    if (wasValid !== nowValid) {
      changedSlots.add(slot);
      if (!wasValid && nowValid) newlyValidSlots.add(slot);
    } else if (nowValid && valueChanged) {
      // 값이 바뀌면 valid 가 유지돼도 다운스트림 입력이 바뀐 것 — cascade.
      changedSlots.add(slot);
    }
    if (nowValid) {
      workingValid.add(slotKey);
      workingPending.delete(slotKey);
    } else {
      workingValid.delete(slotKey);
    }
    if (result.pendingOutputs.has(slotKey)) {
      workingPending.add(slotKey);
    }
  }

  // invalidReasons — result 가 덮어쓴 키만 적용. recomputeNode 는 state.invalidReasons
  // 전체 카피로 시작하므로 result.newInvalidReasons 의 nodeId 키만 덮어쓰면 된다.
  if (result.newInvalidReasons[nodeId] !== undefined) {
    workingInvalidReasons[nodeId] = result.newInvalidReasons[nodeId]!;
  } else {
    delete workingInvalidReasons[nodeId];
  }

  // observeBuffers — 호출자가 워킹 state 를 넘겼으므로 result.newObserveBuffers
  // 는 워킹 인스턴스 (clone) 가 반영된 새 reference. nodeId 의 버퍼만 덮어쓰면
  // 충분 — 다른 노드의 버퍼는 워킹과 일치한다 (recomputeNode 가 mutate 하지 않음).
  if (result.newObserveBuffers[nodeId] !== undefined) {
    workingObserveBuffers[nodeId] = result.newObserveBuffers[nodeId]!;
  }
  if (result.newObserveExtractionRuntime[nodeId] !== undefined) {
    workingObserveExtractionRuntime[nodeId] = result.newObserveExtractionRuntime[nodeId]!;
  }

  // sequenceOutputs — 이 노드의 슬롯 key 만 덮어쓴다.
  for (const slotKey of result.outputSlotKeys) {
    if (result.newSequenceOutputs[slotKey] !== undefined) {
      workingSequenceOutputs[slotKey] = result.newSequenceOutputs[slotKey]!;
    }
  }

  return { changedSlots, newlyValidSlots };
}

function parseSlot(nodeId: NodeId, slotKey: string): number | null {
  const prefix = `${nodeId}:`;
  if (!slotKey.startsWith(prefix)) return null;
  const n = Number.parseInt(slotKey.slice(prefix.length), 10);
  return Number.isNaN(n) ? null : n;
}
