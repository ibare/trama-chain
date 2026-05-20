import { afterEach, describe, expect, it } from 'vitest';
import { createMockAnimationLoop } from './animation-loop.js';
import { createIsolatedTimeSettingsStore } from './time-settings-store.js';
import { createFakeTimeline } from './pulse-registry-deps.js';
import { createTestPulseRegistry } from './test-pulse-registry.js';

describe('test helpers — self-check', () => {
  it('createMockAnimationLoop: flushFrame 1 회당 ticker 1 회 호출', () => {
    const loop = createMockAnimationLoop();
    let calls = 0;
    const unreg = loop.register(() => {
      calls += 1;
    });
    expect(loop.tickerCount()).toBe(1);
    loop.flushFrame();
    expect(calls).toBe(1);
    loop.flushFrame(3);
    expect(calls).toBe(4);
    unreg();
    loop.flushFrame();
    expect(calls).toBe(4);
    expect(loop.tickerCount()).toBe(0);
  });

  it('createIsolatedTimeSettingsStore: 호출마다 독립 인스턴스', () => {
    const a = createIsolatedTimeSettingsStore();
    const b = createIsolatedTimeSettingsStore();
    expect(a).not.toBe(b);
    a.getState().setPaused(false);
    expect(a.getState().paused).toBe(false);
    expect(b.getState().paused).toBe(true);
  });

  it('createIsolatedTimeSettingsStore: opts 적용', () => {
    const s = createIsolatedTimeSettingsStore({ paused: false, stepSpeedMultiplier: 2 });
    expect(s.getState().paused).toBe(false);
    expect(s.getState().stepSpeedMultiplier).toBe(2);
  });

  describe('createFakeTimeline', () => {
    let tl: ReturnType<typeof createFakeTimeline> | null = null;
    afterEach(() => {
      tl?.restore();
      tl = null;
    });

    it('advance 가 performance.now() 누적', () => {
      tl = createFakeTimeline(1000);
      expect(performance.now()).toBe(1000);
      tl.advance(250);
      expect(performance.now()).toBe(1250);
      tl.advance(750);
      expect(performance.now()).toBe(2000);
    });
  });

  it('createTestPulseRegistry: 모든 deps 묶여 동작', () => {
    const { registry, animationLoop, timeSettingsStore } = createTestPulseRegistry();
    expect(animationLoop.tickerCount()).toBe(0);
    expect(timeSettingsStore.getState().paused).toBe(true);
    expect(registry.getActive()).toEqual([]);
    registry.dispose();
  });
});
