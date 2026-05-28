import * as Popover from '@radix-ui/react-popover';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Separator from '@radix-ui/react-separator';
import { useCallback, useMemo, useState } from 'react';
import { NumberField } from '../util/NumberField.js';
import {
  categoryLabels,
  defaultUnitCatalog,
  isNumericValue,
  numericValue,
  type UnitCategory,
  type UnitDef,
  type ValueNode,
} from '@trama-chain/core';
import { useTrama } from '../store/index.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { getSkin, listSkinsForUnit } from '../skin/registry.js';
import type { SkinDefinition } from '../skin/types.js';
import { TramaCarousel } from '../util/TramaCarousel.js';
import { TramaCardStrip } from '../util/TramaCardStrip.js';
import { PhosphorIcon } from '../icon/phosphor.js';
import { CellArrayInspector } from './cell-array/CellArrayInspector.js';
import '../skin/register-default-skins.js';

interface Props {
  /** UnitInspector는 ValueNode 전용. 식·상수·조건 노드는 단위가 없다(raw). */
  node: ValueNode;
}

/**
 * 노드 옆에 떠 있는 단위·범위 편집 패널.
 *
 * - 각 섹션(카테고리·단위·스킨)은 TramaCarousel로 좌우 페이징. 한 줄에 모두 보이지
 *   않으면 prev/next 버튼으로 다음 페이지로 넘어간다. 패널 높이는 컨텐츠가 결정.
 * - ToggleGroup `type="single"` + `onValueChange`에서 빈 값 무시 → 라디오 동작
 *   (재클릭으로 해제되지 않음). 해제는 명시적 "해제" 버튼으로 통일.
 */
