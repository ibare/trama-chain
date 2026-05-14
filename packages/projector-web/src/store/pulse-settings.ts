import { create, type StoreApi, type UseBoundStore } from 'zustand';

/**
 * 펄스 시각 효과 설정. 모델과 별도 — undo/redo·직렬화 대상이 아닌 세션 설정.
 *
 * travelSpeedMultiplier: 1 = 기본(토큰 값 그대로), <1 = 빠름, >1 = 느림.
 * 펄스는 spawn 시점에 (token baseMs * multiplier)를 자기 객체에 박제하므로
 * 도중에 값이 바뀌어도 진행 중인 펄스에는 영향이 없다 — 시각적 점프 방지.
 *
 * 권장 범위 [0.1, 8]. UI는 후속 작업에서 붙는다 (현재는 인터페이스만 노출).
 */
export interface PulseSettings {
  travelSpeedMultiplier: number;
}

interface PulseSettingsActions {
  setTravelSpeedMultiplier: (value: number) => void;
  resetPulseSettings: () => void;
}

export type PulseSettingsState = PulseSettings & PulseSettingsActions;
export type PulseSettingsStore = UseBoundStore<StoreApi<PulseSettingsState>>;

const DEFAULT_SPEED = 1;

export function createPulseSettingsStore(): PulseSettingsStore {
  return create<PulseSettingsState>((set) => ({
    travelSpeedMultiplier: DEFAULT_SPEED,
    setTravelSpeedMultiplier: (value) => {
      if (!Number.isFinite(value) || value <= 0) return;
      set({ travelSpeedMultiplier: value });
    },
    resetPulseSettings: () => set({ travelSpeedMultiplier: DEFAULT_SPEED }),
  }));
}

