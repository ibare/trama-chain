import type { StoreApi } from 'zustand';
import {
  asBooleanGate,
  computeStockRate,
  isGeneratorNode,
  isSequence,
  isStockNode,
  numericValue,
  outputKey,
  pruneStockWindow,
  recomputeNode,
  resolveScalar,
  unwrap,
  type Edge,
  type ExecValue,
  type NodeId,
} from '@trama/core';
import { commitExecutionState } from './execution-commit.js';
import { computeExecutionState } from './execution-merge.js';
import { combinerRegistry, shapeRegistry } from './registries.js';
import { fizzexExpressionEvaluator } from '../expression/fizzex-evaluator.js';
import type { ModelStore } from './model-store.js';
import type { NodeFlashRegistry } from '../pulse/node-flash-registry.js';
import type { Pulse } from '../pulse/pulse-registry.js';
import type { SpawnPolicy } from './spawn-policy.js';

/**
 * 펄스 도착 처리의 단일 자리 — generator/stock/일반 3 분기를 한 모듈에 캡슐화
 * (L5-3). createModelStore 의 책임에서 분리. 본문 mechanic 은 그대로 유지하고
 * deps 만 주입.
 *
 * 호출 시퀀스:
 *   - createSpawnPolicy 가 `getHandlePulseArrival: () => handlePulseArrival` lazy
 *     ref 로 본 모듈의 결과를 가리킴.
 *   - 본 모듈은 deps 로 spawn 함수를 받음 → 직접 호출.
 *   순환은 lazy ref 한 방향으로만 — pulse-arrival 은 spawn 을 즉시 호출,
 *   spawn 은 pulse-arrival 을 lazy 로 호출.
 *
 * 본문에 3 분기가 있는 이유:
 *  - Generator: ticker 가 자기 값의 출처이므로 펄스 도착은 gateOpen 캐시만
 *    갱신하고 ticker reconcile.
 *  - Stock: 누적의 단일 출처 (RAF/scrub 경로는 level 유지만 수행). capacity
 *    클램프 + window/rate 계산 + slot 0/1(overflow)/2(rate) outgoing spawn.
 *  - 일반: recomputeNode + valid→invalid 면 전체 재계산 + 새로 valid 가 된
 *    슬롯 cascade. 그 외엔 부분 commit + 갱신된 슬롯만 spawn.
 */
export interface PulseArrivalDeps {
  store: StoreApi<ModelStore>;
  nodeFlashRegistry: NodeFlashRegistry;
  spawnOutgoingPulses: SpawnPolicy['spawnOutgoingPulses'];
  spawnStockSlotPulse: SpawnPolicy['spawnStockSlotPulse'];
  reconcileSimulationLoop: () => void;
}

export function createPulseArrivalHandler(
  deps: PulseArrivalDeps,
): (pulse: Pulse) => void {
  const {
    store,
    nodeFlashRegistry,
    spawnOutgoingPulses,
    spawnStockSlotPulse,
    reconcileSimulationLoop,
  } = deps;

  return function handlePulseArrival(pulse: Pulse): void {
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
          executionState: commitExecutionState(s.executionState, {
            generatorRuntime: newRuntime,
          }),
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
          executionState: commitExecutionState(s.executionState, {
            values: newValues,
            validOutputs: newValid,
            pendingOutputs: newPending,
            stockRuntime: newStockRuntime,
          }),
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
        executionState: commitExecutionState(s.executionState, {
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
          // generatorRuntime / stockRuntime / simulationTimeMs 는 prev 자동 보존.
        }),
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
  };
}
