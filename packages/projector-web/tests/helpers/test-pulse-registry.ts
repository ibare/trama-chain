import {
  createPulseRegistry,
  type PulseRegistry,
} from '../../src/pulse/pulse-registry.js';
import { createPulseSettingsStore } from '../../src/store/pulse-settings.js';
import type { TimeSettingsStore } from '../../src/store/time-settings.js';
import {
  createMockAnimationLoop,
  type MockAnimationLoop,
} from './animation-loop.js';
import { createIsolatedTimeSettingsStore } from './time-settings-store.js';

/**
 * createPulseRegistry + deps 한 번에 묶어 반환. 테스트는 헬퍼 4개를 개별 import
 * 하지 않고 이 헬퍼로 한 줄에 셋업.
 *
 * 호출자가 timeSettingsStore 를 명시하지 않으면 기본 paused 상태 (createTimeSettingsStore 기본)
 * 로 새 격리 store 를 만든다.
 */
export interface TestPulseRegistry {
  registry: PulseRegistry;
  animationLoop: MockAnimationLoop;
  timeSettingsStore: TimeSettingsStore;
}

export function createTestPulseRegistry(opts?: {
  timeSettingsStore?: TimeSettingsStore;
}): TestPulseRegistry {
  const animationLoop = createMockAnimationLoop();
  const timeSettingsStore = opts?.timeSettingsStore ?? createIsolatedTimeSettingsStore();
  const pulseSettingsStore = createPulseSettingsStore();
  const registry = createPulseRegistry({
    animationLoop,
    pulseSettingsStore,
    timeSettingsStore,
  });
  return { registry, animationLoop, timeSettingsStore };
}
