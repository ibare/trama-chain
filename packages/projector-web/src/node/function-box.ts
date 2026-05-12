import { tokens } from '@trama/tokens';

const CARD_W = 144;
const BASE_H = 96;
const SYMBOL_FROM_TOP = 44;
const LABEL_FROM_TOP = 78;
const SIDE_INSET = 14;

const PIN_W = parseFloat(tokens.spacing.pinMinSize);
const PIN_PAD = parseFloat(tokens.spacing.pinPadding);
const PIN_SOCKET_GAP = parseFloat(tokens.spacing.pinSocketGap);
const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

export interface FunctionSocketPoint {
  x: number;
  y: number;
  slotIndex: number;
}

export interface FunctionPinLayout {
  rectX: number;
  rectY: number;
  width: number;
  height: number;
  sockets: FunctionSocketPoint[];
}

export interface FunctionNodeLayout {
  width: number;
  height: number;
  halfW: number;
  halfH: number;
  symbolY: number;
  labelY: number;
  inset: number;
  leftPin: FunctionPinLayout;
  rightPin: FunctionPinLayout;
}

/**
 * FunctionNode 카드 레이아웃. arity 슬롯 수에 따라 세로 높이가 늘어난다.
 * 좌측 핀에는 슬롯 인덱스 0..arity-1 순으로 소켓을 위→아래 배치.
 * 우측 핀에는 출력 소켓 1개.
 */
export function getFunctionNodeLayout(arity: number): FunctionNodeLayout {
  const nIn = Math.max(1, arity);
  const inMinH =
    PIN_PAD * 2 + nIn * SOCKET_SIZE + Math.max(0, nIn - 1) * PIN_SOCKET_GAP;
  const pinDemand = Math.max(PIN_W, inMinH) + 12;
  const height = Math.max(BASE_H, pinDemand);

  const halfW = CARD_W / 2;
  const halfH = height / 2;
  const cardTop = -halfH;

  const symbolY = cardTop + SYMBOL_FROM_TOP;
  const labelY = cardTop + LABEL_FROM_TOP;

  const leftCx = -halfW;
  const rightCx = halfW;

  const inSocketsTop =
    -((nIn * SOCKET_SIZE + (nIn - 1) * PIN_SOCKET_GAP) / 2) + SOCKET_SIZE / 2;
  const inSockets: FunctionSocketPoint[] = [];
  for (let i = 0; i < arity; i++) {
    inSockets.push({
      x: leftCx,
      y: inSocketsTop + i * (SOCKET_SIZE + PIN_SOCKET_GAP),
      slotIndex: i,
    });
  }

  const inPinH = Math.max(PIN_W, inMinH);
  const leftPin: FunctionPinLayout = {
    rectX: leftCx - PIN_W / 2,
    rectY: -inPinH / 2,
    width: PIN_W,
    height: inPinH,
    sockets: inSockets,
  };

  const rightPin: FunctionPinLayout = {
    rectX: rightCx - PIN_W / 2,
    rectY: -PIN_W / 2,
    width: PIN_W,
    height: PIN_W,
    sockets: [{ x: rightCx, y: 0, slotIndex: -1 }],
  };

  return {
    width: CARD_W,
    height,
    halfW,
    halfH,
    symbolY,
    labelY,
    inset: SIDE_INSET,
    leftPin,
    rightPin,
  };
}
