import type { StoreApi } from 'zustand';
import type { ExecutionState } from '@trama-chain/core';
import { tokens } from '@trama-chain/tokens';
import type { ModelStore } from './model-store.js';
import type { NodeFlashRegistry } from '../pulse/node-flash-registry.js';
import type { TimeSettingsStore } from './time-settings.js';

/**
 * N-step trajectory 재생 컨트롤러 (L5-7). 시뮬레이션 시간축(simulation-loop)
 * 과는 별개 — *이미 계산된 trajectory* 의 step-by-step 시각 재생을 담당한다.
 *
 * 자가 reschedule 패턴: 다음 step 하나만 setTimeout 으로 예약하고 발화 시
 * 다시 다음 step 을 예약. multiplier 변경이 자연스럽게 다음 간격에 반영되고
 * pause 는 timer 하나만 끊으면 끝. token 으로 in-flight callback 무효화 →
 * play() 가 여러 번 호출되어도 마지막 호출만 살아남는다.
 *
 * 외부 표면:
 *  - play  — playbackStep 0 즉시 적용 + 다음 step 예약
 *  - pause — timer 만 중지 (token 유지). resume 시 같은 playback 이 이어진다
 *  - resumeIfActive — paused 해제 시 호출. playbackStep 이 살아 있으면 다음
 *      step 부터 reschedule. 그렇지 않으면 no-op
 *  - invalidate — token 증가시켜 in-flight callback 차단 + timer 중지.
 *      resetSimulation 같이 playback 자체를 폐기할 때 호출
 */
export interface PlaybackControllerDeps {
  store: StoreApi<ModelStore>;
  timeSettingsStore: TimeSettingsStore;
  nodeFlashRegistry: NodeFlashRegistry;
}

export interface PlaybackController {
  play(): void;
  pause(): void;
  resumeIfActive(): void;
  invalidate(): void;
}

/**
 * playback step 간 wall-time 기본값. multiplier 로 나뉘어 "한 step 을 보는
 * 시간" 으로 환산된다. 시뮬레이션 시간축 (RAF stepTicker) 과 무관.
 */
const STEP_TICK_MS = parseFloat(tokens.motion.durationStepTick);

export function createPlaybackController(
  deps: PlaybackControllerDeps,
): PlaybackController {
  const { store, timeSettingsStore, nodeFlashRegistry } = deps;
  // factory closure — 모듈 전역으로 두면 다중 인스턴스가 token 을 공유한다.
  let activePlaybackToken = 0;
  let playbackTimeoutId: number | null = null;

  function currentPlaybackStepIntervalMs(): number {
    const m = timeSettingsStore.getState().stepSpeedMultiplier;
    return STEP_TICK_MS / (m > 0 ? m : 1);
  }

  function stopTimer(): void {
    if (playbackTimeoutId !== null) {
      window.clearTimeout(playbackTimeoutId);
      playbackTimeoutId = null;
    }
  }

  function applyStep(s: ExecutionState, stepIndex: number, isLast: boolean): void {
    const prev = store.getState().executionState;
    for (const nid of Object.keys(s.values)) {
      if (s.values[nid] !== prev.values[nid]) nodeFlashRegistry.trigger(nid);
    }
    store.setState({ executionState: s, playbackStep: isLast ? null : stepIndex });
  }

  function scheduleStep(token: number, nextIndex: number): void {
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
      if (!isLast) scheduleStep(token, nextIndex + 1);
    }, currentPlaybackStepIntervalMs());
  }

  function play(): void {
    const { trajectory } = store.getState();
    if (trajectory.length <= 1) return;
    stopTimer();
    const token = ++activePlaybackToken;
    // step 0 즉시 적용, 1+ 는 self-rescheduling.
    applyStep(trajectory[0]!, 0, false);
    scheduleStep(token, 1);
  }

  function pause(): void {
    stopTimer();
  }

  function invalidate(): void {
    stopTimer();
    activePlaybackToken++;
  }

  function resumeIfActive(): void {
    const playbackStep = store.getState().playbackStep;
    if (playbackStep === null) return;
    scheduleStep(activePlaybackToken, playbackStep + 1);
  }

  return { play, pause, resumeIfActive, invalidate };
}
