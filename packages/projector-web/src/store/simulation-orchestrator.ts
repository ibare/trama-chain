import type { TimeSettingsState, TimeSettingsStore } from './time-settings.js';

/**
 * paused 전이에서 호출되는 phase. 항상 time-axis → effects 순서로 호출돼,
 * effects 핸들러가 spawn·시드를 시작할 시점에 시간 축(pulse-registry pausedAt·
 * startTime) 은 이미 일관된 상태가 되어 있도록 강제한다.
 *
 * - `time-axis`: pulse-registry 의 pausedAt 갱신·pulse startTime 보정처럼,
 *   시간이 흐르는/멈춘 상태로 전환되는 그 순간에 *시간 컨텍스트* 자체를 봉합하는
 *   조정. 가시 효과(spawn, 시드, loop) 보다 반드시 먼저 일어나야 "시각이 인과보다
 *   먼저 가는" 오작동을 막을 수 있다.
 * - `effects`: model-store 의 unpause 시드, 시뮬레이션 loop start/stop, playback
 *   재예약처럼 *그래프 상태/시각* 에 변화를 일으키는 동작.
 */
export type PauseTransitionPhase = 'time-axis' | 'effects';

export type PauseTransitionHandler = (
  state: TimeSettingsState,
  prev: TimeSettingsState,
) => void;

export interface SimulationOrchestrator {
  /**
   * paused 전이(true↔false) 에 phase 별 핸들러를 등록.
   * 같은 phase 안에서는 등록 순서. 다른 phase 사이는 항상 time-axis → effects.
   * 반환 함수를 호출하면 해당 핸들러만 등록 해제된다.
   */
  onPauseTransition(
    phase: PauseTransitionPhase,
    handler: PauseTransitionHandler,
  ): () => void;
  dispose(): void;
}

export interface SimulationOrchestratorDeps {
  timeSettingsStore: TimeSettingsStore;
}

/**
 * pulse-registry / model-store 가 각자 timeSettingsStore.subscribe 로 paused
 * 전이를 받던 구조를 단일 진입점으로 바꾼다. 두 모듈의 호출 순서가 *구독 등록
 * 순서* 라는 묵시적 의존을 phase 라는 *명시적 계약* 으로 만든다 — 신규 구독자가
 * 추가돼도 phase 순서가 유지되어야 회귀가 일어난다.
 */
export function createSimulationOrchestrator(
  deps: SimulationOrchestratorDeps,
): SimulationOrchestrator {
  const phases: Record<PauseTransitionPhase, Set<PauseTransitionHandler>> = {
    'time-axis': new Set(),
    effects: new Set(),
  };
  // 순서 명시 — 단일 출처. 새로운 phase 가 추가되면 이 배열도 갱신해야 한다는
  // 강제 (TypeScript 가 누락 시 record 가 좁아진다).
  const phaseOrder: PauseTransitionPhase[] = ['time-axis', 'effects'];

  const unsubscribe = deps.timeSettingsStore.subscribe((state, prev) => {
    if (state.paused === prev.paused) return;
    for (const phase of phaseOrder) {
      // 등록 순서 보존 — Set 의 iteration 순서는 insertion order.
      for (const handler of phases[phase]) handler(state, prev);
    }
  });

  return {
    onPauseTransition(phase, handler) {
      phases[phase].add(handler);
      return () => {
        phases[phase].delete(handler);
      };
    },
    dispose() {
      unsubscribe();
      for (const phase of phaseOrder) phases[phase].clear();
    },
  };
}
