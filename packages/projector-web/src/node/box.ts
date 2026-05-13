import { tokens } from '@trama/tokens';
import { isValueNode, type Node } from '@trama/core';

const CARD_W = 240;
const BASE_H = 124;

/**
 * 스킨별 레이아웃 스펙.
 *
 * 모든 스킨 노드는 **공통 원형 보더**를 silhouette으로 갖는다. 평소 invisible, 선택
 * 시 stroke로 노출되고, 엣지 앵커가 이 원의 좌·우 끝점에 정렬된다. 스킨 visual은
 * 이 원 안에 자유롭게 그려진다 — 캡슐(thermometer), 다이얼(time) 등.
 *
 * - width/height: 노드 사각 bbox (drag-hit·NodeFrame이 잡는 영역).
 *   원 + 상단 라벨 슬롯을 모두 감싸도록 잡힌다.
 * - circleR/circleCy: 공통 원 보더의 반지름과 중심 y (cx는 0 고정).
 *   엣지 앵커 = (±circleR, circleCy).
 * - labelSlotH: 원 *위*의 라벨 슬롯 높이. InteractiveArea로 잡아 단위·스킨
 *   인스펙터 진입점으로 쓴다.
 */
export interface SkinBorderShape {
  cx: number;
  cy: number;
  r: number;
}

interface SkinLayoutSpec {
  width: number;
  height: number;
  circleR: number;
  circleCy: number;
  labelSlotH: number;
}

const SKIN_LAYOUTS: Record<string, SkinLayoutSpec> = {
  // 220×244 = 원(r=110, cy=12) + 상단 라벨 슬롯 24. 캡슐 visual(64×220)은 원 안 정중앙.
  // 엣지 앵커는 원 좌·우 끝(±110, 12).
  'thermometer-mercury': {
    width: 220,
    height: 244,
    circleR: 110,
    circleCy: 12,
    labelSlotH: 24,
  },
};
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
  /** 스킨이 적용된 노드의 silhouette outline. NodeFrame이 평소 invisible로 두고
   *  선택 시 stroke를 입혀 시각화한다. 스킨이 없으면 null. */
  skinBorder: SkinBorderShape | null;
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
  node: Node,
  opts: { incomingCount: number },
): NodeLayout {
  // 스킨이 켜진 ValueNode는 본문이 스킨으로 통째 대체되므로 카드/콤바이너/슬라이더
  // 트랙용 좌표가 필요 없다. 캡슐 크기만큼만 노드 영역을 잡고 좌·우 핀은
  // 캡슐 좌우 중점에 둔다.
  if (isValueNode(node) && node.skin) {
    const spec = SKIN_LAYOUTS[node.skin.kind];
    if (spec) {
      const halfW = spec.width / 2;
      const halfH = spec.height / 2;
      // 스킨 모드는 단일 입력만 허용 (combiner 없음). incomingCount > 1이면
      // 시각이 깨지지만 PoC 범위로 단순화.
      const leftPin = buildPin(-spec.circleR, spec.circleCy, 1);
      const rightPin = buildPin(spec.circleR, spec.circleCy, 1);
      return {
        width: spec.width,
        height: spec.height,
        halfW,
        halfH,
        textX: 0,
        labelY: 0,
        valueY: 0,
        trackY: halfH,
        combinerCenterY: null,
        hasCombiner: false,
        leftPin,
        rightPin,
        skinBorder: { cx: 0, cy: spec.circleCy, r: spec.circleR },
      };
    }
  }

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
    skinBorder: null,
  };
}
