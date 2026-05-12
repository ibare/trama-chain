import { useEffect, useRef, useState } from 'react';
import { placePanel } from './panel-placement.js';

/**
 * 떠 있는 패널(인스펙터·picker)의 공통 셸.
 *
 * - 절대 위치 + z-index + 등장 애니메이션
 * - placePanel로 화면 안에 들어오도록 좌표 보정
 * - 컨텐츠 크기를 모를 때 ResizeObserver로 측정
 * - document pointerdown으로 외부 클릭 감지 → onClose
 *
 * 추상화의 책임:
 *   anchor(화면 좌표) → 적절한 left/top + outside-click 닫기.
 * 컨텐츠가 anchor를 계산해 넘기고, 닫는 행위는 패널이 책임.
 */

export type FloatingPanelPlacement =
  | { kind: 'side'; gap?: { x: number; y: number } }
  | { kind: 'below-center'; offsetY?: number };

interface Props {
  /** 화면 좌표 기준 anchor 점. */
  anchor: { x: number; y: number };
  /** 외부 클릭 시 호출됨. */
  onClose: () => void;
  placement: FloatingPanelPlacement;
  /** 알고 있는 고정 크기. 미지정 시 컨텐츠 크기를 측정해 사용. */
  size?: { width: number; height: number };
  className?: string;
  children: React.ReactNode;
}

const BOUND_MARGIN = 8;

export function FloatingPanel({
  anchor,
  onClose,
  placement,
  size,
  className,
  children,
}: Props): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(
    size ?? null,
  );

  useEffect(() => {
    if (size) {
      setMeasured(size);
      return;
    }
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setMeasured((prev) => {
        if (prev && prev.width === rect.width && prev.height === rect.height) return prev;
        return { width: rect.width, height: rect.height };
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const el = panelRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onClose]);

  const placed = measured ? compute(anchor, measured, placement) : null;
  const style: React.CSSProperties = placed
    ? {
        left: placed.x,
        top: placed.y,
        ...(size ? { width: size.width, height: size.height } : null),
      }
    : { left: anchor.x, top: anchor.y + 12, visibility: 'hidden' };

  const classes = `trama-floating-panel${className ? ` ${className}` : ''}`;

  return (
    <div ref={panelRef} className={classes} style={style}>
      {children}
    </div>
  );
}

function compute(
  anchor: { x: number; y: number },
  panel: { width: number; height: number },
  placement: FloatingPanelPlacement,
): { x: number; y: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const bounds = {
    minX: BOUND_MARGIN,
    minY: BOUND_MARGIN,
    maxX: vw - BOUND_MARGIN,
    maxY: vh - BOUND_MARGIN,
  };
  if (placement.kind === 'side') {
    const r = placePanel({
      anchor,
      panel: { w: panel.width, h: panel.height },
      bounds,
      gap: placement.gap,
    });
    return { x: r.x, y: r.y };
  }
  const offsetY = placement.offsetY ?? 12;
  const desiredX = anchor.x - panel.width / 2;
  const r = placePanel({
    anchor: { x: desiredX, y: anchor.y + offsetY },
    panel: { w: panel.width, h: panel.height },
    bounds,
    gap: { x: 0, y: 0 },
  });
  return { x: r.x, y: r.y };
}
