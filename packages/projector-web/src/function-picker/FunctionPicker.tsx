import * as Tabs from '@radix-ui/react-tabs';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { useCallback, useMemo, useState } from 'react';
import { useModelStore, useUIStore } from '../store/index.js';
import { shapeRegistry } from '../store/registries.js';
import { TramaPopover } from '../util/TramaPopover.js';
import { TramaCarousel } from '../util/TramaCarousel.js';
import { ShapeParamEditor } from './ShapeParamEditor.js';
import { SHAPE_CATEGORIES, findCategoryOfShape } from './categories.js';
import { getShapeEditor } from './editor-registry.js';
import './register-default-editors.js';

export function FunctionPicker(): JSX.Element | null {
  const picker = useUIStore((s) => s.functionPicker);
  const close = useUIStore((s) => s.closeFunctionPicker);
  const updateEdge = useModelStore((s) => s.updateEdge);
  const model = useModelStore((s) => s.model);

  const edge = picker ? model.edges[picker.edgeId] : null;

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
      const hasInlineEditor = !!getShapeEditor(key) || (def.paramFields?.length ?? 0) > 0;
      if (!hasInlineEditor) close();
    },
    [close, edge, updateEdge],
  );

  // "선택 해제" → 'none' kind sentinel로 되돌림. 변환 없이 값이 그대로 흐름.
  const clearShape = useCallback(() => {
    if (!edge) return;
    updateEdge(
      edge.id,
      { shape: { kind: 'none', params: {} } },
      'change-shape',
      '변환 없음',
    );
  }, [edge, updateEdge]);

  // 현재 shape의 defaultParams로 통째 복원.
  const resetToDefault = useCallback(() => {
    if (!edge) return;
    const def = shapeRegistry.get(edge.shape.kind);
    if (!def) return;
    updateEdge(
      edge.id,
      {
        shape: {
          kind: edge.shape.kind,
          params: { ...(def.defaultParams as Record<string, unknown>) },
        },
      },
      'change-shape',
      '기본값으로',
    );
  }, [edge, updateEdge]);

  // picker 열린 그 시점의 카테고리를 기본 탭으로. 이후엔 사용자 선택을 따라간다.
  const initialTab = useMemo(() => {
    const kind = edge?.shape.kind;
    const cat = kind ? findCategoryOfShape(kind) : null;
    return cat?.id ?? SHAPE_CATEGORIES[0]!.id;
  }, [edge?.shape.kind]);
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  if (!picker || !edge) return null;

  const isNone = edge.shape.kind === 'none';
  const currentDef = shapeRegistry.get(edge.shape.kind);
  const Editor = getShapeEditor(edge.shape.kind);
  const fallbackFields = currentDef?.paramFields ?? [];

  return (
    <TramaPopover
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
      anchor={picker.anchor}
      placement={{ kind: 'below-center', offsetY: 12 }}
      className="trama-picker"
    >
      {!isNone && (
        <div className="trama-picker-toolbar">
          <button type="button" className="trama-picker-btn" onClick={resetToDefault}>
            기본값
          </button>
          <button type="button" className="trama-picker-btn" onClick={clearShape}>
            선택 해제
          </button>
        </div>
      )}
      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => v && setActiveTab(v)}
        className="trama-picker-tabs"
        activationMode="manual"
      >
        <Tabs.List className="trama-picker-tab-list" aria-label="변환 카테고리">
          {SHAPE_CATEGORIES.map((cat) => (
            <Tabs.Trigger key={cat.id} value={cat.id} className="trama-picker-tab">
              {cat.labels.ko}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {SHAPE_CATEGORIES.map((cat) => (
          <Tabs.Content key={cat.id} value={cat.id} className="trama-picker-tab-panel">
            <ToggleGroup.Root
              type="single"
              value={cat.shapeKeys.includes(edge.shape.kind) ? edge.shape.kind : ''}
              onValueChange={(v) => v && selectShape(v)}
              aria-label={`${cat.labels.ko} 변환`}
            >
              <TramaCarousel ariaLabel="변환 페이지">
                {cat.shapeKeys.map((key) => {
                  const def = shapeRegistry.get(key);
                  if (!def) return null;
                  const selected = edge.shape.kind === key;
                  const previewParams = selected ? edge.shape.params : def.defaultParams;
                  const path = def.previewPath(96, 36, previewParams);
                  return (
                    <ToggleGroup.Item
                      key={key}
                      value={key}
                      className="trama-picker-card"
                    >
                      <svg
                        className="trama-picker-preview"
                        viewBox="0 0 96 36"
                        preserveAspectRatio="none"
                      >
                        <line
                          className="trama-picker-preview-baseline"
                          x1={0}
                          y1={36}
                          x2={96}
                          y2={36}
                        />
                        <path
                          className="trama-picker-preview-fill"
                          d={`${path} L 96 36 L 0 36 Z`}
                        />
                        <path className="trama-picker-preview-stroke" d={path} />
                      </svg>
                      <div className="trama-picker-card-label">{def.labels.ko}</div>
                    </ToggleGroup.Item>
                  );
                })}
              </TramaCarousel>
            </ToggleGroup.Root>
          </Tabs.Content>
        ))}
      </Tabs.Root>
      {/* 'none' kind는 편집기 숨김 — 사용자가 explicit shape을 선택하기 전까지
          곡선 그래프를 띄우지 않는다. */}
      {!isNone && Editor ? (
        <Editor edge={edge} />
      ) : !isNone && fallbackFields.length > 0 ? (
        <ShapeParamEditor edge={edge} fields={fallbackFields} />
      ) : null}
    </TramaPopover>
  );
}
