import { useCallback, type MouseEvent } from 'react';
import { InteractiveArea } from './InteractiveArea.js';
import type { NodeDisplayMode } from './box.js';

interface Props {
  /** panel 우상단 코너 좌표 (NodeFrame 로컬 좌표). 토글은 이 점에서 안쪽으로 padding만큼 들어가 배치된다. */
  panelRight: number;
  panelTop: number;
  mode: NodeDisplayMode;
  onToggle: () => void;
}

const SIZE = 18;
const PAD = 4;

export function ModeToggle({ panelRight, panelTop, mode, onToggle }: Props): JSX.Element {
  const x = panelRight - PAD - SIZE;
  const y = panelTop + PAD;
  const onClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onToggle();
    },
    [onToggle],
  );
  return (
    <InteractiveArea
      x={x}
      y={y}
      width={SIZE}
      height={SIZE}
      rx={3}
      ry={3}
      hitClassName="trama-mode-toggle"
      onClick={onClick}
    >
      {mode === 'compact' ? (
        <ExpandGlyph x={x + 2} y={y + 2} size={SIZE - 4} />
      ) : (
        <CollapseGlyph x={x + 2} y={y + 2} size={SIZE - 4} />
      )}
    </InteractiveArea>
  );
}

interface GlyphProps {
  x: number;
  y: number;
  size: number;
}

function ExpandGlyph({ x, y, size }: GlyphProps): JSX.Element {
  const s = size;
  const t = Math.round(s * 0.35);
  const d = [
    `M ${x} ${y + t} L ${x} ${y} L ${x + t} ${y}`,
    `M ${x + s - t} ${y} L ${x + s} ${y} L ${x + s} ${y + t}`,
    `M ${x + s} ${y + s - t} L ${x + s} ${y + s} L ${x + s - t} ${y + s}`,
    `M ${x + t} ${y + s} L ${x} ${y + s} L ${x} ${y + s - t}`,
  ].join(' ');
  return <path className="trama-mode-toggle-glyph" d={d} />;
}

function CollapseGlyph({ x, y, size }: GlyphProps): JSX.Element {
  const s = size;
  const t = Math.round(s * 0.35);
  const d = [
    `M ${x} ${y + t} L ${x + t} ${y + t} L ${x + t} ${y}`,
    `M ${x + s - t} ${y} L ${x + s - t} ${y + t} L ${x + s} ${y + t}`,
    `M ${x + s} ${y + s - t} L ${x + s - t} ${y + s - t} L ${x + s - t} ${y + s}`,
    `M ${x + t} ${y + s} L ${x + t} ${y + s - t} L ${x} ${y + s - t}`,
  ].join(' ');
  return <path className="trama-mode-toggle-glyph" d={d} />;
}
