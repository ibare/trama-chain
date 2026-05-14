import { useCallback } from 'react';
import * as Form from '@radix-ui/react-form';
import { hasFeedbackEdges } from '@trama/core';
import { useTrama } from '../store/index.js';

export function ExecutionControl(): JSX.Element | null {
  const { modelStore } = useTrama();
  const model = modelStore((s) => s.model);
  const setExecution = modelStore((s) => s.setExecution);
  const recompute = modelStore((s) => s.recompute);
  const play = modelStore((s) => s.play);
  const playbackStep = modelStore((s) => s.playbackStep);
  const trajectoryLength = modelStore((s) => s.trajectory.length);

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
    <Form.Root
      className="trama-exec-control"
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => e.preventDefault()}
    >
      <Form.Field name="steps" className="trama-exec-field">
        <Form.Control
          type="number"
          min={1}
          value={model.execution.steps}
          onChange={(e) => onStepsChange(parseInt(e.currentTarget.value, 10))}
        />
      </Form.Field>
      <Form.Field name="stepUnit" className="trama-exec-field">
        <Form.Control
          type="text"
          placeholder="단위"
          value={model.execution.stepUnit ?? ''}
          onChange={(e) => setExecution({ stepUnit: e.currentTarget.value || null })}
        />
      </Form.Field>
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
    </Form.Root>
  );
}
