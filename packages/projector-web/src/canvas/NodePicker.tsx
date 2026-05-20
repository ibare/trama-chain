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
 *   - 본문 타일 그리드 — 큰 아이콘 + 라벨, 카드별 카운트 (우상단 뱃지)
 *   - 호버 시 HoverCard로 설명 팝오버 (200ms 지연)
 *   - 하단 "N개 추가" 액션
 *
 * 선택 모델 — Map<key, count>:
 *   - 카드 클릭: count===0 이면 1 (활성), count>=1 이면 -1 (0이 되면 해제)
 *   - 뱃지 클릭: +1 (stopPropagation 으로 카드 클릭 차단)
 *   - 카드 더블클릭: 즉시 confirm + close. 첫 click 의 +1 효과만 남기고 두 번째
 *     click(e.detail===2) 의 -1 은 무시. 이미 잡힌 다른 카드들도 함께 추가.
 *
 * 멀티 생성 정책:
 *   - 자유 추가: Map 의 insertion order 대로 카운트만큼 풀어 가로 일렬, NODE_HSTEP
 *     간격, 한 행 NODE_MAX_PER_ROW개
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
  const [selections, setSelections] = useState<Map<string, number>>(() => new Map());
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
    setSelections(new Map());
    setCategory(ALL);
  }, [intent]);

  // 카드 클릭: 0 → 1 (활성), >=1 → count-1 (0 이면 해제).
  function handleTileClick(key: string): void {
    setSelections((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? 0;
      if (cur === 0) {
        next.set(key, 1);
      } else if (cur <= 1) {
        next.delete(key);
      } else {
        next.set(key, cur - 1);
      }
      return next;
    });
  }

  // 뱃지 클릭: +1. 카드 onClick 으로 전파되지 않도록 호출처에서 stopPropagation.
  function handleBadgeIncrement(key: string): void {
    setSelections((prev) => {
      const next = new Map(prev);
      next.set(key, (next.get(key) ?? 0) + 1);
      return next;
    });
  }

  // 선택된 Map 을 createNode 호출 순서대로 풀어쓴 keys 배열로 변환.
  // Map insertion order = 사용자가 처음 활성화한 순서 → 자유 추가의 가로 배치 순서.
  function expandSelections(): string[] {
    const out: string[] = [];
    for (const [k, c] of selections) {
      for (let i = 0; i < c; i++) out.push(k);
    }
    return out;
  }

  function handleConfirm(): void {
    const keys = expandSelections();
    if (keys.length === 0) return;
    if (intent.origin === 'edge-split') {
      addAsEdgeChain(keys, intent.edgeId, intent.canvasPos, modelStore, itemByKey);
    } else {
      addAsFreeRow(keys, intent.canvasPos, itemByKey);
    }
    close();
  }

  // 더블클릭 — 첫 click 의 +1 효과는 적용된 상태 (두 번째 click 은 e.detail===2 로
  // 카드 onClick 에서 무시됨). 그 상태에서 confirm 으로 즉시 추가 + close.
  function handleTileDoubleClick(key: string): void {
    // 더블클릭한 카드가 아직 selections 에 없다면 (첫 click 이 활성화 안 된
    // 엣지 케이스 방어) 1로 강제.
    if (!selections.has(key)) {
      const keys: string[] = [];
      for (const [k, c] of selections) for (let i = 0; i < c; i++) keys.push(k);
      keys.push(key);
      if (intent.origin === 'edge-split') {
        addAsEdgeChain(keys, intent.edgeId, intent.canvasPos, modelStore, itemByKey);
      } else {
        addAsFreeRow(keys, intent.canvasPos, itemByKey);
      }
      close();
      return;
    }
    handleConfirm();
  }

  let totalCount = 0;
  for (const c of selections.values()) totalCount += c;

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
              const count = selections.get(it.key) ?? 0;
              const selected = count > 0;
              return (
                <HoverCard.Root key={it.key} openDelay={200} closeDelay={80}>
                  <HoverCard.Trigger asChild>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`trama-node-picker-tile${selected ? ' is-selected' : ''}`}
                      onClick={(e) => {
                        // 두 번째 click (e.detail===2) 은 onDoubleClick 의 짝이므로
                        // -1 효과를 흘리지 않도록 무시. 첫 click 의 +1 만 남는다.
                        if (e.detail >= 2) return;
                        handleTileClick(it.key);
                      }}
                      onDoubleClick={() => handleTileDoubleClick(it.key)}
                    >
                      <span className="trama-node-picker-tile-icon" aria-hidden>
                        {it.symbol ?? '◯'}
                      </span>
                      <span className="trama-node-picker-tile-label">{it.label}</span>
                      {selected && (
                        <span
                          className="trama-node-picker-tile-badge"
                          role="button"
                          aria-label={`${it.label} 추가 개수 ${count}, 클릭하여 1 증가`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBadgeIncrement(it.key);
                          }}
                          onDoubleClick={(e) => e.stopPropagation()}
                        >
                          {count}
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
          disabled={totalCount === 0}
          onClick={handleConfirm}
        >
          {totalCount === 0 ? '추가' : `${totalCount}개 추가`}
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
    const id = item.createNode(pos);
    if (!id) continue;
    newIds.push(id);
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
