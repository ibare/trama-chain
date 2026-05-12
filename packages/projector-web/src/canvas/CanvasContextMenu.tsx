import { useEffect, useRef } from 'react';
import { useUIStore } from '../store/index.js';
import { listNodeKindUIs } from '../node/kind-catalog.js';
import '../node/register-default-kinds.js';

const MENU_WIDTH = 200;
const MENU_PADDING = 8;

/**
 * 캔버스 빈 영역 우클릭 시 뜨는 메뉴.
 * 노드 종류 카탈로그(kind-catalog)에서 섹션·아이템을 가져와 렌더한다.
 * 새 노드 종류 추가 시 카탈로그에 디스크립터를 등록하면 자동 반영.
 */
export function CanvasContextMenu(): JSX.Element | null {
  const state = useUIStore((s) => s.canvasContextMenu);
  const close = useUIStore((s) => s.closeCanvasContextMenu);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!state) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [close, state]);

  if (!state) return null;

  const sections = listNodeKindUIs().map((desc) => ({
    label: desc.menuSectionLabel,
    items: desc.buildMenuItems(),
  }));

  // 화면 경계 클램프 — 정확한 메뉴 높이는 렌더 후 측정 가능하지만 v1엔 근사.
  const totalItems = sections.reduce((n, s) => n + s.items.length, 0);
  const approxHeight = 12 + totalItems * 30 + sections.length * 28;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  let left = state.screen.x;
  let top = state.screen.y;
  if (left + MENU_WIDTH > vw - MENU_PADDING) left = vw - MENU_WIDTH - MENU_PADDING;
  if (top + approxHeight > vh - MENU_PADDING) top = vh - approxHeight - MENU_PADDING;
  if (left < MENU_PADDING) left = MENU_PADDING;
  if (top < MENU_PADDING) top = MENU_PADDING;

  return (
    <div
      ref={ref}
      className="trama-context-menu"
      style={{
        position: 'fixed',
        left,
        top,
        width: MENU_WIDTH,
        zIndex: 1000,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {sections.map((section, idx) => (
        <div key={section.label}>
          {idx > 0 && <div className="trama-context-menu-divider" />}
          <div className="trama-context-menu-section-label">{section.label}</div>
          {section.items.map((it) => (
            <button
              key={it.key}
              type="button"
              className="trama-context-menu-item"
              onClick={() => {
                it.onSelect(state.canvas);
                close();
              }}
            >
              {it.symbol && (
                <span className="trama-context-menu-symbol">{it.symbol}</span>
              )}
              <span className="trama-context-menu-label">{it.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