export function UnitInspector({ node }: Props): JSX.Element {
  const { modelStore, timeSettingsStore } = useTrama();
  const updateNode = modelStore((s) => s.updateNode);
  const paused = timeSettingsStore((s) => s.paused);

  // numeric ValueNode 전용 인스펙터. boolean ValueNode는 단위 개념이 없어 별도 패널이 필요.
  const initialNumeric = isNumericValue(node.initialValue) ? node.initialValue : null;
  const currentUnitId = initialNumeric?.unitId ?? 'free';
  const currentInitialNumber = initialNumeric?.n ?? 0;
  const currentDef = defaultUnitCatalog.get(currentUnitId);
  const unit = resolveNodeUnit(node);

  const categories = useMemo<UnitCategory[]>(() => {
    const arr: UnitCategory[] = [];
    for (const [c] of defaultUnitCatalog.byCategory()) arr.push(c);
    return arr;
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<UnitCategory>(
    currentDef?.category ?? 'rating',
  );

  const unitsInCategory = useMemo<readonly UnitDef[]>(
    () => defaultUnitCatalog.byCategory().get(selectedCategory) ?? [],
    [selectedCategory],
  );

  const onPickUnit = useCallback(
    (id: string) => {
      const def = defaultUnitCatalog.get(id);
      if (!def || def.id === currentUnitId) return;
      updateNode(node.id, {
        unitOverride: undefined,
        initialValue: numericValue(def.defaultInitial, def.id),
      });
    },
    [node.id, currentUnitId, updateNode],
  );

  const setRange = useCallback(
    (patch: { min?: number; max?: number; step?: number }) => {
      if (!currentDef) return;
      const nextOverride = { ...(node.unitOverride ?? {}), ...patch };
      const allDefault =
        (nextOverride.min ?? currentDef.defaultMin) === currentDef.defaultMin &&
        (nextOverride.max ?? currentDef.defaultMax) === currentDef.defaultMax &&
        (nextOverride.step ?? currentDef.defaultStep) === currentDef.defaultStep &&
        nextOverride.suffix === undefined &&
        nextOverride.labels === undefined;
      const finalOverride = allDefault ? undefined : nextOverride;
      const newMin = nextOverride.min ?? currentDef.defaultMin;
      const newMax = nextOverride.max ?? currentDef.defaultMax;
      const newInitial = Math.max(newMin, Math.min(currentInitialNumber, newMax));
      updateNode(node.id, {
        unitOverride: finalOverride,
        initialValue: numericValue(newInitial, currentUnitId),
      });
    },
    [currentDef, currentInitialNumber, currentUnitId, node.id, node.unitOverride, updateNode],
  );

  const onReset = useCallback(() => {
    if (!currentDef) return;
    updateNode(node.id, {
      unitOverride: undefined,
      initialValue: numericValue(currentDef.defaultInitial, currentUnitId),
    });
  }, [currentDef, currentUnitId, node.id, updateNode]);

  // 단위 한정 스킨(numeric)이 적용된 동안에만 range editor를 숨긴다 — 그
  // 스킨이 도메인 권위로 범위를 결정하기 때문. 단위 무관(numeric-any-unit)
  // 스킨은 노드의 unit/range를 그대로 사용하므로 편집기를 유지.
  const skinClaimsRange = node.skin
    ? getSkin(node.skin.kind)?.domain.valueKind === 'numeric'
    : false;
  const showRangeEditor =
    (unit.kind === 'number' || unit.kind === 'scale') && !skinClaimsRange;

  const skinCandidates = useMemo<SkinDefinition[]>(
    () => listSkinsForUnit(unit),
    [unit],
  );
  const currentSkinKey = node.skin?.kind ?? null;

  const onPickSkin = useCallback(
    (key: string) => {
      const def = skinCandidates.find((d) => d.key === key);
      if (!def) return;
      const initialParams = {
        ...(def.defaultParams ? def.defaultParams() : {}),
        scale: def.defaultScale,
      };
      const domain = def.domain;
      switch (domain.valueKind) {
        case 'numeric': {
          const r = domain.range;
          const newInitial = Math.max(r.min, Math.min(currentInitialNumber, r.max));
          updateNode(node.id, {
            skin: { kind: def.key, params: initialParams },
            unitOverride: { min: r.min, max: r.max, step: r.step },
            initialValue: numericValue(newInitial, currentUnitId),
          });
          return;
        }
        case 'numeric-any-unit': {
          // 단위·범위 역제안 없음 — 노드의 기존 unit/range를 그대로 사용.
          updateNode(node.id, {
            skin: { kind: def.key, params: initialParams },
          });
          return;
        }
        case 'boolean':
          // UnitInspector는 numeric ValueNode 전용. boolean 스킨은 무시.
          return;
      }
    },
    [currentInitialNumber, currentUnitId, node.id, skinCandidates, updateNode],
  );

  const onClearSkin = useCallback(() => {
    updateNode(node.id, { skin: undefined });
  }, [node.id, updateNode]);

  return (
    <>
      <header className="trama-unit-inspector-header">
        <span>단위</span>
        <Popover.Close className="trama-unit-inspector-close" aria-label="닫기">
          ×
        </Popover.Close>
      </header>

      <ToggleGroup.Root
        type="single"
        value={selectedCategory}
        onValueChange={(v) => v && setSelectedCategory(v as UnitCategory)}
        aria-label="단위 카테고리"
        className="trama-unit-inspector-categories"
        disabled={!paused}
      >
        <TramaCarousel ariaLabel="단위 카테고리 페이지">
          {categories.map((c) => (
            <ToggleGroup.Item key={c} value={c} className="trama-unit-inspector-chip">
              {categoryLabels[c]}
            </ToggleGroup.Item>
          ))}
        </TramaCarousel>
      </ToggleGroup.Root>

      <Separator.Root className="trama-unit-inspector-sep" decorative orientation="horizontal" />

      <ToggleGroup.Root
        type="single"
        value={currentUnitId}
        onValueChange={(v) => v && onPickUnit(v)}
        aria-label="단위 종류"
        className="trama-unit-inspector-units"
        disabled={!paused}
      >
        <TramaCarousel ariaLabel="단위 종류 페이지">
          {unitsInCategory.map((d) => (
            <ToggleGroup.Item
              key={d.id}
              value={d.id}
              className="trama-unit-inspector-unit"
              title={d.hint ?? ''}
            >
              {d.label.ko}
            </ToggleGroup.Item>
          ))}
        </TramaCarousel>
      </ToggleGroup.Root>

      {skinCandidates.length > 0 && (
        <>
          <Separator.Root className="trama-unit-inspector-sep" decorative orientation="horizontal" />
          <div className="trama-unit-inspector-skins">
            <div className="trama-unit-inspector-section-row">
              <span className="trama-unit-inspector-section-label">스킨</span>
              {currentSkinKey && (
                <button
                  type="button"
                  className="trama-unit-inspector-clear"
                  onClick={onClearSkin}
                  disabled={!paused}
                >
                  해제
                </button>
              )}
            </div>
            <TramaCardStrip
              ariaLabel="스킨"
              value={currentSkinKey}
              onValueChange={onPickSkin}
              disabled={!paused}
              items={skinCandidates.map((s) => ({
                key: s.key,
                label: s.labels.ko,
                icon: s.icon ? <PhosphorIcon name={s.icon} size={28} /> : undefined,
              }))}
            />
          </div>
        </>
      )}

      {node.skin?.kind === 'cell-array' && <CellArrayInspector node={node} />}

      {showRangeEditor && (
        <>
          <Separator.Root className="trama-unit-inspector-sep" decorative orientation="horizontal" />
          <div className="trama-unit-inspector-range">
            <NumberField
              label="최소"
              value={unit.min}
              unit={unit.suffix || undefined}
              precision={precisionFromStep(unit.step)}
              disabled={!paused}
              onChange={(v) => setRange({ min: v })}
            />
            <NumberField
              label="최대"
              value={unit.max}
              unit={unit.suffix || undefined}
              precision={precisionFromStep(unit.step)}
              disabled={!paused}
              onChange={(v) => setRange({ max: v })}
            />
            <NumberField
              label="스텝"
              value={unit.step}
              unit={unit.suffix || undefined}
              precision={precisionFromStep(unit.step)}
              min={0}
              disabled={!paused}
              onChange={(v) => {
                if (v > 0) setRange({ step: v });
              }}
            />
          </div>
        </>
      )}

      <footer className="trama-unit-inspector-footer">
        <button
          type="button"
          className="trama-unit-inspector-reset"
          onClick={onReset}
          disabled={!paused}
        >
          기본값으로 리셋
        </button>
      </footer>
    </>
  );
}

/** unit.step 의 소수점 자리수를 그대로 min/max NumberField 의 precision 으로 사용. */
function precisionFromStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}
