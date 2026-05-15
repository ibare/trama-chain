import * as Popover from '@radix-ui/react-popover';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Separator from '@radix-ui/react-separator';
import * as Form from '@radix-ui/react-form';
import { useCallback, useMemo, useState } from 'react';
import type { ObserveCapacity, ObserveNode, ValueKind } from '@trama/core';
import { useTrama } from '../store/index.js';
import {
  listObserveVisualizations,
  listObserveVisualizationsForKind,
} from '../observe/registry.js';
import '../observe/register-default-visualizations.js';

interface Props {
  node: ObserveNode;
  /** 입력 소스로부터 추정한 ValueKind. 미연결이면 null. */
  inferredKind: ValueKind | null;
}

const PRESET_SIZES = [10, 30, 100];

/**
 * Observe 노드 옆에 떠 있는 capacity·visualization 편집 패널.
 *
 * - capacity: bounded(슬라이더 + 프리셋) / unbounded 토글
 * - visualization: 입력 ValueKind에 맞는 시각만 후보로 띄움. 미연결이면 전체.
 */
export function ObserveInspector({ node, inferredKind }: Props): JSX.Element {
  const { modelStore } = useTrama();
  const updateNode = modelStore((s) => s.updateNode);

  const isUnbounded = node.capacity.kind === 'unbounded';
  const boundedSize = node.capacity.kind === 'bounded' ? node.capacity.size : 30;
  const [sizeDraft, setSizeDraft] = useState(String(boundedSize));

  const setCapacity = useCallback(
    (next: ObserveCapacity) => {
      updateNode(node.id, { capacity: next });
    },
    [node.id, updateNode],
  );

  const onPickSize = useCallback(
    (n: number) => {
      if (!Number.isFinite(n) || n <= 0) return;
      setSizeDraft(String(n));
      setCapacity({ kind: 'bounded', size: Math.floor(n) });
    },
    [setCapacity],
  );

  const visCandidates = useMemo(
    () =>
      inferredKind
        ? listObserveVisualizationsForKind(inferredKind)
        : listObserveVisualizations(),
    [inferredKind],
  );

  const onPickVis = useCallback(
    (key: string) => {
      if (!key || key === node.visualization) return;
      updateNode(node.id, { visualization: key });
    },
    [node.id, node.visualization, updateNode],
  );

  return (
    <>
      <header className="trama-unit-inspector-header">
        <span>관찰</span>
        <Popover.Close className="trama-unit-inspector-close" aria-label="닫기">
          ×
        </Popover.Close>
      </header>

      <div className="trama-observe-inspector-section">
        <div className="trama-unit-inspector-section-row">
          <span className="trama-unit-inspector-section-label">누적</span>
          <ToggleGroup.Root
            type="single"
            value={isUnbounded ? 'unbounded' : 'bounded'}
            onValueChange={(v) => {
              if (v === 'unbounded') setCapacity({ kind: 'unbounded' });
              else if (v === 'bounded')
                setCapacity({ kind: 'bounded', size: boundedSize });
            }}
            className="trama-unit-inspector-categories"
            aria-label="누적 정책"
          >
            <ToggleGroup.Item value="bounded" className="trama-unit-inspector-chip">
              최근 N개
            </ToggleGroup.Item>
            <ToggleGroup.Item value="unbounded" className="trama-unit-inspector-chip">
              전체
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>

        {!isUnbounded && (
          <Form.Root
            className="trama-observe-inspector-size"
            onSubmit={(e) => e.preventDefault()}
          >
            <ToggleGroup.Root
              type="single"
              value={String(boundedSize)}
              onValueChange={(v) => v && onPickSize(parseInt(v, 10))}
              className="trama-unit-inspector-categories"
              aria-label="누적 크기 프리셋"
            >
              {PRESET_SIZES.map((n) => (
                <ToggleGroup.Item
                  key={n}
                  value={String(n)}
                  className="trama-unit-inspector-chip"
                >
                  {n}
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>
            <Form.Field name="size" className="trama-unit-inspector-range-row">
              <Form.Label className="trama-unit-inspector-range-label">
                사용자 지정
              </Form.Label>
              <Form.Control
                type="number"
                value={sizeDraft}
                min={1}
                step={1}
                className="trama-unit-inspector-range-input"
                onChange={(e) => {
                  setSizeDraft(e.currentTarget.value);
                  const v = parseInt(e.currentTarget.value, 10);
                  if (Number.isFinite(v) && v > 0) {
                    setCapacity({ kind: 'bounded', size: v });
                  }
                }}
              />
            </Form.Field>
          </Form.Root>
        )}
      </div>

      <Separator.Root
        className="trama-unit-inspector-sep"
        decorative
        orientation="horizontal"
      />

      <div className="trama-observe-inspector-section">
        <div className="trama-unit-inspector-section-row">
          <span className="trama-unit-inspector-section-label">시각화</span>
        </div>
        <ToggleGroup.Root
          type="single"
          value={node.visualization}
          onValueChange={(v) => v && onPickVis(v)}
          aria-label="시각화"
          className="trama-unit-inspector-skin-list"
        >
          {visCandidates.map((v) => (
            <ToggleGroup.Item
              key={v.key}
              value={v.key}
              className="trama-unit-inspector-skin"
              title={v.intent}
            >
              <span className="trama-unit-inspector-skin-label">{v.labels.ko}</span>
              <span className="trama-unit-inspector-skin-intent">{v.intent}</span>
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>
    </>
  );
}
