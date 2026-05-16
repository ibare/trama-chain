import { useMemo, useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as HoverCard from '@radix-ui/react-hover-card';
import type { NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { listNodeKindUIs, type NodeMenuItem } from '../node/kind-catalog.js';
import type { ModelStoreInstance } from '../store/model-store.js';
import type { TramaInstance } from '../store/trama-instance.js';
import type { NodePickerIntent } from '../store/ui-store.js';
import '../node/register-default-kinds.js';

/**
 * 노드 추가 통합 패널.
 *
 * 진입 3종(빈 캔버스 dblclick·우클릭·엣지 중간 클릭) 모두 이 패널을 거치며,
 * 사용자가 타일을 골라 "추가"를 누른 순간에만 노드가 실제로 생성된다.
 *
 * UI 구성:
 *   - 상단 필터칩 ToggleGroup — All + descriptor의 menuSectionLabel 동적 추출
 *   - 본문 타일 그리드 — 큰 아이콘 + 라벨, 멀티 선택 (우상단 순번 배지)
 *   - 호버 시 HoverCard로 설명 팝오버 (200ms 지연)
 *   - 하단 "N개 추가" 액션
 *
 * 멀티 생성 정책:
 *   - 자유 추가: 선택 순번대로 가로 일렬, NODE_HSTEP 간격, 한 행 NODE_MAX_PER_ROW개
 *   - 엣지 분할: 직렬 체인 — 원본 from → 새 노드들 → 원본 to. 첫 엣지만 원본 shape 보존
 *     좌표는 두 끝점 사이를 균등 분할 (i=1..n / (n+1))
 *
 * Radix Dialog·ToggleGroup·HoverCard 그대로 사용 — 자체 outside-click/ESC/focus-trap
 * 구현 없음. HoverCard는 Portal 미사용으로 [data-trama-root] 스코프 유지 (CSS 토큰 상속).
 */

const PANEL_WIDTH = 720;
const PANEL_HEIGHT = 560;
const VIEWPORT_PADDING = 8;
const NODE_HSTEP = 180;
const NODE_VSTEP = 160;
const NODE_MAX_PER_ROW = 5;

export function NodePicker(): JSX.Element | null {
  const instance = useTrama();
  const { uiStore, modelStore } = instance;
  const intent = uiStore((s) => s.nodePickerIntent);
  const close = uiStore((s) => s.closeNodePicker);
  const open = intent !== null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      {open && intent && (
        <NodePickerBody intent={intent} instance={instance} modelStore={modelStore} close={close} />
      )}
    </Dialog.Root>
  );
}

interface BodyProps {
  intent: NodePickerIntent;
  instance: TramaInstance;
  modelStore: ModelStoreInstance;
  close: () => void;
}

const ALL = '__all__';

function NodePickerBody({ intent, instance, modelStore, close }: BodyProps): JSX.Element {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [category, setCategory] = useState<string>(ALL);

  const sections = useMemo(() => {
    const sectionMap = new Map<string, { order: number; items: NodeMenuItem[] }>();
    for (const desc of listNodeKindUIs()) {
      const existing = sectionMap.get(desc.menuSectionLabel);
      const items = desc.buildMenuItems(instance);
      if (existing) {
        existing.items = [...existing.items, ...items];
      } else {
        sectionMap.set(desc.menuSectionLabel, {
          order: desc.menuSectionOrder,
          items,
        });
      }
    }
    return Array.from(sectionMap.entries())
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([label, v]) => ({ label, items: v.items }));
  }, [instance]);

  const categories = useMemo(() => sections.map((s) => s.label), [sections]);

  const filteredItems = useMemo<NodeMenuItem[]>(() => {
    if (category === ALL) return sections.flatMap((s) => s.items);
    const found = sections.find((s) => s.label === category);
    return found ? found.items : [];
  }, [sections, category]);

  const itemByKey = useMemo(() => {
    const map = new Map<string, NodeMenuItem>();
    for (const s of sections) for (const it of s.items) map.set(it.key, it);
    return map;
  }, [sections]);

  const position = useMemo(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    let left = intent.screenPos.x;
    let top = intent.screenPos.y;
    if (left + PANEL_WIDTH > vw - VIEWPORT_PADDING) left = vw - PANEL_WIDTH - VIEWPORT_PADDING;
    if (top + PANEL_HEIGHT > vh - VIEWPORT_PADDING) top = vh - PANEL_HEIGHT - VIEWPORT_PADDING;
    if (left < VIEWPORT_PADDING) left = VIEWPORT_PADDING;
    if (top < VIEWPORT_PADDING) top = VIEWPORT_PADDING;
    return { left, top };
  }, [intent.screenPos.x, intent.screenPos.y]);

  useEffect(() => {
    setSelectedKeys([]);
    setCategory(ALL);
  }, [intent]);

  /**
   * 타일 클릭 — 데스크톱 멀티 셀렉트 관습 적용.
   *   - 일반 클릭: 단일 선택. 이미 그 항목만 선택돼 있으면 해제(빈 선택).
   *   - Shift/Meta/Ctrl + 클릭: 선택 토글(추가/제거).
   */
  function handleTileClick(key: string, additive: boolean): void {
    setSelectedKeys((prev) => {
      if (additive) {
        const i = prev.indexOf(key);
        if (i >= 0) return prev.filter((k) => k !== key);
        return [...prev, key];
      }
      if (prev.length === 1 && prev[0] === key) return [];
      return [key];
    });
  }

  function handleConfirm(): void {
    if (selectedKeys.length === 0) return;
    if (intent.origin === 'edge-split') {
      addAsEdgeChain(selectedKeys, intent.edgeId, intent.canvasPos, modelStore, itemByKey);
    } else {
      addAsFreeRow(selectedKeys, intent.canvasPos, itemByKey);
    }
    close();
  }

  const count = selectedKeys.length;

  return (
    <Dialog.Content
      className="trama-node-picker"
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        transform: 'none',
      }}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
      }}
    >
      <Dialog.Title className="trama-node-picker-title">노드 추가</Dialog.Title>
      <Dialog.Description className="trama-node-picker-sr">
        타일을 클릭해 추가할 노드를 선택하세요. 여러 개 선택 가능합니다.
      </Dialog.Description>

      <ToggleGroup.Root
        type="single"
        value={category}
        onValueChange={(v) => v && setCategory(v)}
        className="trama-node-picker-filters"
        aria-label="노드 카테고리"
      >
        <ToggleGroup.Item value={ALL} className="trama-node-picker-filter">
          All
        </ToggleGroup.Item>
        {categories.map((c) => (
          <ToggleGroup.Item key={c} value={c} className="trama-node-picker-filter">
            {c}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>

      <div className="trama-node-picker-body">
        {filteredItems.length === 0 ? (
          <div className="trama-node-picker-empty">해당 카테고리에 노드가 없습니다.</div>
        ) : (
          <div
            className="trama-node-picker-tiles"
            role="listbox"
            aria-multiselectable="true"
            aria-label="노드 종류"
          >
            {filteredItems.map((it) => {
              const idx = selectedKeys.indexOf(it.key);
              const selected = idx >= 0;
              return (
                <HoverCard.Root key={it.key} openDelay={200} closeDelay={80}>
                  <HoverCard.Trigger asChild>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`trama-node-picker-tile${selected ? ' is-selected' : ''}`}
                      onClick={(e) => {
                        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                        handleTileClick(it.key, additive);
                      }}
                    >
                      <span className="trama-node-picker-tile-icon" aria-hidden>
                        {it.symbol ?? '◯'}
                      </span>
                      <span className="trama-node-picker-tile-label">{it.label}</span>
                      {selected && (
                        <span className="trama-node-picker-tile-badge" aria-hidden>
                          {idx + 1}
                        </span>
                      )}
                    </button>
                  </HoverCard.Trigger>
                  <HoverCard.Content
                    side="top"
                    sideOffset={6}
                    collisionPadding={8}
                    className="trama-node-picker-hover"
                  >
                    <div className="trama-node-picker-hover-title">{it.label}</div>
                    <div className="trama-node-picker-hover-body">
                      {it.description ?? '설명이 아직 등록되지 않았습니다.'}
                    </div>
                  </HoverCard.Content>
                </HoverCard.Root>
              );
            })}
          </div>
        )}
      </div>

      <div className="trama-node-picker-actions">
        <Dialog.Close asChild>
          <button type="button" className="trama-node-picker-btn trama-node-picker-btn--ghost">
            취소
          </button>
        </Dialog.Close>
        <button
          type="button"
          className="trama-node-picker-btn trama-node-picker-btn--primary"
          disabled={count === 0}
          onClick={handleConfirm}
        >
          {count === 0 ? '추가' : `${count}개 추가`}
        </button>
      </div>
    </Dialog.Content>
  );
}

