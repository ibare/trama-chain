import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { useTrama } from '../store/trama-instance.js';
import { PhosphorIcon } from '../icon/phosphor.js';

/**
 * 전역 미니 플레이어 — 우상단 부동 패널.
 *
 * 현재 노출:
 * - 속도 프리셋(0.2×/0.5×/1×/1.5×/2×): generator emit + N-step playback에 곱해진다.
 *   값은 [[time-settings]]의 `stepSpeedMultiplier`로 들어가고 model-store가 ticker·playback에
 *   반영한다. 펄스 travel은 별개의 시각 효과라 영향받지 않는다.
 * - ▶/⏸ 토글: paused. 생성기 emit과 playback step 진행을 멈춤. in-flight 펄스는 계속.
 *
 * 음악 미니 플레이어 결로 디자인 — 앞으로 다른 전역 컨트롤(시드 재설정·loop 모드 등)이
 * 들어올 수 있도록 패널 자체가 한 가족.
 */
const SPEED_PRESETS = [0.2, 0.5, 1, 1.5] as const;

export function MiniPlayer(): JSX.Element {
  const { timeSettingsStore } = useTrama();
  const multiplier = timeSettingsStore((s) => s.stepSpeedMultiplier);
  const paused = timeSettingsStore((s) => s.paused);
  const setMultiplier = timeSettingsStore((s) => s.setStepSpeedMultiplier);
  const togglePaused = timeSettingsStore((s) => s.togglePaused);

  // 현재 값이 프리셋 중 하나면 그 키를, 아니면 빈 문자열을 active로.
  const activeKey =
    SPEED_PRESETS.find((p) => Math.abs(p - multiplier) < 1e-9)?.toString() ?? '';

  return (
    <div className="trama-mini-player" onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="trama-mini-player-play"
        onClick={togglePaused}
        title={paused ? '재생' : '일시정지'}
        aria-label={paused ? '재생' : '일시정지'}
      >
        <PhosphorIcon name={paused ? 'play' : 'pause'} size={18} />
      </button>
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
