import { useRef, useState, type PointerEvent, type RefObject } from 'react';

/**
 * 캔버스 하단 남쪽 stripe — 호스트 문서 안에서 trama 영역의 높이를 사용자가 직접
 * 조절한다. 너비는 호스트 컨테이너 너비에 위임하므로 핸들은 높이 한 축만 다룬다.
 *
 * - drag 중에는 root DOM 의 style.height 를 직접 mutate 하여 zustand re-render
 *   비용 없이 매끄럽게 transient preview. mouseup 에 한 번만 store 로 commit.
 * - drag 종료 시 root.style 의 인라인 override 를 해제하여 React 가 다음
 *   render 에서 committedHeight 를 그대로 반영한다 — 단일 source of truth 회복.
 */
export interface CanvasResizeHandleProps {
  /** 현재 모델에 영속된 캔버스 높이(px). drag 시작 baseline. */
  committedHeight: number;
  /** drag 종료 시 호출. 클램프된 최종 px 값. */
  onCommit: (height: number) => void;
  /** root([data-trama-root]) DOM 참조 — drag 중 transient height 를 직접 적용. */
  rootRef: RefObject<HTMLDivElement | null>;
  /** 최소 px. 기본 200. */
  min?: number;
  /** 최대 px. 기본 1200. */
  max?: number;
}

const DEFAULT_MIN = 200;
const DEFAULT_MAX = 1200;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function CanvasResizeHandle({
  committedHeight,
  onCommit,
  rootRef,
  min = DEFAULT_MIN,
  max = DEFAULT_MAX,
}: CanvasResizeHandleProps): JSX.Element {
  const startRef = useRef<{ y: number; h: number } | null>(null);
  const [active, setActive] = useState(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { y: e.clientY, h: committedHeight };
    setActive(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const start = startRef.current;
    if (!start) return;
    // sub-pixel clientY 가 그대로 흘러 attrs.height 에 617.98046875 같은 분수가
    // 박히지 않도록 정수 px 로 스냅.
    const next = Math.round(clamp(start.h + (e.clientY - start.y), min, max));
    const root = rootRef.current;
    if (root) root.style.height = next + 'px';
  };

  const finish = (e: PointerEvent<HTMLDivElement>, commit: boolean): void => {
    const start = startRef.current;
    if (!start) return;
    const root = rootRef.current;
    let next = committedHeight;
    if (commit && root) {
      next = Math.round(clamp(start.h + (e.clientY - start.y), min, max));
    }
    if (root) root.style.height = '';
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
    startRef.current = null;
    setActive(false);
    if (commit && next !== committedHeight) onCommit(next);
  };

  return (
    <div
      className="trama-canvas-resize-handle"
      data-active={active ? 'true' : undefined}
      role="separator"
      aria-orientation="horizontal"
      aria-label="캔버스 높이 조절"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
    />
  );
}
