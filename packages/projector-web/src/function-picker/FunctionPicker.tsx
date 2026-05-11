import { useCallback, useMemo } from 'react';
import { useModelStore, useUIStore } from '../store/index.js';
import { shapeRegistry } from '../store/registries.js';
import { PiecewiseEditor } from './PiecewiseEditor.js';
import { StochasticEditor } from './StochasticEditor.js';

export function FunctionPicker(): JSX.Element | null {
  const picker = useUIStore((s) => s.functionPicker);
  const close = useUIStore((s) => s.closeFunctionPicker);
  const updateEdge = useModelStore((s) => s.updateEdge);
  const model = useModelStore((s) => s.model);

  const edge = picker ? model.edges[picker.edgeId] : null;

  const shapes = useMemo(() => shapeRegistry.list(), []);

  const selectShape = useCallback(
    (key: string) => {
      if (!edge) return;
      const def = shapeRegistry.get(key);
      if (!def) return;
      updateEdge(
        edge.id,
        { shape: { kind: key, params: def.defaultParams as Record<string, unknown> } },
        'change-shape',
        '함수 변경',
      );
      // piecewise/stochastic은 picker를 닫지 않고 인라인 에디터로 머무름.
      if (key !== 'piecewise' && key !== 'stochastic') close();
    },
    [close, edge, updateEdge],
  );

  if (!picker || !edge) return null;

  return (
    <div
      className="trama-picker"
      style={{ left: picker.anchor.x - 200, top: picker.anchor.y + 12 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {shapes.map((s) => {
        const path = s.previewPath(96, 36, s.defaultParams);
        const selected = edge.shape.kind === s.key;
        return (
          <div
            key={s.key}
            className={`trama-picker-card${selected ? ' is-selected' : ''}`}
            onClick={() => selectShape(s.key)}
          >
            <svg className="trama-picker-preview" viewBox="0 0 96 36" preserveAspectRatio="none">
              <path d={path} />
            </svg>
            <div className="trama-picker-card-label">{s.labels.ko}</div>
          </div>
        );
      })}
      {edge.shape.kind === 'piecewise' && <PiecewiseEditor edge={edge} />}
      {edge.shape.kind === 'stochastic' && <StochasticEditor edge={edge} />}
    </div>
  );
}
