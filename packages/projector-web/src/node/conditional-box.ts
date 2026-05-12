/**
 * ConditionalNode 카드 레이아웃 — NodeView와 EdgeView 양쪽이 동일한
 * 슬롯 좌표를 보도록 단일 정의.
 */

export const CONDITIONAL_CARD_W = 184;
export const CONDITIONAL_CARD_H = 104;
const SLOT_INSET_Y = 24;

export interface ConditionalSocketLayout {
  /** 0=A(상단), 1=B(하단). 출력은 0=참(상단), 1=거짓(하단). */
  slotIndex: number;
  x: number;
  y: number;
}

export interface ConditionalNodeLayout {
  width: number;
  height: number;
  halfW: number;
  halfH: number;
  inputSockets: ConditionalSocketLayout[];
  outputSockets: ConditionalSocketLayout[];
}

export function getConditionalNodeLayout(): ConditionalNodeLayout {
  const halfW = CONDITIONAL_CARD_W / 2;
  const halfH = CONDITIONAL_CARD_H / 2;
  return {
    width: CONDITIONAL_CARD_W,
    height: CONDITIONAL_CARD_H,
    halfW,
    halfH,
    inputSockets: [
      { slotIndex: 0, x: -halfW, y: -halfH + SLOT_INSET_Y },
      { slotIndex: 1, x: -halfW, y: halfH - SLOT_INSET_Y },
    ],
    outputSockets: [
      { slotIndex: 0, x: halfW, y: -halfH + SLOT_INSET_Y },
      { slotIndex: 1, x: halfW, y: halfH - SLOT_INSET_Y },
    ],
  };
}
