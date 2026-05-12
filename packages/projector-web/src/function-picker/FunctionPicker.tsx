import { useCallback, useMemo } from 'react';
import { useModelStore, useUIStore } from '../store/index.js';
import { shapeRegistry } from '../store/registries.js';
import { FloatingPanel } from '../util/FloatingPanel.js';
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

  // 변환 제거 = identity linear(slope=1, offset=0)로 복원. 엣지가 raw로 흘러간다.
  const removeShape = useCallback(() => {
    if (!edge) return;
    updateEdge(
      edge.id,
      { shape: { kind: 'linear', params: { slope: 1, offset: 0 } } },
      'change-shape',
      '변환 제거',
    );
    close();
  }, [close, edge, updateEdge]);

  if (!picker || !edge) return null;

  // 현재 변환이 실제로 값을 가공하는가? identity(linear slope=1 offset=0)면 제거할 게 없다.
  const isIdentity =
    edge.shape.kind === 'linear' &&
    edge.shape.params.slope === 1 &&
    edge.shape.params.offset === 0;

  const currentDef = shapeRegistry.get(edge.shape.kind);
  const currentParamFields = currentDef?.paramFields ?? [];

  return (
    <FloatingPanel
      anchor={picker.anchor}
      onClose={close}
      placement={{ kind: 'below-center', offsetY: 12 }}
      className="trama-picker"
    >
      {shapes.map((s) => {
        const selected = edge.shape.kind === s.key;
        const previewParams = selected ? edge.shape.params : s.defaultParams;
        const path = s.previewPath(96, 36, previewParams);
        return (
          <div
            key={s.key}
            className={`trama-picker-card${selected ? ' is-selected' : ''}`}
            onClick={() => selectShape(s.key)}
          >
            <svg className="trama-picker-preview" viewBox="0 0 96 36" preserveAspectRatio="none">
              <line
                className="trama-picker-preview-baseline"
                x1={0}
                y1={36}
                x2={96}
                y2={36}
              />
              <path className="trama-picker-preview-fill" d={`${path} L 96 36 L 0 36 Z`} />
              <path className="trama-picker-preview-stroke" d={path} />
            </svg>
            <div className="trama-picker-card-label">{s.labels.ko}</div>
          </div>
        );
      })}
      <button
        type="button"
        className="trama-picker-remove"
        onClick={removeShape}
        disabled={isIdentity}
      >
        변환 제거
      </button>
      {edge.shape.kind === 'piecewise' && <PiecewiseEditor edge={edge} />}
      {edge.shape.kind === 'stochastic' && <StochasticEditor edge={edge} />}
      {edge.shape.kind === 'inverseU' && <InverseUCurveEditor edge={edge} />}
      {edge.shape.kind !== 'piecewise' &&
        edge.shape.kind !== 'stochastic' &&
        edge.shape.kind !== 'inverseU' &&
        currentParamFields.length > 0 && (
          <ShapeParamEditor edge={edge} fields={currentParamFields} />
        )}
    </FloatingPanel>
  );
}
