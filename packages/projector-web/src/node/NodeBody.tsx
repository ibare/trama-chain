import { memo } from 'react';
import { tokens } from '@trama/tokens';

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

interface Props {
  width: number;
  height: number;
  /** 노드 활성 톤(예: 'is-focal' | 'is-calm' | 'is-low'). */
  stateClass: string;
  isSelected: boolean;
  /** 노드별 추가 modifier 클래스(예: 'trama-function-body'). */
  extraClassName?: string;
}

/**
 * 노드 본문 사각 배경(corner-rounded rect).
 *
 * 모든 카드형 노드(Value·Constant·Conditional·Expression)는 동일한 (width/height,
 * 모서리 반경, state 톤, selected stroke) 계약을 따른다. 인라인 rect로 따로
 * 그리면 클래스 조합 순서나 corner radius 토큰이 노드별로 어긋날 여지가 생기므로
 * 단일 컴포넌트로 강제 — 새로운 노드가 추가되어도 NodeBody만 끼면 시각이 통일된다.
 */
function NodeBodyImpl({
  width,
  height,
  stateClass,
  isSelected,
  extraClassName,
}: Props): JSX.Element {
  const halfW = width / 2;
  const halfH = height / 2;
  const cls = [
    'trama-node-body',
    extraClassName,
    stateClass,
    isSelected ? 'is-selected' : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <rect
      className={cls}
      x={-halfW}
      y={-halfH}
      width={width}
      height={height}
      rx={CARD_CORNER}
      ry={CARD_CORNER}
    />
  );
}

export const NodeBody = memo(NodeBodyImpl);
