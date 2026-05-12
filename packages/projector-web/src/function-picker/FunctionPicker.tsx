import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useModelStore, useUIStore } from '../store/index.js';
import { shapeRegistry } from '../store/registries.js';
import { placePanel } from '../util/panel-placement.js';
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

  // 컨텐츠가 정해진 뒤 실제 크기를 측정해 화면 안에 들어가도록 보정한다.
  // 측정 전 첫 프레임은 anchor 근처에 일단 띄우고, 측정 후 placePanel로 옮긴다.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!picker) {
      setPlaced(null);
      return;
    }
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // FunctionPicker는 엣지 클릭 위치를 중심으로 띄우는 게 자연스러우니
    // 기본 placement는 anchor 아래쪽 중앙. 그래서 anchor.x에서 panel.w/2를
    // 빼는 식. 단, 좌/우 화면 경계를 넘으면 자동 보정.
    const desiredX = picker.anchor.x - rect.width / 2;
    const result = placePanel({
      anchor: { x: desiredX, y: picker.anchor.y + 12 },
      panel: { w: rect.width, h: rect.height },
      bounds: { minX: 8, minY: 8, maxX: vw - 8, maxY: vh - 8 },
      // 기본 우측 오프셋이 0 — 위에서 이미 중앙 정렬된 desiredX를 쓰므로 추가 이동 불필요
      gap: { x: 0, y: 0 },
    });
    setPlaced({ left: result.x, top: result.y });
  }, [picker, edge?.shape.kind, edge?.shape.params]);

  if (!picker || !edge) return null;

  const initialLeft = picker.anchor.x - 200;
  const initialTop = picker.anchor.y + 12;
  const style: React.CSSProperties = placed
    ? { left: placed.left, top: placed.top }
    : // 측정 전 첫 paint는 화면 밖으로 약간 빼서 깜빡임 없이 측정만 시킴
      { left: initialLeft, top: initialTop, visibility: 'hidden' };

  return (
    <div
      ref={panelRef}
      className="trama-picker"
      style={style}
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
