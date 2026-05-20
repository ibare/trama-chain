import {
  createTimeSettingsStore,
  type TimeSettingsStore,
} from '../../src/store/time-settings.js';

/**
 * 테스트용 timeSettingsStore. zustand 의 createTimeSettingsStore 는 호출마다
 * 새 인스턴스를 만들므로 본질적으로 격리되어 있지만, 테스트가 시작 paused 상태를
 * 명시적으로 지정할 수 있도록 thin wrapper 로 제공.
 *
 * 기본은 paused=true (createTimeSettingsStore 의 기본과 동일).
 */
export function createIsolatedTimeSettingsStore(opts?: {
  paused?: boolean;
  stepSpeedMultiplier?: number;
}): TimeSettingsStore {
  const store = createTimeSettingsStore();
  if (opts?.paused === false) store.getState().setPaused(false);
  if (opts?.stepSpeedMultiplier !== undefined) {
    store.getState().setStepSpeedMultiplier(opts.stepSpeedMultiplier);
  }
  return store;
}
