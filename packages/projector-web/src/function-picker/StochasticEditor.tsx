import { useCallback } from 'react';
import * as Form from '@radix-ui/react-form';
import type { Edge } from '@trama-chain/core';
import { useTrama } from '../store/index.js';
import {
  CurveEditorFrame,
  clamp01,
} from './CurveEditorFrame.js';
import { useShapeReset } from './use-shape-commit.js';

interface Props {
  edge: Edge;
}

interface StochasticParams {
  distribution: 'bernoulli';
  winProbability: number;
  winMultiplier: number;
  loseMultiplier: number;
  bias: number;
}

const DEFAULTS: StochasticParams = {
  distribution: 'bernoulli',
  winProbability: 0.05,
  winMultiplier: 5,
  loseMultiplier: -1,
  bias: 0.5,
};

/**
 * stochastic shape은 결과가 매번 달라지므로 직접조작 곡선 편집이 무의미.
 * 대신 도메인 그래프 위에 시각 보강만 제공:
 *
 *  - win  선  : y = clamp01(bias + x * winMultiplier)  (실선)
 *  - lose 선  : y = clamp01(bias + x * loseMultiplier) (점선)
 *  - 기댓값 선: y = clamp01(bias + x * E[mult])         (가운데 점선)
 *  - 확률 막대: 우측 상단에 win 확률 폭만큼 가는 바.
 *
 * 4개 파라미터(prob/win/lose/bias)는 그 아래 number input 그리드로 편집.
 */
export function StochasticEditor({ edge }: Props): JSX.Element {
  const { modelStore } = useTrama();
  const updateEdge = modelStore((s) => s.updateEdge);
  const reset = useShapeReset(edge, DEFAULTS as unknown as Record<string, unknown>);

  const p = edge.shape.params as Partial<StochasticParams>;
  const winProbability = p.winProbability ?? DEFAULTS.winProbability;
  const winMultiplier = p.winMultiplier ?? DEFAULTS.winMultiplier;
  const loseMultiplier = p.loseMultiplier ?? DEFAULTS.loseMultiplier;
  const bias = p.bias ?? DEFAULTS.bias;

  const commit = useCallback(
    (patch: Partial<StochasticParams>) => {
      updateEdge(edge.id, {
        shape: {
          kind: 'stochastic',
          params: {
            distribution: 'bernoulli',
            winProbability,
            winMultiplier,
            loseMultiplier,
            bias,
            ...patch,
          },
        },
      });
    },
    [bias, edge.id, loseMultiplier, updateEdge, winMultiplier, winProbability],
  );

  const expectedMult = winProbability * winMultiplier + (1 - winProbability) * loseMultiplier;
  const tip = `기댓값 배수 ${expectedMult.toFixed(2)} · 당첨 ${(winProbability * 100).toFixed(0)}%`;

  return (
    <>
      <CurveEditorFrame edge={edge} onReset={reset} tip={tip}>
        {(helpers) => {
          const sampleLine = (mult: number): string => {
            const STEPS = 24;
            const parts: string[] = [];
            for (let i = 0; i <= STEPS; i++) {
              const x = i / STEPS;
              const y = clamp01(bias + x * mult);
              parts.push(
                `${i === 0 ? 'M' : 'L'} ${helpers.xN2Px(x).toFixed(2)} ${helpers.yN2Px(y).toFixed(2)}`,
              );
            }
            return parts.join(' ');
          };
          const winPath = sampleLine(winMultiplier);
          const losePath = sampleLine(loseMultiplier);
          const expectedPath = sampleLine(expectedMult);
          // 확률 막대 — plot 영역 상단 안쪽에 배치.
          const barX0 = helpers.xN2Px(0);
          const barX1 = helpers.xN2Px(winProbability);
          const barY = helpers.yN2Px(1) - 8;
          return (
            <>
              <path
                d={winPath}
                className="trama-curve-line trama-stochastic-win"
              />
              <path
                d={losePath}
                className="trama-curve-line trama-stochastic-lose"
              />
              <path
                d={expectedPath}
                className="trama-curve-line trama-stochastic-expected"
              />
              {/* 확률 막대 트랙 (full) */}
              <line
                className="trama-stochastic-bar-track"
                x1={helpers.xN2Px(0)}
                y1={barY}
                x2={helpers.xN2Px(1)}
                y2={barY}
              />
              <line
                className="trama-stochastic-bar-fill"
                x1={barX0}
                y1={barY}
                x2={barX1}
                y2={barY}
              />
              <text
                className="trama-curve-axis-label"
                x={helpers.xN2Px(1)}
                y={barY - 4}
                textAnchor="end"
              >
                P(win)={(winProbability * 100).toFixed(0)}%
              </text>
            </>
          );
        }}
      </CurveEditorFrame>
      <Form.Root
        className="trama-shape-editor"
        onSubmit={(e) => e.preventDefault()}
        style={{ gridColumn: '1 / -1' }}
      >
        <Form.Field name="winProbability" className="trama-shape-editor-row">
          <Form.Label className="trama-shape-editor-label">당첨 확률</Form.Label>
          <Form.Control
            type="number"
            step={0.01}
            min={0}
            max={1}
            value={winProbability}
            className="trama-shape-editor-input"
            onChange={(e) => commit({ winProbability: clamp01(parseFloat(e.currentTarget.value)) })}
          />
        </Form.Field>
        <Form.Field name="winMultiplier" className="trama-shape-editor-row">
          <Form.Label className="trama-shape-editor-label">당첨 배수</Form.Label>
          <Form.Control
            type="number"
            step={0.1}
            value={winMultiplier}
            className="trama-shape-editor-input"
            onChange={(e) => commit({ winMultiplier: parseFloat(e.currentTarget.value) })}
          />
        </Form.Field>
        <Form.Field name="loseMultiplier" className="trama-shape-editor-row">
          <Form.Label className="trama-shape-editor-label">탈락 배수</Form.Label>
          <Form.Control
            type="number"
            step={0.1}
            value={loseMultiplier}
            className="trama-shape-editor-input"
            onChange={(e) => commit({ loseMultiplier: parseFloat(e.currentTarget.value) })}
          />
        </Form.Field>
        <Form.Field name="bias" className="trama-shape-editor-row">
          <Form.Label className="trama-shape-editor-label">기준점</Form.Label>
          <Form.Control
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={bias}
            className="trama-shape-editor-input"
            onChange={(e) => commit({ bias: clamp01(parseFloat(e.currentTarget.value)) })}
          />
        </Form.Field>
      </Form.Root>
    </>
  );
}
