import * as Popover from '@radix-ui/react-popover';
import {
  PRIMITIVES,
  SHADES,
  resolveSwatch,
  swatch,
  type SwatchRef,
} from '../../skin/palette.js';

interface Props {
  value: SwatchRef;
  onChange: (next: SwatchRef) => void;
  /** Trigger 옆에 붙는 보조 라벨. 셀 행 안에서 사용. */
  ariaLabel?: string;
}

/**
 * 셀 색 피커 — primitive 행 + shade 행 두 단계.
 *
 * 시안의 "MY {primitive} N shades" 구조를 단순화한 형태:
 *   - 위 행: 9개 primitive를 각자의 500 shade로 표시
 *   - 아래 행: 선택된 primitive의 11 shade
 *
 * 선택은 즉시 commit (onChange) — 별도 "확인" 버튼 없음. Popover는 사용자가
 * 트리거 외부를 클릭하면 자연스럽게 닫힌다.
 */
export function CellColorPicker({ value, onChange, ariaLabel }: Props): JSX.Element {
  const triggerColor = resolveSwatch(value);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="trama-cell-color-trigger"
          aria-label={ariaLabel ?? `색 ${value.primitive} ${value.shade}`}
          style={{ backgroundColor: triggerColor }}
        />
      </Popover.Trigger>
      <Popover.Content
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        className="trama-cell-color-popover"
      >
        <div className="trama-cell-color-row" role="radiogroup" aria-label="색 계열">
          {PRIMITIVES.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={p === value.primitive}
              aria-label={p}
              className={
                'trama-cell-color-swatch' +
                (p === value.primitive ? ' is-selected' : '')
              }
              style={{ backgroundColor: swatch(p, '500') }}
              onClick={() => onChange({ primitive: p, shade: value.shade })}
            />
          ))}
        </div>
        <div className="trama-cell-color-row" role="radiogroup" aria-label="명도 단계">
          {SHADES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === value.shade}
              aria-label={s}
              className={
                'trama-cell-color-swatch' +
                (s === value.shade ? ' is-selected' : '')
              }
              style={{ backgroundColor: swatch(value.primitive, s) }}
              onClick={() => onChange({ primitive: value.primitive, shade: s })}
            />
          ))}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
