/**
 * ConditionNode 카드 레이아웃 — NodeView와 EdgeView 양쪽이 동일한
 * 슬롯 좌표를 보도록 단일 정의.
 *
 * 1입력/1출력 게이트 시맨틱이라 좌·우 중앙에 소켓 하나씩.
 */

export const CONDITION_CARD_W = 184;
export const CONDITION_CARD_H = 104;

export interface ConditionSocketLayout {
  /** 단일 슬롯이므로 항상 0. */
  slotIndex: number;
  x: number;
  y: number;
}

export interface ConditionNodeLayout {
  width: number;
  height: number;
  halfW: number;
  halfH: number;
  inputSocket: ConditionSocketLayout;
  outputSocket: ConditionSocketLayout;
}

export function getConditionNodeLayout(): ConditionNodeLayout {
  const halfW = CONDITION_CARD_W / 2;
  const halfH = CONDITION_CARD_H / 2;
  return {
    width: CONDITION_CARD_W,
    height: CONDITION_CARD_H,
    halfW,
    halfH,
    inputSocket: { slotIndex: 0, x: -halfW, y: 0 },
    outputSocket: { slotIndex: 0, x: halfW, y: 0 },
  };
}
