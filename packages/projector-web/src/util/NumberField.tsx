import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * 인스펙터 공통 숫자 입력. Figma 풍 단일 행 — [라벨 | 숫자 | 단위].
 *
 * **세 가지 입력 모드**
 * - scrub: 라벨 위 pointerdown → 상하 드래그. dy 1px = 세션 step 1단위.
 *   세션 step 은 pointerdown 시점 |value| < 1 이면 10^-precision, 아니면 1.
 *   세션 시작 시점에 한 번 결정되어 0.99 → 1.00 경계에서도 step 이 점프하지 않는다.
 *   Shift = step × 10.
 * - type: 숫자 영역 더블클릭 → text input. Enter/blur commit, ESC revert.
 *   props.precision 미지정 시 입력된 자릿수로 precision 갱신.
 * - keyboard: 라벨 포커스 + ↑/↓ → 즉시 step 만큼 증감. Shift = × 10.
 *
 * **자릿수 정책**
 * - props.precision 명시 > 첫 value 에서 추론. precision=0 이 곧 정수 모드.
 * - 표시는 항상 toFixed(precision) — 0.999 → 1.000 처럼 정수부 도달해도 자릿수 유지.
 * - quantize 도 같은 precision 격자에 맞춰 부동소수 잔존을 제거한다.
 *
 * **단위 영역**
 * - unit 미지정 시 "-" 표시. 정보 자체는 aria 에 포함되지 않고 시각 자리만 유지.
 */
export interface NumberFieldProps {
  label: string;
  value: number;
  /** 표시·증감 단위. 없으면 영역 자리는 유지하고 '-' 폴백. */
  unit?: string;
  /**
   * 명시 시 잠금 — 외부 또는 type 모드 입력으로도 변하지 않는다.
   * 미지정이면 첫 value 에서 추론하고, type 모드 commit 시 입력 자릿수로 갱신.
   */
  precision?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}

function inferPrecision(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const s = String(v);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

function quantizeToPrecision(v: number, precision: number): number {
  const f = Math.pow(10, precision);
  return Math.round(v * f) / f;
}

function clamp(v: number, min?: number, max?: number): number {
  if (min !== undefined && v < min) return min;
  if (max !== undefined && v > max) return max;
  return v;
}

function format(v: number, precision: number): string {
  if (!Number.isFinite(v)) return '·';
  return v.toFixed(precision);
}

const DRAG_THRESHOLD_PX = 3;

export function NumberField({
  label,
  value,
  unit,
  precision: precisionProp,
  min,
  max,
  disabled = false,
  onChange,
}: NumberFieldProps): JSX.Element {
  // 마운트 1회 추론을 의도 — value 가 외부에서 바뀌어도 자릿수는 유지된다.
  // type 모드 commit 시점에서만 setInferredPrecision 으로 갱신.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialInferred = useMemo(() => inferPrecision(value), []);
  const [inferredPrecision, setInferredPrecision] = useState(initialInferred);
  const precision = precisionProp ?? inferredPrecision;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => format(value, precision));
  useEffect(() => {
    if (!editing) setDraft(format(value, precision));
  }, [value, precision, editing]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{
    startY: number;
    startValue: number;
    sessionStep: number;
    pointerId: number;
    dragged: boolean;
  } | null>(null);

  const commit = useCallback(
    (next: number) => {
      const q = quantizeToPrecision(clamp(next, min, max), precision);
      if (q !== value) onChange(q);
    },
    [min, max, precision, value, onChange],
  );

  const onLabelPointerDown = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (disabled || editing) return;
      // 라벨 위 드래그 자체는 텍스트 선택·캔버스 패닝과 경쟁하지 않도록.
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* IE/old browser fallback. capture 실패해도 동작은 한다. */
      }
      dragRef.current = {
        startY: e.clientY,
        startValue: value,
        sessionStep: Math.abs(value) < 1 ? Math.pow(10, -precision) : 1,
        pointerId: e.pointerId,
        dragged: false,
      };
    },
    [disabled, editing, value, precision],
  );

  const onLabelPointerMove = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = d.startY - e.clientY;
      if (!d.dragged && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      if (!d.dragged) {
        d.dragged = true;
        // 빠른 이동으로 포인터가 라벨 영역을 벗어나도 cursor 가 유지되도록.
        document.body.style.cursor = 'ns-resize';
      }
      const stepMul = e.shiftKey ? 10 : 1;
      const next = d.startValue + dy * d.sessionStep * stepMul;
      commit(next);
    },
    [commit],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.dragged) {
      document.body.style.cursor = '';
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* capture 미설정 상태일 수 있음 — 무시 */
    }
  }, []);

  const onLabelKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (disabled) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const sign = e.key === 'ArrowUp' ? 1 : -1;
      const baseStep = Math.abs(value) < 1 ? Math.pow(10, -precision) : 1;
      const stepMul = e.shiftKey ? 10 : 1;
      commit(value + sign * baseStep * stepMul);
    },
    [disabled, value, precision, commit],
  );

  const enterTypeMode = useCallback(() => {
    if (disabled) return;
    setEditing(true);
    setDraft(format(value, precision));
    // input 마운트 직후 포커스 — 같은 tick 에선 ref 가 null 일 수 있음.
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [disabled, value, precision]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.currentTarget.value);
  }, []);

  const onInputBlur = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    const parsed = parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(format(value, precision));
      return;
    }
    if (precisionProp === undefined) {
      const dotIdx = trimmed.indexOf('.');
      const newPrec = dotIdx < 0 ? 0 : trimmed.length - dotIdx - 1;
      setInferredPrecision(newPrec);
      const q = quantizeToPrecision(clamp(parsed, min, max), newPrec);
      if (q !== value) onChange(q);
      setDraft(format(q, newPrec));
    } else {
      const q = quantizeToPrecision(clamp(parsed, min, max), precisionProp);
      if (q !== value) onChange(q);
      setDraft(format(q, precisionProp));
    }
  }, [draft, value, precision, precisionProp, min, max, onChange]);

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setDraft(format(value, precision));
        setEditing(false);
        inputRef.current?.blur();
      }
    },
    [value, precision],
  );

  const unitText = unit ?? '-';
  const displayValue = format(value, precision);

  return (
    <div className={`trama-number-field${disabled ? ' is-disabled' : ''}`}>
      <span
        className="trama-number-field-label"
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={`${displayValue}${unit ? ` ${unit}` : ''}`}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onLabelKeyDown}
      >
        {label}
      </span>
      <div className="trama-number-field-value" onDoubleClick={enterTypeMode}>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            className="trama-number-field-input"
            value={draft}
            onChange={onInputChange}
            onBlur={onInputBlur}
            onKeyDown={onInputKeyDown}
            disabled={disabled}
          />
        ) : (
          <span className="trama-number-field-display">{displayValue}</span>
        )}
      </div>
      <span className="trama-number-field-unit" aria-hidden>
        {unitText}
      </span>
    </div>
  );
}
