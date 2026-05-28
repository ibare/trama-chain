import * as Popover from '@radix-ui/react-popover';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Separator from '@radix-ui/react-separator';
import { useCallback, useMemo } from 'react';
import { NumberField } from '../util/NumberField.js';
import { TramaCardStrip } from '../util/TramaCardStrip.js';
import { PhosphorIcon } from '../icon/phosphor.js';
import type {
  ObserveCapacity,
  ObserveExtraction,
  ObserveNode,
  ValueKind,
} from '@trama-chain/core';
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

/** 보관 윈도우 프리셋 — 시뮬레이션 시간 기준 ms. tick rate와 무관하게 "최근 N초". */
const PRESET_WINDOWS_MS = [30_000, 60_000, 180_000];
/** 누적 추출 throttle 간격 프리셋 — 시뮬레이션 시간 기준 ms. */
const PRESET_INTERVALS_MS = [1000, 5000, 10000];

function msLabel(ms: number): string {
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}

/**
 * Observe 노드 옆에 떠 있는 capacity·visualization 편집 패널.
 *
 * - capacity: windowed(시간 윈도우 프리셋 + 사용자 지정) / unbounded 토글
 * - visualization: 입력 ValueKind에 맞는 시각만 후보로 띄움. 미연결이면 전체.
 */
export function ObserveInspector({ node, inferredKind }: Props): JSX.Element {
  const { modelStore } = useTrama();
  const updateNode = modelStore((s) => s.updateNode);

  const isUnbounded = node.capacity.kind === 'unbounded';
  const windowMs =
    node.capacity.kind === 'windowed' ? node.capacity.windowMs : 60_000;

  const isThrottled = node.extraction.kind === 'throttle';
  const intervalMs =
    node.extraction.kind === 'throttle' ? node.extraction.intervalMs : 1000;

  const setExtraction = useCallback(
    (next: ObserveExtraction) => {
      updateNode(node.id, { extraction: next });
    },
    [node.id, updateNode],
  );

  const onPickInterval = useCallback(
    (ms: number) => {
      if (!Number.isFinite(ms) || ms <= 0) return;
      setExtraction({ kind: 'throttle', intervalMs: Math.floor(ms) });
    },
    [setExtraction],
  );

  const setCapacity = useCallback(
    (next: ObserveCapacity) => {
      updateNode(node.id, { capacity: next });
    },
    [node.id, updateNode],
  );

  const onPickWindowMs = useCallback(
    (ms: number) => {
      if (!Number.isFinite(ms) || ms <= 0) return;
      setCapacity({ kind: 'windowed', windowMs: Math.floor(ms) });
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
            value={isUnbounded ? 'unbounded' : 'windowed'}
            onValueChange={(v) => {
              if (v === 'unbounded') setCapacity({ kind: 'unbounded' });
              else if (v === 'windowed')
                setCapacity({ kind: 'windowed', windowMs });
            }}
            className="trama-unit-inspector-categories"
            aria-label="누적 정책"
          >
            <ToggleGroup.Item value="windowed" className="trama-unit-inspector-chip">
              최근 시간
            </ToggleGroup.Item>
            <ToggleGroup.Item value="unbounded" className="trama-unit-inspector-chip">
              전체
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>

        {!isUnbounded && (
          <div className="trama-observe-inspector-size">
            <ToggleGroup.Root
              type="single"
              value={String(windowMs)}
              onValueChange={(v) => v && onPickWindowMs(parseInt(v, 10))}
              className="trama-unit-inspector-categories"
              aria-label="보관 윈도우 프리셋"
            >
              {PRESET_WINDOWS_MS.map((ms) => (
                <ToggleGroup.Item
                  key={ms}
                  value={String(ms)}
                  className="trama-unit-inspector-chip"
                >
                  {msLabel(ms)}
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>
            <NumberField
              label="사용자 지정"
              value={windowMs / 1000}
              unit="s"
              precision={0}
              min={1}
              onChange={(sec) => {
                if (sec > 0) setCapacity({ kind: 'windowed', windowMs: Math.floor(sec * 1000) });
              }}
            />
          </div>
        )}
      </div>

      <Separator.Root
        className="trama-unit-inspector-sep"
        decorative
        orientation="horizontal"
      />

      <div className="trama-observe-inspector-section">
        <div className="trama-unit-inspector-section-row">
          <span className="trama-unit-inspector-section-label">추출</span>
          <ToggleGroup.Root
            type="single"
            value={isThrottled ? 'throttle' : 'realtime'}
            onValueChange={(v) => {
              if (v === 'realtime') setExtraction({ kind: 'realtime' });
              else if (v === 'throttle')
                setExtraction({ kind: 'throttle', intervalMs });
            }}
            className="trama-unit-inspector-categories"
            aria-label="누적 추출 정책"
          >
            <ToggleGroup.Item value="realtime" className="trama-unit-inspector-chip">
              실시간
            </ToggleGroup.Item>
            <ToggleGroup.Item value="throttle" className="trama-unit-inspector-chip">
              주기 발사
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>

        {isThrottled && (
          <div className="trama-observe-inspector-size">
            <ToggleGroup.Root
              type="single"
              value={String(intervalMs)}
              onValueChange={(v) => v && onPickInterval(parseInt(v, 10))}
              className="trama-unit-inspector-categories"
              aria-label="발사 간격 프리셋"
            >
              {PRESET_INTERVALS_MS.map((ms) => (
                <ToggleGroup.Item
                  key={ms}
                  value={String(ms)}
                  className="trama-unit-inspector-chip"
                >
                  {msLabel(ms)}
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>
            <NumberField
              label="사용자 지정"
              value={intervalMs}
              unit="ms"
              precision={0}
              min={1}
              onChange={(v) => {
                if (v > 0) setExtraction({ kind: 'throttle', intervalMs: Math.floor(v) });
              }}
            />
          </div>
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
        <TramaCardStrip
          ariaLabel="시각화"
          value={node.visualization}
          onValueChange={onPickVis}
          items={visCandidates.map((v) => ({
            key: v.key,
            label: v.labels.ko,
            icon: v.icon ? <PhosphorIcon name={v.icon} size={28} /> : undefined,
          }))}
        />
      </div>
    </>
  );
}
