import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { useTrama } from '../store/trama-instance.js';
import { PhosphorIcon } from '../icon/phosphor.js';

/**
 * 전역 미니 플레이어 — 우상단 부동 패널.
 *
 * 현재 노출:
 * - ▶/⏸ 토글: paused. 생성기 emit과 playback step 진행을 멈춤. in-flight 펄스는 계속.
 * - 리셋: 시뮬레이션 시간 0, generator cursor 재초기화, observe 누적·in-flight 펄스
 *   비움. 모델(노드/엣지/initialValue)은 보존.
 * - 시뮬레이션 시간(mm:ss.s) — `executionState.simulationTimeMs` 직접 표시.
 *   ticker가 step마다 갱신.
 * - 속도 프리셋(0.2×/0.5×/1×/1.5×): generator emit + N-step playback에 곱해진다.
 *   값은 [[time-settings]]의 `stepSpeedMultiplier`로 들어가고 model-store가 ticker·playback에
 *   반영한다. 펄스 travel은 별개의 시각 효과라 영향받지 않는다.
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

export function MiniPlayer(): JSX.Element {
  const { timeSettingsStore, modelStore } = useTrama();
  const multiplier = timeSettingsStore((s) => s.stepSpeedMultiplier);
  const paused = timeSettingsStore((s) => s.paused);
  const setMultiplier = timeSettingsStore((s) => s.setStepSpeedMultiplier);
  const togglePaused = timeSettingsStore((s) => s.togglePaused);
  const simulationTimeMs = modelStore((s) => s.executionState.simulationTimeMs);
  const resetSimulation = modelStore((s) => s.resetSimulation);

  // 현재 값이 프리셋 중 하나면 그 키를, 아니면 빈 문자열을 active로.
  const activeKey =
    SPEED_PRESETS.find((p) => Math.abs(p - multiplier) < 1e-9)?.toString() ?? '';

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
      <span className="trama-mini-player-divider" />
      <span className="trama-mini-player-time" aria-label="시뮬레이션 시간">
        {formatSimulationTime(simulationTimeMs)}
      </span>
      <span className="trama-mini-player-divider" />
      <ToggleGroup.Root
        type="single"
        className="trama-mini-player-speed"
        value={activeKey}
        onValueChange={(v) => {
          if (!v) return;
          const next = parseFloat(v);
          if (Number.isFinite(next)) setMultiplier(next);
        }}
        aria-label="재생 속도"
      >
        {SPEED_PRESETS.map((p) => (
          <ToggleGroup.Item
            key={p}
            value={p.toString()}
            className="trama-mini-player-speed-item"
            aria-label={`${p}배속`}
          >
            {p}×
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}
