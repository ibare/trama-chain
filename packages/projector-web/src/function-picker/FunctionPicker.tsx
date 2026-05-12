import { useCallback, useMemo } from 'react';
import { useModelStore, useUIStore } from '../store/index.js';
import { shapeRegistry } from '../store/registries.js';
import { InverseUCurveEditor } from './InverseUCurveEditor.js';
import { PiecewiseEditor } from './PiecewiseEditor.js';
import { ShapeParamEditor } from './ShapeParamEditor.js';
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
      // 인라인 편집 UI가 붙는 shape(piecewise·stochastic·paramFields 보유)은
      // picker를 닫지 않고 그대로 편집할 수 있게 둔다.
      const hasInlineEditor =
        key === 'piecewise' || key === 'stochastic' || (def.paramFields?.length ?? 0) > 0;
      if (!hasInlineEditor) close();
    },
    [close, edge, updateEdge],
  );

  const currentDef = edge ? shapeRegistry.get(edge.shape.kind) : undefined;
  const currentParamFields = currentDef?.paramFields ?? [];

  if (!picker || !edge) return null;

  return (
    <div
      className="trama-picker"
      style={{ left: picker.anchor.x - 200, top: picker.anchor.y + 12 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {shapes.map((s) => {
        const selected = edge.shape.kind === s.key;
        // 선택된 카드는 현재 params로, 나머지는 default로 미리보기를 그린다.
        const previewParams = selected ? edge.shape.params : s.defaultParams;
        const path = s.previewPath(96, 36, previewParams);
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
      {edge.shape.kind === 'inverseU' && <InverseUCurveEditor edge={edge} />}
      {edge.shape.kind !== 'piecewise' &&
        edge.shape.kind !== 'stochastic' &&
        edge.shape.kind !== 'inverseU' &&
        currentParamFields.length > 0 && (
          <ShapeParamEditor edge={edge} fields={currentParamFields} />
        )}
    </div>
  );
}
