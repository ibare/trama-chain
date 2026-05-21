import { memo } from 'react';
import { tokens } from '@trama/tokens';
import { useFizzexRenderer } from './use-fizzex-renderer.js';

interface Props {
  latex: string;
  /** 폰트 픽셀 크기. tile-icon 의 시각적 크기와 균형 맞춰 호출처에서 지정. */
  fontSize: number;
  className?: string;
}

/**
 * DOM 영역에 단일 latex 글리프를 fizzex 로 렌더한다.
 *
 * NodePicker 타일·툴팁 같이 식 노드 본문이 아닌 작은 표기 영역에서 사용한다.
 * 식 노드 본문 글리프와 동일한 fizzex 파이프라인을 거치므로 폰트·자간·기호
 * 모양이 본문과 일관된다 — π·\bar x·\wedge 같은 표준 표기를 phosphor 글리프
 * 옆에 두어도 시각적 결이 깨지지 않는다.
 */
function LatexGlyphImpl({ latex, fontSize, className }: Props): JSX.Element {
  const hostRef = useFizzexRenderer(latex, {
    baseFontSize: fontSize,
    color: tokens.color.nodeTextPrimary,
    padding: 0,
    displayMode: 'inline',
  });
  return <div ref={hostRef} className={className} aria-hidden />;
}

export const LatexGlyph = memo(LatexGlyphImpl);
