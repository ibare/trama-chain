import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Separator from '@radix-ui/react-separator';
import { useCallback } from 'react';
import type { ValueNode } from '@trama-chain/core';
import { useTrama } from '../../store/index.js';
import {
  normalizeCellArrayParams,
  type Cell,
  type CellArrayParams,
  type CellDirection,
  type CellShapeKind,
  type PointCell,
  type RangeCell,
} from '../../skin/skins/cell-array.js';
import type { SwatchRef } from '../../skin/palette.js';
import { CellColorPicker } from './CellColorPicker.js';
import { NumberField } from '../../util/NumberField.js';

interface Props {
  node: ValueNode;
}

type Mode = 'gauge' | 'segment' | 'step' | 'light' | 'mixed';

/**
 * 셀 배열 스킨 인스펙터.
 *
 * UnitInspector 안에서 cell-array 스킨이 적용된 노드일 때만 표시된다.
 * 모드 프리셋은 cells를 그 모드의 기본 형태로 *교체*하는 명시적 액션 —
 * 그 후엔 셀 갯수·범위·색을 자유롭게 편집할 수 있다.
 */
export function CellArrayInspector({ node }: Props): JSX.Element {
  const { modelStore } = useTrama();
  const updateNode = modelStore((s) => s.updateNode);
  const params = normalizeCellArrayParams(node.skin?.params);
  const mode = inferMode(params.cells);

  const commit = useCallback(
    (next: Partial<CellArrayParams>) => {
      const merged: CellArrayParams = { ...params, ...next };
      updateNode(node.id, {
        skin: { kind: 'cell-array', params: merged as unknown as Record<string, unknown> },
      });
    },
    [node.id, params, updateNode],
  );

  const onPickMode = useCallback(
    (m: Mode) => {
      if (m === 'mixed') return;
      commit({ cells: defaultCellsForMode(m, params.cells) });
    },
    [commit, params.cells],
  );

  const onPickShape = useCallback(
    (s: CellShapeKind) => commit({ shape: s }),
    [commit],
  );

  const onPickDirection = useCallback(
    (d: CellDirection) => commit({ direction: d }),
    [commit],
  );

  const onCellChange = useCallback(
    (i: number, next: Cell) => {
      const cells = params.cells.slice();
      cells[i] = next;
      commit({ cells });
    },
    [commit, params.cells],
  );

  const onCellRemove = useCallback(
    (i: number) => {
      if (params.cells.length <= 1) return;
      const cells = params.cells.slice();
      cells.splice(i, 1);
      commit({ cells });
    },
    [commit, params.cells],
  );

  const onCellAdd = useCallback(() => {
    const last = params.cells[params.cells.length - 1];
    const next: Cell = last?.kind === 'point'
      ? { kind: 'point', at: (last.at ?? 0) + 1, color: { primitive: 'blue', shade: '500' } }
      : last?.kind === 'range'
      ? {
          kind: 'range',
          lo: last.hi,
          hi: last.hi + (last.hi - last.lo || 10),
          color: { primitive: 'amber', shade: '500' },
        }
      : { kind: 'range', lo: 0, hi: 100, color: { primitive: 'green', shade: '500' } };
    commit({ cells: [...params.cells, next] });
  }, [commit, params.cells]);

  return (
    <div className="trama-cell-array-inspector">
      <Separator.Root className="trama-unit-inspector-sep" decorative orientation="horizontal" />
      <div className="trama-cell-array-section">
        <span className="trama-unit-inspector-section-label">모드</span>
        <ToggleGroup.Root
          type="single"
          value={mode === 'mixed' ? '' : mode}
          onValueChange={(v) => v && onPickMode(v as Mode)}
          className="trama-cell-array-modes"
          aria-label="모드 프리셋"
        >
          <ToggleGroup.Item value="gauge" className="trama-unit-inspector-chip">게이지</ToggleGroup.Item>
          <ToggleGroup.Item value="segment" className="trama-unit-inspector-chip">세그먼트</ToggleGroup.Item>
          <ToggleGroup.Item value="step" className="trama-unit-inspector-chip">단계</ToggleGroup.Item>
          <ToggleGroup.Item value="light" className="trama-unit-inspector-chip">라이트</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>

      <div className="trama-cell-array-section">
        <span className="trama-unit-inspector-section-label">모양</span>
        <ToggleGroup.Root
          type="single"
          value={params.shape}
          onValueChange={(v) => v && onPickShape(v as CellShapeKind)}
          className="trama-cell-array-modes"
          aria-label="셀 모양"
        >
          <ToggleGroup.Item value="capsule" className="trama-unit-inspector-chip">캡슐</ToggleGroup.Item>
          <ToggleGroup.Item value="circle" className="trama-unit-inspector-chip">원</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>

      <div className="trama-cell-array-section">
        <span className="trama-unit-inspector-section-label">방향</span>
        <ToggleGroup.Root
          type="single"
          value={params.direction}
          onValueChange={(v) => v && onPickDirection(v as CellDirection)}
          className="trama-cell-array-modes"
          aria-label="배치 방향"
        >
          <ToggleGroup.Item value="vertical" className="trama-unit-inspector-chip">세로</ToggleGroup.Item>
          <ToggleGroup.Item value="horizontal" className="trama-unit-inspector-chip">가로</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>

      <div className="trama-cell-array-section">
        <span className="trama-unit-inspector-section-label">셀</span>
        <div className="trama-cell-array-cells">
          {params.cells.map((cell, i) => (
            <CellRow
              key={i}
              cell={cell}
              canRemove={params.cells.length > 1}
              onChange={(c) => onCellChange(i, c)}
              onRemove={() => onCellRemove(i)}
            />
          ))}
          <button
            type="button"
            className="trama-cell-array-add"
            onClick={onCellAdd}
          >
            + 셀 추가
          </button>
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 셀 한 행 — range/point 분기
// ─────────────────────────────────────────────────────────

interface CellRowProps {
  cell: Cell;
  canRemove: boolean;
  onChange: (next: Cell) => void;
  onRemove: () => void;
}

function CellRow({ cell, canRemove, onChange, onRemove }: CellRowProps): JSX.Element {
  const onColorChange = (color: SwatchRef) => onChange({ ...cell, color });

  if (cell.kind === 'range') {
    return (
      <div className="trama-cell-row">
        <CellColorPicker
          value={cell.color}
          onChange={onColorChange}
          ariaLabel={`셀 색 (구간 ${cell.lo}~${cell.hi})`}
        />
        <NumberField
          label="lo"
          value={cell.lo}
          onChange={(v) => onChange({ ...cell, lo: v } as RangeCell)}
        />
        <NumberField
          label="hi"
          value={cell.hi}
          onChange={(v) => onChange({ ...cell, hi: v } as RangeCell)}
        />
        <button
          type="button"
          className="trama-cell-row-remove"
          aria-label="셀 제거"
          onClick={onRemove}
          disabled={!canRemove}
        >
          삭제
        </button>
      </div>
    );
  }
  return (
    <div className="trama-cell-row">
      <CellColorPicker
        value={cell.color}
        onChange={onColorChange}
        ariaLabel={`셀 색 (값 ${cell.at})`}
      />
      <NumberField
        label="at"
        value={cell.at}
        onChange={(v) => onChange({ ...cell, at: v } as PointCell)}
      />
      <button
        type="button"
        className="trama-cell-row-remove"
        aria-label="셀 제거"
        onClick={onRemove}
        disabled={!canRemove}
      >
        −
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 모드 추론·프리셋
// ─────────────────────────────────────────────────────────

function inferMode(cells: Cell[]): Mode {
  if (cells.length === 0) return 'gauge';
  const allRange = cells.every((c) => c.kind === 'range');
  const allPoint = cells.every((c) => c.kind === 'point');
  if (allRange) return cells.length === 1 ? 'gauge' : 'segment';
  if (allPoint) return cells.length === 1 ? 'light' : 'step';
  return 'mixed';
}

/**
 * 모드 프리셋의 기본 cells. 가능하면 현재 cells에서 색 정보를 보존한다.
 */
function defaultCellsForMode(mode: Mode, prev: Cell[]): Cell[] {
  const pickColor = (i: number, fallback: SwatchRef): SwatchRef =>
    prev[i]?.color ?? fallback;

  if (mode === 'gauge') {
    return [
      { kind: 'range', lo: 0, hi: 100, color: pickColor(0, { primitive: 'green', shade: '500' }) },
    ];
  }
  if (mode === 'segment') {
    return [
      { kind: 'range', lo: 0,   hi: 33,  color: pickColor(0, { primitive: 'green',  shade: '500' }) },
      { kind: 'range', lo: 33,  hi: 66,  color: pickColor(1, { primitive: 'amber',  shade: '500' }) },
      { kind: 'range', lo: 66,  hi: 100, color: pickColor(2, { primitive: 'red',    shade: '500' }) },
    ];
  }
  if (mode === 'step') {
    return [
      { kind: 'point', at: 0, color: pickColor(0, { primitive: 'gray',  shade: '400' }) },
      { kind: 'point', at: 1, color: pickColor(1, { primitive: 'blue',  shade: '500' }) },
      { kind: 'point', at: 2, color: pickColor(2, { primitive: 'green', shade: '500' }) },
    ];
  }
  // light
  return [
    { kind: 'point', at: 1, color: pickColor(0, { primitive: 'green', shade: '500' }) },
  ];
}
