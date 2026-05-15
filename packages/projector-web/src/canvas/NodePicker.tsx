import { useMemo, useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
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
 * 사용자가 칩을 골라 "추가"를 누른 순간에만 노드가 실제로 생성된다.
 * 엣지 중간 진입에서는 같은 트랜잭션의 마무리로 원래 엣지를 두 갈래로 분할한다.
 *
 * Radix Dialog를 그대로 사용 — 자체 outside-click/ESC/focus-trap을 구현하지 않는다.
 * Portal은 사용하지 않는다(기존 TramaPopover와 동일한 정책): Content는 position:fixed라
 * [data-trama-root]의 overflow clipping에 잘리지 않으면서 CSS 토큰은 그대로 상속한다.
 */

const PANEL_WIDTH = 880;
const PANEL_HEIGHT = 560;
const VIEWPORT_PADDING = 8;

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

function NodePickerBody({ intent, instance, modelStore, close }: BodyProps): JSX.Element {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // 디스크립터·아이템 목록은 한 번 계산 — 인스턴스·진입이 바뀌면 재계산되도록
  // 의존성에 instance를 포함.
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

  // 진입 시점 좌표 → 화면 안에 들어오도록 클램프.
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

  // 선택된 아이템 — 모든 섹션에서 검색.
  const selectedItem = useMemo(() => {
    if (!selectedKey) return null;
    for (const s of sections) {
      const it = s.items.find((i) => i.key === selectedKey);
      if (it) return it;
    }
    return null;
  }, [selectedKey, sections]);

  // 진입이 바뀌면 선택 초기화.
  useEffect(() => {
    setSelectedKey(null);
  }, [intent]);

  function handleConfirm() {
    if (!selectedItem) return;
    const newNodeId = selectedItem.createNode(intent.canvasPos);
    if (intent.origin === 'edge-split') {
      const state = modelStore.getState();
      const original = state.model.edges[intent.edgeId];
      if (original) {
        state.addEdge({
          from: original.from,
          to: newNodeId,
          shape: original.shape,
          inverted: original.inverted,
          lag: original.lag,
        });
        state.addEdge({
          from: newNodeId,
          to: original.to,
          shape: { kind: 'none', params: {} },
          inverted: false,
          lag: original.lag,
        });
        state.removeEdge(intent.edgeId);
      }
    }
    close();
  }

  return (
    <Dialog.Content
      className="trama-node-picker"
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        // Radix 기본 transform(centering) 무력화.
        transform: 'none',
      }}
      onOpenAutoFocus={(e) => {
        // 칩 그리드에 자동 포커스가 가지 않도록 — 본문은 그대로 두고
        // ESC만 처리한다. focus-trap은 유지.
        e.preventDefault();
      }}
    >
      <Dialog.Title className="trama-node-picker-title">노드 추가</Dialog.Title>
      <Dialog.Description className="trama-node-picker-sr">
        칩을 골라 추가할 노드를 선택하세요.
      </Dialog.Description>

      <div className="trama-node-picker-body">
        <div className="trama-node-picker-chips" role="listbox" aria-label="노드 종류">
          {sections.map((section, idx) => (
            <div key={section.label} className="trama-node-picker-section">
              {idx > 0 && <div className="trama-node-picker-divider" />}
              <div className="trama-node-picker-section-label">{section.label}</div>
              <div className="trama-node-picker-grid">
                {section.items.map((it) => {
                  const active = it.key === selectedKey;
                  return (
                    <button
                      key={it.key}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`trama-node-picker-chip${active ? ' is-active' : ''}`}
                      onClick={() => setSelectedKey(it.key)}
                    >
                      {it.symbol && (
                        <span className="trama-node-picker-symbol">{it.symbol}</span>
                      )}
                      <span className="trama-node-picker-label">{it.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="trama-node-picker-preview" aria-live="polite">
          {selectedItem ? (
            <>
              <div className="trama-node-picker-preview-heading">{selectedItem.label}</div>
              <div className="trama-node-picker-preview-body">
                {selectedItem.description ?? '선택한 노드의 설명이 여기에 표시됩니다.'}
              </div>
            </>
          ) : (
            <div className="trama-node-picker-preview-empty">
              왼쪽에서 노드를 선택하면 설명이 표시됩니다.
            </div>
          )}
        </div>
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
          disabled={!selectedItem}
          onClick={handleConfirm}
        >
          추가
        </button>
      </div>
    </Dialog.Content>
  );
}
