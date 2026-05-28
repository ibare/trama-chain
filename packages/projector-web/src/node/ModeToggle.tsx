import { useCallback, type MouseEvent } from 'react';
import { InteractiveArea } from './InteractiveArea.js';
import { PhosphorGlyph } from '../icon/phosphor.js';
import type { NodeDisplayMode } from '@trama-chain/layout';

interface Props {
  /** panel 우상단 코너 좌표 (NodeFrame 로컬 좌표). 토글은 이 점에서 안쪽으로 padding만큼 들어가 배치된다. */
  panelRight: number;
  panelTop: number;
  mode: NodeDisplayMode;
  onToggle: () => void;
}

const SIZE = 18;
const PAD = 4;
const GLYPH_SIZE = SIZE - 4;

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
      <PhosphorGlyph
        name={mode === 'compact' ? 'dice-six' : 'dice-one'}
        cx={x + SIZE / 2}
        cy={y + SIZE / 2}
        size={GLYPH_SIZE}
        className="trama-mode-toggle-glyph"
      />
    </InteractiveArea>
  );
}
