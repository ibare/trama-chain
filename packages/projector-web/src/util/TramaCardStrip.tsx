import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';

/**
 * 인스펙터의 카드형 단일 선택 컨트롤.
 *
 * - 항목이 컨테이너 폭을 넘기면 가로 스크롤로 추가 카드를 노출. 트랙패드 좌우
 *   스와이프는 native, 마우스 휠 deltaY 는 horizontal 로 매핑, 마우스 드래그도
 *   지원(5px 임계값으로 클릭과 분리).
 * - 카드는 정사각형(aspect-ratio 1/1) 88px 고정. 아이콘 + 라벨 2줄.
 * - 시맨틱은 ToggleGroup type="single" — 동일 키 재클릭 무시(라디오 동작).
 */

export interface TramaCardStripItem {
  key: string;
  label: ReactNode;
  /** 카드 상단 아이콘 영역. ReactNode — 호출처에서 PhosphorIcon 등 자유. */
  icon?: ReactNode;
}

interface Props {
  ariaLabel: string;
  items: TramaCardStripItem[];
  value: string | null;
  onValueChange: (key: string) => void;
  disabled?: boolean;
}

const DRAG_THRESHOLD_PX = 5;

export function TramaCardStrip({
  ariaLabel,
  items,
  value,
  onValueChange,
  disabled,
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startScroll: number;
    pointerId: number;
    moved: boolean;
  } | null>(null);

  // 마우스 휠 deltaY 를 horizontal 로 매핑. 트랙패드 좌우 스와이프는 deltaX 로
  // 들어와 native overflow-x 가 처리하므로 그대로 둔다.
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // 좌클릭만 드래그 시작. 마우스가 아닌 입력(touch/pen)은 native 스크롤 그대로.
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    dragRef.current = {
      startX: e.clientX,
      startScroll: el.scrollLeft,
      pointerId: e.pointerId,
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = containerRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    if (!d.moved) {
      d.moved = true;
      try {
        e.currentTarget.setPointerCapture(d.pointerId);
      } catch {
        /* capture 실패해도 동작은 한다. */
      }
      document.body.style.cursor = 'grabbing';
    }
    el.scrollLeft = d.startScroll - dx;
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      document.body.style.cursor = '';
      try {
        e.currentTarget.releasePointerCapture(d.pointerId);
      } catch {
        /* capture 미설정 상태일 수 있음 — 무시. */
      }
    }
  }, []);

  // 드래그 직후의 click 이벤트(=카드 선택)를 막아 의도치 않은 선택 방지.
  const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // dragRef 은 endDrag 에서 비워졌지만, "직전 드래그 여부" 신호로 data-attr 사용.
    const el = containerRef.current;
    if (!el) return;
    if (el.dataset.justDragged === '1') {
      e.preventDefault();
      e.stopPropagation();
      delete el.dataset.justDragged;
    }
  }, []);

  // endDrag 에서 drag flag 를 1tick 동안 유지 — 같은 pointerup → click 시퀀스에서만 차단.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onUp = (): void => {
      if (dragRef.current?.moved) {
        el.dataset.justDragged = '1';
        setTimeout(() => {
          if (el.dataset.justDragged === '1') delete el.dataset.justDragged;
        }, 0);
      }
    };
    el.addEventListener('pointerup', onUp);
    return () => el.removeEventListener('pointerup', onUp);
  }, []);

  return (
    <div
      ref={containerRef}
      className="trama-card-strip"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
    >
      <ToggleGroup.Root
        type="single"
        value={value ?? ''}
        onValueChange={(v) => v && onValueChange(v)}
        aria-label={ariaLabel}
        className="trama-card-strip-track"
        disabled={disabled}
      >
        {items.map((it) => (
          <ToggleGroup.Item
            key={it.key}
            value={it.key}
            className="trama-card-strip-card"
          >
            {it.icon !== undefined && (
              <span className="trama-card-strip-icon" aria-hidden>
                {it.icon}
              </span>
            )}
            <span className="trama-card-strip-label">{it.label}</span>
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}
