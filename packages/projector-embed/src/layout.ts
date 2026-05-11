import { tokens } from '@trama/tokens';

const CARD_W = 184;
const BASE_H = 82;
const COMBINER_ADD_H = 44;
const NAME_FROM_TOP = 24;
const DIVIDER_FROM_TOP = 36;
const VALUE_FROM_TOP = 62;
const COMBINER_CENTER_FROM_TOP = 96;
const SIDE_INSET = 16;

const PIN_W = parseFloat(tokens.spacing.pinMinSize);
const PIN_PAD = parseFloat(tokens.spacing.pinPadding);
const PIN_SOCKET_GAP = parseFloat(tokens.spacing.pinSocketGap);
const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

export interface SocketPoint {
  x: number;
  y: number;
}

export interface PinLayout {
  cx: number;
  cy: number;
  rectX: number;
  rectY: number;
  width: number;
  height: number;
  sockets: SocketPoint[];
}

export interface NodeLayout {
  width: number;
  height: number;
  halfW: number;
  halfH: number;
  labelY: number;
  divider: { x1: number; x2: number; y: number };
  valueY: number;
  combinerCenterY: number | null;
  hasCombiner: boolean;
  leftPin: PinLayout;
  rightPin: PinLayout;
}

function buildPin(cx: number, cy: number, nSockets: number): PinLayout {
  const minH = PIN_PAD * 2 + nSockets * SOCKET_SIZE + Math.max(0, nSockets - 1) * PIN_SOCKET_GAP;
  const height = Math.max(PIN_W, minH);
  const top = cy - height / 2;
  const sockets: SocketPoint[] = [];
  for (let i = 0; i < nSockets; i++) {
    sockets.push({
      x: cx,
      y: top + PIN_PAD + SOCKET_SIZE / 2 + i * (SOCKET_SIZE + PIN_SOCKET_GAP),
    });
  }
  return {
    cx,
    cy,
    rectX: cx - PIN_W / 2,
    rectY: top,
    width: PIN_W,
    height,
    sockets,
  };
}

export function getNodeLayout(opts: { incomingCount: number }): NodeLayout {
  const incomingCount = Math.max(0, opts.incomingCount);
  const hasCombiner = incomingCount > 1;
  const baseH = hasCombiner ? BASE_H + COMBINER_ADD_H : BASE_H;

  const inSockets = Math.max(1, incomingCount);
  const inMinH = PIN_PAD * 2 + inSockets * SOCKET_SIZE + Math.max(0, inSockets - 1) * PIN_SOCKET_GAP;
  const pinDemand = Math.max(PIN_W, inMinH) + 12;
  const height = Math.max(baseH, pinDemand);

  const halfW = CARD_W / 2;
  const halfH = height / 2;
  const cardTop = -halfH;

  return {
    width: CARD_W,
    height,
    halfW,
    halfH,
    labelY: cardTop + NAME_FROM_TOP,
    divider: { x1: -halfW + SIDE_INSET, x2: halfW - SIDE_INSET, y: cardTop + DIVIDER_FROM_TOP },
    valueY: cardTop + VALUE_FROM_TOP,
    combinerCenterY: hasCombiner ? cardTop + COMBINER_CENTER_FROM_TOP : null,
    hasCombiner,
    leftPin: buildPin(-halfW, 0, inSockets),
    rightPin: buildPin(halfW, 0, 1),
  };
}
