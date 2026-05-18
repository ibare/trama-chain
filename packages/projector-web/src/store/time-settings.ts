import { create, type StoreApi, type UseBoundStore } from 'zustand';

/**
 * 데이터 전달 시간 축 설정. 모델과 별도 — undo/redo·직렬화 대상이 아닌 세션 설정.
 *
 * `stepSpeedMultiplier`: 1 = 기본(STEP_TICK_MS 그대로), >1 = 빠름, <1 = 느림.
 * Generator emit 주기와 N-step playback 진행에 곱해진다.
 * 펄스 travel은 별개의 시각 효과로 [[pulse-settings]]가 담당 — 이 값에 영향받지 않는다.
 *
 * `paused`: true면 데이터 전달 시간축이 통째로 정지한다 —
 * generator emit, playback step, 엣지 위를 흐르던 펄스까지 모두 그 자리에서 freeze.
 * unpause 시 pulse는 freeze된 progress 위치에서 이어 진행한다 — pulse-registry가
 * paused 지속시간만큼 startTime을 보정해 시간 흐름을 봉합.
 *
 * 권장 multiplier 범위: 0.1 ~ 5.
 */
export interface TimeSettings {
  stepSpeedMultiplier: number;
  paused: boolean;
}

interface TimeSettingsActions {
  setStepSpeedMultiplier: (value: number) => void;
  setPaused: (value: boolean) => void;
  togglePaused: () => void;
  resetTimeSettings: () => void;
}

export type TimeSettingsState = TimeSettings & TimeSettingsActions;
export type TimeSettingsStore = UseBoundStore<StoreApi<TimeSettingsState>>;

const DEFAULT_SPEED = 1;

export function createTimeSettingsStore(): TimeSettingsStore {
  return create<TimeSettingsState>((set) => ({
    stepSpeedMultiplier: DEFAULT_SPEED,
    paused: true,
    setStepSpeedMultiplier: (value) => {
      if (!Number.isFinite(value) || value <= 0) return;
      set({ stepSpeedMultiplier: value });
    },
    setPaused: (value) => set({ paused: value }),
    togglePaused: () => set((s) => ({ paused: !s.paused })),
    resetTimeSettings: () => set({ stepSpeedMultiplier: DEFAULT_SPEED, paused: true }),
  }));
}
