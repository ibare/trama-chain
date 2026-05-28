import {
  executeModel,
  initializeFromInitialValues,
  isGeneratorNode,
  isStockNode,
  isValueNode,
  outputKey,
  type ExecutionState,
  type ExecValue,
  type GeneratorRuntime,
  type Model,
  type NodeId,
} from '@trama-chain/core';
import { commitExecutionState } from './execution-commit.js';
import { combinerRegistry, shapeRegistry } from './registries.js';
import { fizzexExpressionEvaluator } from '../expression/fizzex-evaluator.js';

/**
 * 모델 편집 직후의 ExecutionState 재구성 — fresh 재계산 후 prior 의 *보존이
 * 필요한 누적 상태* 를 머지한다. 모든 mutation 액션(11곳)이 통과하는 단일 진입점.
 *
 * 책임:
 *  1. `executeModel` 로 fresh 한 ExecutionState/trajectory 생성. 실패 시
 *     `initializeFromInitialValues` 폴백.
 *  2. prior 가 있으면 *모델 편집으로 리셋되면 안 되는* 누적 상태 머지:
 *     - ValueNode 의 마지막 수신값 (lag=0 incoming 보유 시)
 *     - Stock 의 level 과 rate 윈도우
 *     - ObserveNode 의 누적 버퍼·throttle 런타임·sequence 슬롯 출력
 *     - GeneratorNode 의 cursor (paradigm kind 동일 시)
 *
 * paused 인자는 executeModel 에 그대로 전달. 정적 재구성이라 stepIntervalMs 는
 * 0 유지 (RAF 가 단독으로 시간 누적 책임).
 *
 * model-store.ts 의 일부였으나 순수 함수라 별도 모듈로 분리 — 1370 줄 store 의
 * 첫 책임 분리 (L5-1).
 */
export function computeExecutionState(
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
      // 로 단독 책임. 여기서 STEP_TICK_MS 를 전달하면 첫 ▶ 시드 sentinel
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
    executionState: commitExecutionState(fresh.executionState, {
      values: mergedValues,
      validOutputs: mergedValid,
      pendingOutputs: mergedPending,
      generatorRuntime: mergedRuntime,
      stockRuntime: mergedStockRuntime,
      observeBuffers: mergedObserveBuffers,
      observeExtractionRuntime: mergedExtractionRuntime,
      sequenceOutputs: mergedSequenceOutputs,
    }),
    trajectory: fresh.trajectory,
  };
}
