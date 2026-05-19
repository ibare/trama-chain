import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { clamp01, tToValue, valueToT, type KnobMode } from './knob-geometry.js';

/**
 * Knob drag 인터랙션 — vertical drag(위=증가). 픽셀당 t 증감 = 1/(4*size).
 * shift+drag 는 continuous 에서만 감도 × fineDragRatio. stepped 는 t 누적 후
 * round-to-stop 으로 스냅 — 사용자 표현 "탁탁탁".
 *
 * pointerdown 에서 `stopPropagation` + `setPointerCapture` — 노드 drag 와 충돌
 * 회피. value/mode/size/onChange 는 ref 에 박아 두기 때문에 콜백 동안 stale
 * closure 가 생기지 않는다.
 */
interface UseKnobDragOpts {
  value: number;
  mode: KnobMode;
  size: number;
  disabled?: boolean;
  /** continuous shift+drag 미세 감도 비율. 기본 0.25. */
  fineDragRatio?: number;
  onChange: (next: number) => void;
}

interface UseKnobDragApi {
  onPointerDown: (e: ReactPointerEvent<SVGElement>) => void;
}

export function useKnobDrag({
  value,
  mode,
  size,
  disabled,
  fineDragRatio = 0.25,
  onChange,
}: UseKnobDragOpts): UseKnobDragApi {
  const stateRef = useRef<{ startY: number; startT: number; pointerId: number } | null>(
    null,
  );
  const valueRef = useRef(value);
  valueRef.current = value;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const fineRef = useRef(fineDragRatio);
  fineRef.current = fineDragRatio;

  const handleMove = useCallback((e: PointerEvent) => {
    const s = stateRef.current;
    if (!s) return;
    const dy = s.startY - e.clientY;
    const m = modeRef.current;
    const pxPerSpan = 4 * sizeRef.current;
    if (pxPerSpan <= 0) return;
    let ratio = dy / pxPerSpan;
    if (e.shiftKey && m.kind === 'continuous') {
      ratio *= fineRef.current;
    }
    const next = tToValue(clamp01(s.startT + ratio), m);
    if (next !== valueRef.current) {
      onChangeRef.current(next);
    }
  }, []);

  const handleUp = useCallback(
    (e: PointerEvent) => {
      const s = stateRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      stateRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    },
    [handleMove],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGElement>) => {
      if (disabled) return;
      e.stopPropagation();
      const target = e.currentTarget;
      if (typeof target.setPointerCapture === 'function') {
        try {
          target.setPointerCapture(e.pointerId);
        } catch {
          // capture 실패해도 window 리스너로 fallback — 단순 무시.
        }
      }
      stateRef.current = {
        startY: e.clientY,
        startT: valueToT(valueRef.current, modeRef.current),
        pointerId: e.pointerId,
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
    },
    [disabled, handleMove, handleUp],
  );

  return { onPointerDown };
}
