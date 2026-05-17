/**
 * ConditionNode 카드 레이아웃 — NodeView와 EdgeView 양쪽이 동일한
 * 슬롯 좌표를 보도록 단일 정의.
 *
 * 1입력/1출력 게이트 시맨틱이라 좌·우 중앙에 소켓 하나씩.
 *
 * 사이즈는 모드 기준 단일 패널(STANDARD_PANEL)을 그대로 사용 — Condition 카드만
 * 별도 크기를 가질 이유가 없으므로 다른 standard 노드와 동일.
 */

import { NAME_FROM_TOP, STANDARD_PANEL } from './box.js';

export const CONDITION_CARD_W = STANDARD_PANEL.w;
export const CONDITION_CARD_H = STANDARD_PANEL.h;

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
  /** 라벨 baseline y — 상단 정렬. 다른 standard 노드와 동일 위치(NAME_FROM_TOP). */
  labelY: number;
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
    labelY: -halfH + NAME_FROM_TOP,
    inputSocket: { slotIndex: 0, x: -halfW, y: 0 },
    outputSocket: { slotIndex: 0, x: halfW, y: 0 },
  };
}
