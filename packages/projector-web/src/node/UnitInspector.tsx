import { useCallback, useMemo, useState } from 'react';
import {
  categoryLabels,
  defaultUnitCatalog,
  type UnitCategory,
  type UnitDef,
  type ValueNode,
} from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { listSkinsForUnit } from '../skin/registry.js';
import type { SkinDefinition } from '../skin/types.js';
import '../skin/register-default-skins.js';

interface Props {
  /** UnitInspector는 ValueNode 전용. 식·상수·조건 노드는 단위가 없다(raw). */
  node: ValueNode;
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
export function UnitInspector({ node }: Props): JSX.Element {
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

  // 스킨이 적용된 동안엔 range editor를 숨긴다 — 스킨이 도메인 권위로 범위를 결정.
  // 사용자가 범위를 다시 만지려면 스킨을 해제하거나 다른 영역의 스킨을 골라야 한다.
  const showRangeEditor =
    (unit.kind === 'number' || unit.kind === 'scale') && !node.skin;

  const skinCandidates = useMemo<SkinDefinition[]>(
    () => listSkinsForUnit(unit),
    [unit],
  );
  const currentSkinKey = node.skin?.kind ?? null;

  const onPickSkin = useCallback(
    (def: SkinDefinition) => {
      // 같은 스킨을 다시 누르면 해제 (toggle). shape picker의 "선택 해제"와 같은 결.
      // 해제 시 unitOverride는 그대로 둔다 — 사용자가 명시적 "리셋"으로 단위 default로 돌아감.
      if (currentSkinKey === def.key) {
        updateNode(node.id, { skin: undefined }, 'update-node', '스킨 해제');
        return;
      }
      // 스킨이 도메인 전문가 — 적용과 동시에 노드 unit 범위를 스킨이 권장하는 영역으로
      // *역제안*한다. 사용자가 임의 입력할 이유를 없앤다. initialValue는 새 범위로 클램프.
      const r = def.domain.range;
      const newInitial = Math.max(r.min, Math.min(node.initialValue, r.max));
      updateNode(
        node.id,
        {
          skin: { kind: def.key, params: {} },
          unitOverride: { min: r.min, max: r.max, step: r.step },
          initialValue: newInitial,
        },
        'update-node',
        '스킨 적용',
      );
    },
    [currentSkinKey, node.id, node.initialValue, updateNode],
  );

  return (
    <>
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

      {skinCandidates.length > 0 && (
        <div className="trama-unit-inspector-skins">
          <div className="trama-unit-inspector-section-label">스킨</div>
          <div className="trama-unit-inspector-skin-list">
            {skinCandidates.map((s) => {
              const active = currentSkinKey === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  className={`trama-unit-inspector-skin${active ? ' is-active' : ''}`}
                  onClick={() => onPickSkin(s)}
                  title={active ? '다시 누르면 해제' : s.domain.intent}
                >
                  <span className="trama-unit-inspector-skin-label">
                    {s.labels.ko}
                  </span>
                  <span className="trama-unit-inspector-skin-intent">
                    {s.domain.intent}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <footer className="trama-unit-inspector-footer">
        <button type="button" className="trama-unit-inspector-reset" onClick={onReset}>
          기본값으로 리셋
        </button>
      </footer>
    </>
  );
}
