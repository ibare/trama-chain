import { useCallback } from 'react';
import type { Edge } from '@trama/core';
import { useModelStore } from '../store/index.js';

interface Props {
  edge: Edge;
}

export function StochasticEditor({ edge }: Props): JSX.Element {
  const updateEdge = useModelStore((s) => s.updateEdge);
  const p = edge.shape.params as {
    distribution?: string;
    winProbability?: number;
    winMultiplier?: number;
    loseMultiplier?: number;
    bias?: number;
  };

  const commit = useCallback(
    (patch: Partial<typeof p>) => {
      updateEdge(
        edge.id,
        {
          shape: {
            kind: 'stochastic',
            params: {
              distribution: 'bernoulli',
              winProbability: p.winProbability ?? 0.05,
              winMultiplier: p.winMultiplier ?? 5,
              loseMultiplier: p.loseMultiplier ?? -1,
              bias: p.bias ?? 0.5,
              ...patch,
            },
          },
        },
        'change-shape',
        '확률 분포 변경',
      );
    },
    [edge.id, p.bias, p.loseMultiplier, p.winMultiplier, p.winProbability, updateEdge],
  );

  return (
    <div className="trama-shape-editor" style={{ gridColumn: '1 / -1' }}>
      <label>
        당첨 확률
        <input
          type="number"
          step={0.01}
          min={0}
          max={1}
          value={p.winProbability ?? 0.05}
          onChange={(e) => commit({ winProbability: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        당첨 배수
        <input
          type="number"
          step={0.1}
          value={p.winMultiplier ?? 5}
          onChange={(e) => commit({ winMultiplier: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        탈락 배수
        <input
          type="number"
          step={0.1}
          value={p.loseMultiplier ?? -1}
          onChange={(e) => commit({ loseMultiplier: parseFloat(e.target.value) })}
        />
      </label>
      <label>
        기준점
        <input
          type="number"
          step={0.05}
          min={0}
          max={1}
          value={p.bias ?? 0.5}
          onChange={(e) => commit({ bias: parseFloat(e.target.value) })}
        />
      </label>
    </div>
  );
}
