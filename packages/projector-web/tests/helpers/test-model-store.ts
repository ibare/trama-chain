import { createNodeFlashRegistry, type NodeFlashRegistry } from '../../src/pulse/node-flash-registry.js';
import {
  createPulseRegistry,
  type PulseRegistry,
} from '../../src/pulse/pulse-registry.js';
import { createPulseSettingsStore } from '../../src/store/pulse-settings.js';
import {
  createSimulationOrchestrator,
  type SimulationOrchestrator,
} from '../../src/store/simulation-orchestrator.js';
import { createModelStore, type ModelStoreInstance } from '../../src/store/model-store.js';
import type { TimeSettingsStore } from '../../src/store/time-settings.js';
import {
  createMockAnimationLoop,
  type MockAnimationLoop,
} from './animation-loop.js';
import { createIsolatedTimeSettingsStore } from './time-settings-store.js';

/**
 * createModelStore + 모든 deps (orchestrator·pulseRegistry·animationLoop·
 * timeSettingsStore·nodeFlashRegistry) 를 한 번에 묶어 반환. trama-instance 의
 * 실 wiring 과 동일한 phase 순서·구독 관계를 그대로 재현해 단기+중기 fix 의 통합
 * 동작을 검증할 수 있다.
 *
 * 기본 paused=true (createTimeSettingsStore 기본) — 테스트에서 명시적으로
 * setPaused(false) 를 호출해 unpause 전이를 트리거.
 */
export interface TestModelStore {
  modelStore: ModelStoreInstance;
  pulseRegistry: PulseRegistry;
  animationLoop: MockAnimationLoop;
  timeSettingsStore: TimeSettingsStore;
  simulationOrchestrator: SimulationOrchestrator;
  nodeFlashRegistry: NodeFlashRegistry;
  dispose(): void;
}

export function createTestModelStore(opts?: {
  paused?: boolean;
  stepSpeedMultiplier?: number;
}): TestModelStore {
  const animationLoop = createMockAnimationLoop();
  const timeSettingsStore = createIsolatedTimeSettingsStore(opts);
  const simulationOrchestrator = createSimulationOrchestrator({ timeSettingsStore });
  const pulseSettingsStore = createPulseSettingsStore();
  const nodeFlashRegistry = createNodeFlashRegistry();
  const pulseRegistry = createPulseRegistry({
    animationLoop,
    pulseSettingsStore,
    timeSettingsStore,
    simulationOrchestrator,
  });
  const modelStore = createModelStore({
    pulseRegistry,
    nodeFlashRegistry,
    timeSettingsStore,
    animationLoop,
    simulationOrchestrator,
  });
  return {
    modelStore,
    pulseRegistry,
    animationLoop,
    timeSettingsStore,
    simulationOrchestrator,
    nodeFlashRegistry,
    dispose(): void {
      pulseRegistry.dispose();
      simulationOrchestrator.dispose();
      animationLoop.dispose();
    },
  };
}
