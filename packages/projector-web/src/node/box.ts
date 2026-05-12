import { tokens } from '@trama/tokens';
import type { Node } from '@trama/core';

const CARD_W = 240;
const BASE_H = 124;
const COMBINER_ADD_H = 44;
const NAME_FROM_TOP = 28;
const VALUE_FROM_TOP = 78;
const COMBINER_CENTER_FROM_TOP = 156;
const TRACK_FROM_BOTTOM = 24;
const SIDE_INSET = 18;

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
  /** 좌측 정렬 텍스트의 x 시작점 (라벨·값 공통). */
  textX: number;
  labelY: number;
  valueY: number;
  /** 입력성 ValueNode의 슬라이더 트랙 y 좌표 (노드 안쪽 하단). */
  trackY: number;
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

/**
 * 노드 카드의 모든 절대 좌표(노드 중심 기준)를 반환한다.
 * 카드 폭은 고정, 높이는 (1) combiner 칩 유무 (2) 좌측 핀 소켓 수에 따라 자동 확장.
 */
export function getNodeLayout(
  _node: Node,
  opts: { incomingCount: number },
): NodeLayout {
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

  const labelY = cardTop + NAME_FROM_TOP;
  const valueY = cardTop + VALUE_FROM_TOP;
  const combinerCenterY = hasCombiner ? cardTop + COMBINER_CENTER_FROM_TOP : null;
  const trackY = halfH - TRACK_FROM_BOTTOM;

  const leftPin = buildPin(-halfW, 0, inSockets);
  const rightPin = buildPin(halfW, 0, 1);

  return {
    width: CARD_W,
    height,
    halfW,
    halfH,
    textX: -halfW + SIDE_INSET,
    labelY,
    valueY,
    trackY,
    combinerCenterY,
    hasCombiner,
    leftPin,
    rightPin,
  };
}
