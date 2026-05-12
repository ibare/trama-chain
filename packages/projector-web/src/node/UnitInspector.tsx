import { useCallback, useMemo, useState } from 'react';
import {
  categoryLabels,
  defaultUnitCatalog,
  type Node,
  type UnitCategory,
  type UnitDef,
} from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';

interface Props {
  node: Node;
  /** 패널 좌상단 좌표 (SVG/캔버스 좌표계 기준). 외부에서 placePanel로 산출. */
  x: number;
  y: number;
}

export const UNIT_INSPECTOR_PANEL_WIDTH = 288;
export const UNIT_INSPECTOR_PANEL_HEIGHT = 340;

/**
 * 노드 옆에 떠 있는 단위·범위 편집 패널.
 *
 * - 단위 변경: 카탈로그에서 다른 unitId를 고르면 override 비우고 initialValue도
 *   카탈로그 defaultInitial로 리셋(의미가 달라졌으므로 비례 변환은 의미 없음).
 * - 범위 편집: 같은 unitId 안의 min/max/step만 override하면 initialValue는 새
 *   범위로 클램프만.
 */
export function UnitInspector({ node, x, y }: Props): JSX.Element {
  const updateNode = useModelStore((s) => s.updateNode);
  const closeInspector = useUIStore((s) => s.closeUnitInspector);

  const currentDef = defaultUnitCatalog.get(node.unitId);
  const unit = resolveNodeUnit(node);

  const categories = useMemo<UnitCategory[]>(() => {
    const arr: UnitCategory[] = [];
    for (const [c] of defaultUnitCatalog.byCategory()) arr.push(c);
    return arr;
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<UnitCategory>(
    currentDef?.category ?? 'rating',
  );

  const unitsInCategory = useMemo<readonly UnitDef[]>(() => {
    return defaultUnitCatalog.byCategory().get(selectedCategory) ?? [];
  }, [selectedCategory]);

  const onPickUnit = useCallback(
    (def: UnitDef) => {
      if (def.id === node.unitId) return;
      updateNode(
        node.id,
        {
          unitId: def.id,
          unitOverride: undefined,
          initialValue: def.defaultInitial,
        },
        'update-node',
        '단위 변경',
      );
    },
    [node.id, node.unitId, updateNode],
  );

  const setRange = useCallback(
    (patch: { min?: number; max?: number; step?: number }) => {
      if (!currentDef) return;
      const nextOverride = { ...(node.unitOverride ?? {}), ...patch };
      // 비어 있으면 undefined로 정규화 (기본값과 같아지면 override 제거).
      const allDefault =
        (nextOverride.min ?? currentDef.defaultMin) === currentDef.defaultMin &&
        (nextOverride.max ?? currentDef.defaultMax) === currentDef.defaultMax &&
        (nextOverride.step ?? currentDef.defaultStep) === currentDef.defaultStep &&
        nextOverride.suffix === undefined &&
        nextOverride.labels === undefined;
      const finalOverride = allDefault ? undefined : nextOverride;
      // initialValue 새 범위로 클램프
      const newMin = nextOverride.min ?? currentDef.defaultMin;
      const newMax = nextOverride.max ?? currentDef.defaultMax;
      const newInitial = Math.max(newMin, Math.min(node.initialValue, newMax));
      updateNode(
        node.id,
        { unitOverride: finalOverride, initialValue: newInitial },
        'update-node',
        '범위 변경',
      );
    },
    [currentDef, node.id, node.initialValue, node.unitOverride, updateNode],
  );

  const onReset = useCallback(() => {
    if (!currentDef) return;
    updateNode(
      node.id,
      { unitOverride: undefined, initialValue: currentDef.defaultInitial },
      'update-node',
      '단위 기본값 리셋',
    );
  }, [currentDef, node.id, updateNode]);

  // 캔버스 hover/drag 영향 차단
  const stop = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const showRangeEditor = unit.kind === 'number' || unit.kind === 'scale';

  return (
    <foreignObject
      x={x}
      y={y}
      width={UNIT_INSPECTOR_PANEL_WIDTH}
      height={UNIT_INSPECTOR_PANEL_HEIGHT}
    >
      <div
        className="trama-unit-inspector"
        onPointerDown={stop}
        onPointerMove={stop}
        onPointerUp={stop}
        onMouseDown={stop}
        onClick={stop}
      >
        <header className="trama-unit-inspector-header">
          <span>단위</span>
          <button
            type="button"
            className="trama-unit-inspector-close"
            onClick={closeInspector}
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        <div className="trama-unit-inspector-categories">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`trama-unit-inspector-chip${
                selectedCategory === c ? ' is-active' : ''
              }`}
              onClick={() => setSelectedCategory(c)}
            >
              {categoryLabels[c]}
            </button>
          ))}
        </div>

        <div className="trama-unit-inspector-units">
          {unitsInCategory.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`trama-unit-inspector-unit${
                node.unitId === d.id ? ' is-active' : ''
              }`}
              onClick={() => onPickUnit(d)}
              title={d.hint ?? ''}
            >
              {d.label.ko}
            </button>
          ))}
        </div>

        {showRangeEditor && (
          <div className="trama-unit-inspector-range">
            <label>
              <span>최소</span>
              <input
                type="number"
                value={unit.min}
                step={unit.step}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) setRange({ min: v });
                }}
              />
            </label>
            <label>
              <span>최대</span>
              <input
                type="number"
                value={unit.max}
                step={unit.step}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) setRange({ max: v });
                }}
              />
            </label>
            <label>
              <span>스텝</span>
              <input
                type="number"
                value={unit.step}
                step={unit.step / 10}
                min={0}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v) && v > 0) setRange({ step: v });
                }}
              />
            </label>
          </div>
        )}

        <footer className="trama-unit-inspector-footer">
          <button type="button" className="trama-unit-inspector-reset" onClick={onReset}>
            기본값으로 리셋
          </button>
        </footer>
      </div>
    </foreignObject>
  );
}
