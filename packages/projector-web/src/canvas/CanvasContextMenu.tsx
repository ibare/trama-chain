import { useEffect, useRef } from 'react';
import { useModelStore, useUIStore } from '../store/index.js';
import { functionRegistry } from '../store/registries.js';

const MENU_WIDTH = 200;
const MENU_PADDING = 8;

interface MenuItem {
  key: string;
  label: string;
  symbol?: string;
  group: 'value' | 'function';
  onSelect: () => void;
}

/**
 * 캔버스 빈 영역 우클릭 시 뜨는 메뉴.
 * - 값 노드 추가
 * - 함수 노드 추가 (등록된 함수 목록 전체)
 *
 * 화면 좌표로 fixed 배치하되, 우/하단을 벗어나면 메뉴를 좌/상측으로 뒤집어 잘리지 않게.
 */
export function CanvasContextMenu(): JSX.Element | null {
  const state = useUIStore((s) => s.canvasContextMenu);
  const close = useUIStore((s) => s.closeCanvasContextMenu);
  const addValueNode = useModelStore((s) => s.addNode);
  const addFunctionNode = useModelStore((s) => s.addFunctionNode);
  const setEditingNode = useUIStore((s) => s.setEditingNode);
  const ref = useRef<HTMLDivElement | null>(null);

  // 메뉴 외부 클릭·Escape로 닫기. 한 번 열린 동안만 리스너 부착.
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

  const items: MenuItem[] = [
    {
      key: 'value',
      label: '값 노드',
      group: 'value',
      onSelect: () => {
        const node = addValueNode({
          label: '새 변수',
          unitId: 'rating-10',
          initialValue: 5,
          position: state.canvas,
        });
        setEditingNode(node.id);
      },
    },
    ...functionRegistry.list().map<MenuItem>((def) => ({
      key: `fn-${def.key}`,
      label: def.labels.ko,
      symbol: def.symbol,
      group: 'function',
      onSelect: () => {
        addFunctionNode({
          label: def.labels.ko,
          functionKey: def.key,
          position: state.canvas,
        });
      },
    })),
  ];

  // 화면 경계 클램프 (대략. 정확한 메뉴 높이는 렌더 후 측정 가능하지만 v1엔 근사).
  const approxHeight = 12 + items.length * 30 + 8;
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
      <div className="trama-context-menu-section-label">변수</div>
      {items
        .filter((it) => it.group === 'value')
        .map((it) => (
          <MenuButton key={it.key} item={it} close={close} />
        ))}
      <div className="trama-context-menu-divider" />
      <div className="trama-context-menu-section-label">함수</div>
      {items
        .filter((it) => it.group === 'function')
        .map((it) => (
          <MenuButton key={it.key} item={it} close={close} />
        ))}
    </div>
  );
}

function MenuButton({ item, close }: { item: MenuItem; close: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="trama-context-menu-item"
      onClick={() => {
        item.onSelect();
        close();
      }}
    >
      {item.symbol && <span className="trama-context-menu-symbol">{item.symbol}</span>}
      <span className="trama-context-menu-label">{item.label}</span>
    </button>
  );
}
