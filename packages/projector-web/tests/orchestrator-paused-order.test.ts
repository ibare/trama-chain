import { describe, expect, it } from 'vitest';
import { createSimulationOrchestrator } from '../src/store/simulation-orchestrator.js';
import { createIsolatedTimeSettingsStore } from './helpers/time-settings-store.js';

describe('SimulationOrchestrator — paused 전이 phase 순서 (P10)', () => {
  it('unpause 시 time-axis 핸들러가 effects 핸들러보다 먼저 호출', () => {
    const timeSettingsStore = createIsolatedTimeSettingsStore();
    const orchestrator = createSimulationOrchestrator({ timeSettingsStore });

    const calls: string[] = [];
    orchestrator.onPauseTransition('effects', () => calls.push('effects'));
    orchestrator.onPauseTransition('time-axis', () => calls.push('time-axis'));

    timeSettingsStore.getState().setPaused(false);

    expect(calls).toEqual(['time-axis', 'effects']);

    orchestrator.dispose();
  });

  it('pause 시에도 phase 순서가 같음', () => {
    const timeSettingsStore = createIsolatedTimeSettingsStore({ paused: false });
    const orchestrator = createSimulationOrchestrator({ timeSettingsStore });

    const calls: string[] = [];
    orchestrator.onPauseTransition('effects', () => calls.push('effects'));
    orchestrator.onPauseTransition('time-axis', () => calls.push('time-axis'));

    timeSettingsStore.getState().setPaused(true);

    expect(calls).toEqual(['time-axis', 'effects']);

    orchestrator.dispose();
  });

  it('paused 가 같은 값으로 set 되면 핸들러가 호출되지 않음', () => {
    const timeSettingsStore = createIsolatedTimeSettingsStore({ paused: true });
    const orchestrator = createSimulationOrchestrator({ timeSettingsStore });

    let count = 0;
    orchestrator.onPauseTransition('time-axis', () => count++);
    orchestrator.onPauseTransition('effects', () => count++);

    timeSettingsStore.getState().setPaused(true);

    expect(count).toBe(0);

    orchestrator.dispose();
  });

  it('신규 effects subscriber 가 등록돼도 time-axis 가 먼저 호출 (T19 회귀 보호)', () => {
    const timeSettingsStore = createIsolatedTimeSettingsStore();
    const orchestrator = createSimulationOrchestrator({ timeSettingsStore });

    const calls: string[] = [];
    orchestrator.onPauseTransition('effects', () => calls.push('effects-A'));
    orchestrator.onPauseTransition('time-axis', () => calls.push('time-axis'));
    // 신규 구독자 — effects phase 에 두 번째로 추가.
    orchestrator.onPauseTransition('effects', () => calls.push('effects-B'));

    timeSettingsStore.getState().setPaused(false);

    // time-axis 가 먼저, 그 다음 effects 들이 등록 순서로.
    expect(calls).toEqual(['time-axis', 'effects-A', 'effects-B']);

    orchestrator.dispose();
  });

  it('핸들러 등록 해제 시 호출되지 않음', () => {
    const timeSettingsStore = createIsolatedTimeSettingsStore();
    const orchestrator = createSimulationOrchestrator({ timeSettingsStore });

    const calls: string[] = [];
    const unregister = orchestrator.onPauseTransition('time-axis', () =>
      calls.push('time-axis'),
    );
    orchestrator.onPauseTransition('effects', () => calls.push('effects'));

    unregister();
    timeSettingsStore.getState().setPaused(false);

    expect(calls).toEqual(['effects']);

    orchestrator.dispose();
  });

  it('dispose 후에는 paused 변경 시 핸들러 호출 안 됨', () => {
    const timeSettingsStore = createIsolatedTimeSettingsStore();
    const orchestrator = createSimulationOrchestrator({ timeSettingsStore });

    let count = 0;
    orchestrator.onPauseTransition('time-axis', () => count++);
    orchestrator.dispose();

    timeSettingsStore.getState().setPaused(false);

    expect(count).toBe(0);
  });
});
