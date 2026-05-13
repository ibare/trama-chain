import * as Popover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';

/**
 * radix-popover 기반 떠 있는 패널 공통 셸.
 *
 * - anchor(화면 좌표)에 0×0 invisible div를 두고 radix가 floating-ui로 자동 배치.
 * - outside-click·escape·focus·collision flip은 radix가 담당.
 * - anchor가 바뀌면 `key`로 Anchor만 remount해 floating-ui가 reference 갱신.
 *   캔버스 pan/zoom으로 인스펙터 anchor가 매 프레임 바뀌어도 패널 본체와 자식
 *   상태(Tabs·ToggleGroup·input)는 유지된다.
 * - Portal은 생략 — Content는 `position: fixed`라 [data-trama-root]의 overflow
 *   clipping에 잘리지 않으면서 CSS 변수(`--color-*` 등)는 그대로 상속한다.
 */

export type TramaPopoverPlacement =
  | { kind: 'side'; gap?: { x: number; y: number } }
  | { kind: 'below-center'; offsetY?: number };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: { x: number; y: number };
  placement: TramaPopoverPlacement;
  className?: string;
  children: ReactNode;
}

export function TramaPopover({
  open,
  onOpenChange,
  anchor,
  placement,
  className,
  children,
}: Props): JSX.Element {
  const isSide = placement.kind === 'side';
  const side: 'right' | 'bottom' = isSide ? 'right' : 'bottom';
  const align: 'start' | 'center' = isSide ? 'start' : 'center';
  const sideOffset = isSide ? placement.gap?.x ?? 14 : placement.offsetY ?? 12;
  const alignOffset = isSide ? placement.gap?.y ?? 0 : 0;

  const anchorKey = `${Math.round(anchor.x)},${Math.round(anchor.y)}`;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor
        key={anchorKey}
        style={{
          position: 'fixed',
          left: anchor.x,
          top: anchor.y,
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}
      />
      <Popover.Content
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={8}
        className={`trama-popover${className ? ` ${className}` : ''}`}
      >
        {children}
      </Popover.Content>
    </Popover.Root>
  );
}