/**
 * 자유 추가 — 선택 순번대로 가로 일렬, 줄바꿈 후 다음 행.
 * 시작점은 사용자가 클릭한 캔버스 좌표.
 */
function addAsFreeRow(
  keys: string[],
  origin: { x: number; y: number },
  itemByKey: Map<string, NodeMenuItem>,
): void {
  let col = 0;
  let row = 0;
  for (const key of keys) {
    const item = itemByKey.get(key);
    if (!item) continue;
    item.createNode({
      x: origin.x + col * NODE_HSTEP,
      y: origin.y + row * NODE_VSTEP,
    });
    col++;
    if (col >= NODE_MAX_PER_ROW) {
      col = 0;
      row++;
    }
  }
}

/**
 * 엣지 분할 — n개의 새 노드를 from→to 사이에 직렬 체인으로 끼움.
 * 좌표는 두 끝점을 (n+1) 등분. 첫 엣지만 원본 shape/inverted 보존, 나머지는 'none'.
 * lag는 모두 원본 값 유지 (체인 전체가 같은 시점에서 평가되도록).
 */
function addAsEdgeChain(
  keys: string[],
  edgeId: string,
  fallbackPos: { x: number; y: number },
  modelStore: ModelStoreInstance,
  itemByKey: Map<string, NodeMenuItem>,
): void {
  const state = modelStore.getState();
  const original = state.model.edges[edgeId];
  if (!original) return;
  const fromNode = state.model.nodes[original.from];
  const toNode = state.model.nodes[original.to];
  const startPos = fromNode?.position ?? fallbackPos;
  const endPos = toNode?.position ?? fallbackPos;

  const n = keys.length;
  const newIds: NodeId[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    const pos = {
      x: startPos.x + (endPos.x - startPos.x) * t,
      y: startPos.y + (endPos.y - startPos.y) * t,
    };
    const item = itemByKey.get(keys[i]!);
    if (!item) continue;
    newIds.push(item.createNode(pos));
  }
  if (newIds.length === 0) return;

  state.addEdge({
    from: original.from,
    to: newIds[0]!,
    shape: original.shape,
    inverted: original.inverted,
    lag: original.lag,
  });
  for (let i = 0; i < newIds.length - 1; i++) {
    state.addEdge({
      from: newIds[i]!,
      to: newIds[i + 1]!,
      shape: { kind: 'none', params: {} },
      inverted: false,
      lag: original.lag,
    });
  }
  state.addEdge({
    from: newIds[newIds.length - 1]!,
    to: original.to,
    shape: { kind: 'none', params: {} },
    inverted: false,
    lag: original.lag,
  });
  state.removeEdge(edgeId);
}
