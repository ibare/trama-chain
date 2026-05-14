import * as Popover from '@radix-ui/react-popover';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Separator from '@radix-ui/react-separator';
import * as Form from '@radix-ui/react-form';
import { useCallback, useMemo, useState } from 'react';
import {
  categoryLabels,
  defaultUnitCatalog,
  type UnitCategory,
  type UnitDef,
  type ValueNode,
} from '@trama/core';
import { useTrama } from '../store/index.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { listSkinsForUnit } from '../skin/registry.js';
import type { SkinDefinition } from '../skin/types.js';
import { TramaCarousel } from '../util/TramaCarousel.js';
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
  const { modelStore } = useTrama();
  const updateNode = modelStore((s) => s.updateNode);

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

  const unitsInCategory = useMemo<readonly UnitDef[]>(
    () => defaultUnitCatalog.byCategory().get(selectedCategory) ?? [],
    [selectedCategory],
  );

  const onPickUnit = useCallback(
    (id: string) => {
      const def = defaultUnitCatalog.get(id);
      if (!def || def.id === node.unitId) return;
      updateNode(node.id, {
        unitId: def.id,
        unitOverride: undefined,
        initialValue: def.defaultInitial,
      });
    },
    [node.id, node.unitId, updateNode],
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
      const newInitial = Math.max(newMin, Math.min(node.initialValue, newMax));
      updateNode(node.id, { unitOverride: finalOverride, initialValue: newInitial });
    },
    [currentDef, node.id, node.initialValue, node.unitOverride, updateNode],
  );

  const onReset = useCallback(() => {
    if (!currentDef) return;
    updateNode(node.id, {
      unitOverride: undefined,
      initialValue: currentDef.defaultInitial,
    });
  }, [currentDef, node.id, updateNode]);

  // 스킨이 적용된 동안엔 range editor를 숨긴다 — 스킨이 도메인 권위로 범위를 결정.
  const showRangeEditor =
    (unit.kind === 'number' || unit.kind === 'scale') && !node.skin;

  const skinCandidates = useMemo<SkinDefinition[]>(
    () => listSkinsForUnit(unit),
    [unit],
  );
  const currentSkinKey = node.skin?.kind ?? null;

  const onPickSkin = useCallback(
    (key: string) => {
      const def = skinCandidates.find((d) => d.key === key);
      if (!def) return;
      const r = def.domain.range;
      const newInitial = Math.max(r.min, Math.min(node.initialValue, r.max));
      updateNode(node.id, {
        skin: { kind: def.key, params: {} },
        unitOverride: { min: r.min, max: r.max, step: r.step },
        initialValue: newInitial,
      });
    },
    [node.id, node.initialValue, skinCandidates, updateNode],
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
        value={node.unitId}
        onValueChange={(v) => v && onPickUnit(v)}
        aria-label="단위 종류"
        className="trama-unit-inspector-units"
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
                >
                  해제
                </button>
              )}
            </div>
            <ToggleGroup.Root
              type="single"
              value={currentSkinKey ?? ''}
              onValueChange={(v) => v && onPickSkin(v)}
              aria-label="스킨"
              className="trama-unit-inspector-skin-list"
            >
              <TramaCarousel ariaLabel="스킨 페이지">
                {skinCandidates.map((s) => (
                  <ToggleGroup.Item
                    key={s.key}
                    value={s.key}
                    className="trama-unit-inspector-skin"
                    title={s.domain.intent}
                  >
                    <span className="trama-unit-inspector-skin-label">{s.labels.ko}</span>
                    <span className="trama-unit-inspector-skin-intent">{s.domain.intent}</span>
                  </ToggleGroup.Item>
                ))}
              </TramaCarousel>
            </ToggleGroup.Root>
          </div>
        </>
      )}

      {showRangeEditor && (
        <>
          <Separator.Root className="trama-unit-inspector-sep" decorative orientation="horizontal" />
          <Form.Root
            className="trama-unit-inspector-range"
            onSubmit={(e) => e.preventDefault()}
          >
            <RangeField name="min" label="최소" value={unit.min} step={unit.step} onCommit={(v) => setRange({ min: v })} />
            <RangeField name="max" label="최대" value={unit.max} step={unit.step} onCommit={(v) => setRange({ max: v })} />
            <RangeField
              name="step"
              label="스텝"
              value={unit.step}
              step={unit.step / 10}
              min={0}
              onCommit={(v) => {
                if (v > 0) setRange({ step: v });
              }}
            />
          </Form.Root>
        </>
      )}

      <footer className="trama-unit-inspector-footer">
        <button type="button" className="trama-unit-inspector-reset" onClick={onReset}>
          기본값으로 리셋
        </button>
      </footer>
    </>
  );
}

interface RangeFieldProps {
  name: string;
  label: string;
  value: number;
  step: number;
  min?: number;
  onCommit: (v: number) => void;
}

function RangeField({ name, label, value, step, min, onCommit }: RangeFieldProps): JSX.Element {
  return (
    <Form.Field name={name} className="trama-unit-inspector-range-row">
      <Form.Label className="trama-unit-inspector-range-label">{label}</Form.Label>
      <Form.Control
        type="number"
        value={value}
        step={step}
        min={min}
        className="trama-unit-inspector-range-input"
        onChange={(e) => {
          const v = parseFloat(e.currentTarget.value);
          if (Number.isFinite(v)) onCommit(v);
        }}
      />
    </Form.Field>
  );
}
