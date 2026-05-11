import { useCallback } from 'react';
import type { Edge } from '@trama/core';
import { useModelStore } from '../store/index.js';

interface Props {
  edge: Edge;
}

interface Pt {
  x: number;
  y: number;
}

export function PiecewiseEditor({ edge }: Props): JSX.Element {
  const updateEdge = useModelStore((s) => s.updateEdge);
  const points = ((edge.shape.params.points as Pt[] | undefined) ?? []).slice();

  const commit = useCallback(
    (nextPoints: Pt[]) => {
      const sorted = [...nextPoints].sort((a, b) => a.x - b.x);
      updateEdge(
        edge.id,
        { shape: { kind: 'piecewise', params: { points: sorted } } },
        'change-shape',
        '구간 변경',
      );
    },
    [edge.id, updateEdge],
  );

  const setPoint = (i: number, patch: Partial<Pt>) => {
    const next = points.slice();
    const existing = next[i];
    if (!existing) return;
    next[i] = { ...existing, ...patch };
    commit(next);
  };

  const addPoint = () => {
    const last = points[points.length - 1] ?? { x: 0, y: 0 };
    commit([...points, { x: Math.min(1, last.x + 0.1), y: last.y }]);
  };

  const removePoint = (i: number) => {
    const next = points.slice();
    next.splice(i, 1);
    commit(next);
  };

  return (
    <div className="trama-shape-editor" style={{ gridColumn: '1 / -1' }}>
      <label style={{ justifyContent: 'flex-start' }}>구간 점들</label>
      {points.map((pt, i) => (
        <div key={i} className="trama-piecewise-point-row">
          <label>
            x
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={pt.x}
              onChange={(e) => setPoint(i, { x: parseFloat(e.target.value) })}
            />
          </label>
          <label>
            y
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={pt.y}
              onChange={(e) => setPoint(i, { y: parseFloat(e.target.value) })}
            />
          </label>
          <button type="button" onClick={() => removePoint(i)}>
            제거
          </button>
        </div>
      ))}
      <button type="button" onClick={addPoint}>
        구간 추가
      </button>
    </div>
  );
}
