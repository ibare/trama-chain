import { tokens } from '@trama/tokens';
import { normalize, type Node } from '@trama/core';

const CARD_MIN_W = parseFloat(tokens.spacing.cardMinWidth);
const CARD_MAX_W = parseFloat(tokens.spacing.cardMaxWidth);
const CARD_MIN_H = parseFloat(tokens.spacing.cardMinHeight);
const CARD_MAX_H = parseFloat(tokens.spacing.cardMaxHeight);

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 정규화 값에 따라 카드 box 크기를 보간. EdgeView가 노드 경계 계산에 동일 함수 사용. */
export function getNodeBox(
  node: Node,
  currentValue: number,
): { width: number; height: number } {
  const norm = normalize(currentValue, node.unit);
  return {
    width: lerp(CARD_MIN_W, CARD_MAX_W, norm),
    height: lerp(CARD_MIN_H, CARD_MAX_H, norm),
  };
}
