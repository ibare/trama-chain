import type { StoreApi } from 'zustand';
import type { Model, NodeId } from '@trama/core';
import { computeExecutionState } from './execution-merge.js';
import type { ModelStore } from './model-store.js';
import type { NodeFlashRegistry } from '../pulse/node-flash-registry.js';
import type { SimulationLoop } from './simulation-loop.js';
import type { SpawnPolicy } from './spawn-policy.js';

/**
 * model 편집 → executionState 재계산 + commit 의 단일 자리 (L5-6). mutation
 * 액션들이 반복하던 `set({ model: after, ...computeExecutionState(...) })` 패턴과
 * 부수 효과(reconcile / spawn+flash) 트리거를 한곳으로 모은다.
 *
 * mutation 별 옵션 조합 (현 mechanic 그대로):
 *  - setModel: recomputeExec + reconcileLoop
 *  - recompute: recomputeExec (model 은 동일 — `after === before`)
 *  - addXxxNode (9개): recomputeExec
 *  - updateNode(affectsValues=true): recomputeExec + flashAndSpawnFrom + reconcileLoop
 *  - updateNode(affectsValues=false): modelOnly + reconcileLoop
 *  - removeNode: recomputeExec (reconcileLoop 없음 — 현 동작 그대로)
 *  - addEdge / updateEdge / removeEdge: recomputeExec + reconcileLoop
 *  - setExecution: recomputeExec
 *
 * scrubInitialValue 는 commitExecutionState 헬퍼와 trajectory 부분 patch 를 직접
 * 다루는 별도 경로 — 본 헬퍼 범위 외. setQuestion 도 model 만 set, recompute 없음
 * 이라 별도 (helper 우회).
 *
 * assertEditable 가드는 호출자(model-store) 책임 — recompute 처럼 guard-free 한
 * 액션이 있어 헬퍼가 강제하면 회귀. 본 헬퍼는 *commit 경로* 만 담당.
 */
export interface ExecutionStoreDeps {
  store: StoreApi<ModelStore>;
  nodeFlashRegistry: NodeFlashRegistry;
  spawnOutgoingPulses: SpawnPolicy['spawnOutgoingPulses'];
  reconcileSimulationLoop: SimulationLoop['reconcileSimulationLoop'];
}

export interface CommitModelMutationOptions {
  /** mutation 결과 모델. 호출자가 사전에 `after === before` skip 처리한 뒤 호출. */
  after: Model;
  /**
   * mutation 직전 prior 모델. computeExecutionState 에 priorModel 로 넘겨 누적
   * 상태 머지(ValueNode last-received, Stock level, Observe 버퍼 등) 의 권위를
   * 결정한다. recompute 액션은 `after === before` 로 동일 객체 넘김.
   */
  before: Model;
  /**
   * false 면 executionState 재계산 없이 `set({ model: after })` 만. updateNode 의
   * 비실행 patch(position/label/displayMode 등) 경로 전용. 기본 true.
   */
  recomputeExec?: boolean;
  /** 변이 후 reconcileSimulationLoop 호출 여부. */
  reconcileLoop?: boolean;
  /**
   * 지정된 노드에 nodeFlashRegistry.trigger + spawnOutgoingPulses 호출.
   * updateNode 의 affectsValues 경로 전용.
   */
  flashAndSpawnFrom?: NodeId;
}

export interface ExecutionStore {
  commitModelMutation(opts: CommitModelMutationOptions): void;
}

export function createExecutionStore(deps: ExecutionStoreDeps): ExecutionStore {
  const { store, nodeFlashRegistry, spawnOutgoingPulses, reconcileSimulationLoop } = deps;

  function commitModelMutation(opts: CommitModelMutationOptions): void {
    const {
      after,
      before,
      recomputeExec = true,
      reconcileLoop = false,
      flashAndSpawnFrom,
    } = opts;
    if (recomputeExec) {
      const exec = computeExecutionState(after, store.getState().executionState, true, before);
      store.setState({ model: after, ...exec });
    } else {
      store.setState({ model: after });
    }
    if (flashAndSpawnFrom !== undefined) {
      nodeFlashRegistry.trigger(flashAndSpawnFrom);
      const latest = store.getState();
      spawnOutgoingPulses(latest.model, latest.executionState, flashAndSpawnFrom);
    }
    if (reconcileLoop) reconcileSimulationLoop();
  }

  return { commitModelMutation };
}
