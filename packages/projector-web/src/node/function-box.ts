import { tokens } from '@trama/tokens';
import type { FunctionDefinition, SocketAnchor } from '@trama/core';

const CARD_W = 144;
const CARD_H = 96;
const SYMBOL_FROM_TOP = 44;
const LABEL_FROM_TOP = 78;
const SIDE_INSET = 14;

const PIN_W = parseFloat(tokens.spacing.pinMinSize);

export interface FunctionInputSocketLayout {
  slotIndex: number;
  x: number;
  y: number;
  anchor: SocketAnchor;
}

export interface FunctionPinLayout {
  rectX: number;
  rectY: number;
  width: number;
  height: number;
  /** pin이 어느 변에 매달려 있는지 — 카드 바깥쪽으로 살짝 튀어나오는 방향 결정. */
  side: SocketAnchor['side'];
}

export interface FunctionOutputLayout {
  x: number;
  y: number;
  anchor: SocketAnchor;
}

export interface FunctionNodeLayout {
  width: number;
  height: number;
  halfW: number;
  halfH: number;
  symbolY: number;
  labelY: number;
  inset: number;
  /** 슬롯별 입력 소켓 + 개별 핀 좌표. anchor 위치 그대로. */
  inputSockets: FunctionInputSocketLayout[];
  inputPins: FunctionPinLayout[];
  outputSocket: FunctionOutputLayout;
  outputPin: FunctionPinLayout;
}

/** anchor를 카드 중심 기준 좌표로 변환. side에 따라 변 위 한 점을 t로 보간. */
function resolveAnchor(
  anchor: SocketAnchor,
  halfW: number,
  halfH: number,
): { x: number; y: number } {
  const tt = Math.max(0, Math.min(1, anchor.t));
  switch (anchor.side) {
    case 'left':
      return { x: -halfW, y: -halfH + tt * halfH * 2 };
    case 'right':
      return { x: halfW, y: -halfH + tt * halfH * 2 };
    case 'top':
      return { x: -halfW + tt * halfW * 2, y: -halfH };
    case 'bottom':
      return { x: -halfW + tt * halfW * 2, y: halfH };
  }
}

/** anchor에 닿는 작은 핀(소켓의 표시 베이스)을 카드 변에 걸치도록 사각형 좌표 계산. */
function pinFromAnchor(
  anchor: SocketAnchor,
  point: { x: number; y: number },
): FunctionPinLayout {
  const isHorizontalSide = anchor.side === 'left' || anchor.side === 'right';
  const w = isHorizontalSide ? PIN_W : PIN_W;
  const h = isHorizontalSide ? PIN_W : PIN_W;
  return {
    rectX: point.x - w / 2,
    rectY: point.y - h / 2,
    width: w,
    height: h,
    side: anchor.side,
  };
}

interface SlotLike {
  anchor?: SocketAnchor;
}

interface DefLike {
  slots: readonly SlotLike[];
  outputAnchor?: SocketAnchor;
}

/**
 * FunctionNode 카드 레이아웃.
 *
 * 슬롯별 `anchor`로 소켓을 어느 변·어느 t 위치에 둘지 결정. 비가환 함수는
 * 카드 모서리 쪽으로 흩뜨려 슬롯 의미를 위치로 전달(나눗셈: 분자=TL, 분모=BL).
 * anchor 미지정 슬롯은 좌측 변에 균등 분포(폴백) — 가환 함수에 적합.
 *
 * 카드 크기는 144×96 고정. arity가 많아도 anchor가 변에 분산하므로 별도로 늘리지 않는다.
 */
export function getFunctionNodeLayout(def: DefLike | number): FunctionNodeLayout {
  // 하위 헬퍼/기존 테스트가 arity만 넘기는 케이스도 지원하기 위해 number 입력 허용.
  const slots: readonly SlotLike[] =
    typeof def === 'number'
      ? Array.from({ length: Math.max(1, def) }, () => ({}))
      : def.slots;
  const outputAnchor: SocketAnchor =
    (typeof def === 'number' ? undefined : def.outputAnchor) ??
    { side: 'right', t: 0.5 };

  const halfW = CARD_W / 2;
  const halfH = CARD_H / 2;
  const arity = slots.length;

  const inputSockets: FunctionInputSocketLayout[] = slots.map((s, i) => {
    const anchor: SocketAnchor =
      s.anchor ?? {
        side: 'left',
        t: arity === 1 ? 0.5 : (i + 1) / (arity + 1),
      };
    const p = resolveAnchor(anchor, halfW, halfH);
    return { slotIndex: i, x: p.x, y: p.y, anchor };
  });
  const inputPins: FunctionPinLayout[] = inputSockets.map((s) =>
    pinFromAnchor(s.anchor, { x: s.x, y: s.y }),
  );

  const outP = resolveAnchor(outputAnchor, halfW, halfH);
  const outputSocket: FunctionOutputLayout = {
    x: outP.x,
    y: outP.y,
    anchor: outputAnchor,
  };
  const outputPin = pinFromAnchor(outputAnchor, outP);

  return {
    width: CARD_W,
    height: CARD_H,
    halfW,
    halfH,
    symbolY: -halfH + SYMBOL_FROM_TOP,
    labelY: -halfH + LABEL_FROM_TOP,
    inset: SIDE_INSET,
    inputSockets,
    inputPins,
    outputSocket,
    outputPin,
  };
}

/** 외부 helper: FunctionDefinition을 받아 레이아웃 산출. EdgeView 등이 사용. */
export function layoutForFunctionDef(def: FunctionDefinition): FunctionNodeLayout {
  return getFunctionNodeLayout(def);
}
