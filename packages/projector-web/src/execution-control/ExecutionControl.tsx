import { useCallback } from 'react';
import { hasFeedbackEdges } from '@trama/core';
import { useModelStore } from '../store/index.js';

export function ExecutionControl(): JSX.Element | null {
  const model = useModelStore((s) => s.model);
  const setExecution = useModelStore((s) => s.setExecution);
  const recompute = useModelStore((s) => s.recompute);
  const play = useModelStore((s) => s.play);
  const playbackStep = useModelStore((s) => s.playbackStep);
  const trajectoryLength = useModelStore((s) => s.trajectory.length);

  const visible = hasFeedbackEdges(model);

  const onStepsChange = useCallback(
    (v: number) => {
      if (!Number.isFinite(v) || v < 1) return;
      setExecution({ steps: Math.round(v) });
    },
    [setExecution],
  );

  if (!visible) return null;

  return (
    <div className="trama-exec-control" onPointerDown={(e) => e.stopPropagation()}>
      <input
        type="number"
        min={1}
        value={model.execution.steps}
        onChange={(e) => onStepsChange(parseInt(e.target.value, 10))}
      />
      <input
        type="text"
        placeholder="단위"
        value={model.execution.stepUnit ?? ''}
        onChange={(e) => setExecution({ stepUnit: e.target.value || null })}
      />
      <button type="button" onClick={play} title="step별 재생">
        ▶ 재생
      </button>
      <button type="button" onClick={recompute} title="다시 실행 (stochastic 모델 재실행용)">
        다시 실행
      </button>
      {playbackStep !== null && (
        <span className="trama-exec-step-indicator">
          {playbackStep + 1} / {trajectoryLength}
        </span>
      )}
    </div>
  );
}
