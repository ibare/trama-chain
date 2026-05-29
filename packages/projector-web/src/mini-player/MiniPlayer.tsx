import { useTrama } from '../store/trama-instance.js';
import { PhosphorIcon } from '../icon/phosphor.js';
import { FpsChip } from './FpsChip.js';

/**
 * 전역 미니 플레이어 — 우상단 부동 패널.
 *
 * 현재 노출:
 * - ▶/⏸ 토글: paused. 생성기 emit과 playback step 진행을 멈춤. in-flight 펄스는 계속.
 * - 리셋: 시뮬레이션 시간 0, generator cursor 재초기화, observe 누적·in-flight 펄스
 *   비움. 모델(노드/엣지/initialValue)은 보존.
 * - 시뮬레이션 시간(mm:ss.s) — `executionState.simulationTimeMs` 직접 표시.
 *   ticker가 step마다 갱신.
 * - 속도 프리셋(0.2×/0.5×/1×/1.5×): 현재 배속 pill을 누르면 다음 프리셋으로 순환
 *   (wraparound). 우상단 부동이라 위쪽 공간이 부족해서 메뉴/popover 형태가 잘리는
 *   문제를 구조적으로 회피. 값은 [[time-settings]]의 `stepSpeedMultiplier`로 들어가고
 *   model-store가 ticker·playback에 반영한다. 펄스 travel은 별개의 시각 효과라
 *   영향받지 않는다.
 *
 * 음악 미니 플레이어 결로 디자인 — 앞으로 다른 전역 컨트롤(시드 재설정·loop 모드 등)이
 * 들어올 수 있도록 패널 자체가 한 가족.
 */
const SPEED_PRESETS = [0.2, 0.5, 1, 1.5] as const;

function formatSimulationTime(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60_000);
  const seconds = (total % 60_000) / 1000;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

function nextPreset(current: number): number {
  const idx = SPEED_PRESETS.findIndex((p) => Math.abs(p - current) < 1e-9);
  const nextIdx = idx >= 0 ? (idx + 1) % SPEED_PRESETS.length : 0;
  return SPEED_PRESETS[nextIdx] as number;
}

export function MiniPlayer(): JSX.Element {
  const {
    timeSettingsStore,
    modelStore,
    uiStore,
    viewport: viewportContainer,
  } = useTrama();
  const multiplier = timeSettingsStore((s) => s.stepSpeedMultiplier);
  const paused = timeSettingsStore((s) => s.paused);
  const setMultiplier = timeSettingsStore((s) => s.setStepSpeedMultiplier);
  const togglePaused = timeSettingsStore((s) => s.togglePaused);
  const simulationTimeMs = modelStore((s) => s.executionState.simulationTimeMs);
  const resetSimulation = modelStore((s) => s.resetSimulation);
  const readOnly = uiStore((s) => s.readOnly);
  const openNodePickerGlobal = uiStore((s) => s.openNodePickerGlobal);
  const fullscreen = uiStore((s) => s.fullscreen);
  const toggleFullscreen = uiStore((s) => s.toggleFullscreen);

  // 캔버스가 부착돼 있지 않거나 0×0 이면 fallback (0,0). NodePicker 측 free-row 배치도
  // canvasPos 만 기준으로 동작하므로 안전한 기본값.
  function handleAdd(): void {
    const center = viewportContainer.getCanvasViewportCenter() ?? { x: 0, y: 0 };
    openNodePickerGlobal(center);
  }

  return (
    <div className="trama-mini-player" onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="trama-mini-player-button"
        onClick={togglePaused}
        title={paused ? '재생' : '일시정지'}
        aria-label={paused ? '재생' : '일시정지'}
      >
        <PhosphorIcon name={paused ? 'play' : 'pause'} size={18} />
      </button>
      <button
        type="button"
        className="trama-mini-player-button"
        onClick={resetSimulation}
        title="리셋"
        aria-label="시뮬레이션 리셋"
      >
        <PhosphorIcon name="reset" size={18} />
      </button>
      <button
        type="button"
        className="trama-mini-player-button"
        onClick={() => viewportContainer.requestFit()}
        title="전체 보기 (모든 노드 화면 안으로)"
        aria-label="전체 보기"
      >
        <PhosphorIcon name="target" size={18} />
      </button>
      <span className="trama-mini-player-time" aria-label="시뮬레이션 시간">
        {formatSimulationTime(simulationTimeMs)}
      </span>
      <button
        type="button"
        className="trama-mini-player-speed-trigger"
        onClick={() => setMultiplier(nextPreset(multiplier))}
        title="재생 속도 (클릭으로 다음 프리셋)"
        aria-label={`재생 속도 ${multiplier}배. 클릭하면 다음 프리셋으로 변경.`}
      >
        {multiplier}×
      </button>
      {!readOnly && (
        <button
          type="button"
          className="trama-mini-player-button"
          onClick={handleAdd}
          title="노드 추가"
          aria-label="노드 추가"
        >
          <PhosphorIcon name="plus" size={18} />
        </button>
      )}
      <button
        type="button"
        className="trama-mini-player-button"
        onClick={toggleFullscreen}
        title={fullscreen ? '풀스크린 종료 (Esc)' : '풀스크린'}
        aria-label={fullscreen ? '풀스크린 종료' : '풀스크린 진입'}
      >
        <PhosphorIcon name={fullscreen ? 'collapse' : 'expand'} size={18} />
      </button>
      <FpsChip />
    </div>
  );
}
