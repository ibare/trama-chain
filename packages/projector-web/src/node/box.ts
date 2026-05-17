import { tokens } from '@trama/tokens';
import {
  isConditionNode,
  isExpressionNode,
  isGeneratorNode,
  isObserveNode,
  isValueNode,
  type Node,
} from '@trama/core';

/**
 * 모드별 패널 기준 사이즈 — 노드 *종류*가 아니라 *모드*가 크기를 정한다.
 *
 * - STANDARD_PANEL: 숫자값 노드 기준. 모든 standard 노드(Value/Constant/LogicGate/
 *   Condition/Generator/Observe)가 이 사이즈를 공유한다.
 * - COMPACT_PANEL: 생성기 노드 기준. 모든 compact 노드가 이 패널을 공유한다.
 *
 * 콘텐츠 demand(콤바이너 칩·socket pin overflow)는 이 baseline 위에 *덧붙는*
 * 형태로만 늘어난다. 종류 자체가 폭·높이를 정하지 않는다.
 *
 * 예외: Expression(fizzex 측정값으로 동적), Skin ValueNode(도메인 표현이 크기를
 * 결정) — 두 케이스는 콘텐츠 자체가 사이즈를 정의하는 게 본질이라 통일 대상이
 * 아니다.
 */
export const STANDARD_PANEL = { w: 240, h: 124 };
export const COMPACT_PANEL = { w: 128, h: 56 };

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
  // 극저온 — 캡슐 메타포 그대로, 색만 다른 자매 스킨.
  'thermometer-cryogenic': {
    width: 220,
    height: 244,
    circleR: 110,
    circleCy: 12,
    labelSlotH: 24,
  },
  // 체온계 — LCD 패널 + 가로 색 밴드. 종횡비 살짝 가로형.
  'thermometer-body': {
    width: 220,
    height: 220,
    circleR: 110,
    circleCy: 12,
    labelSlotH: 24,
  },
  // 흑체복사 가마 — 컴팩트 원. 보더 자체가 발광.
  'thermometer-kiln': {
    width: 200,
    height: 220,
    circleR: 96,
    circleCy: 12,
    labelSlotH: 24,
  },
  // 오븐 다이얼 — 회전 게이지. 정사각형 가까운 비율.
  'thermometer-oven': {
    width: 260,
    height: 260,
    circleR: 124,
    circleCy: 12,
    labelSlotH: 24,
  },
};
const COMBINER_ADD_H = 44;
export const NAME_FROM_TOP = 28;
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

/**
 * 노드의 디스플레이 모드. standard는 패널 안에 모든 요소(라벨/값/슬라이더 등)를
 * 담고, compact는 패널을 데이터 디스플레이로 순수화해 외곽 부속(라벨 위, 슬롯
 * 좌우 바깥, 컨트롤 아래)으로 분리한다.
 */
export type NodeDisplayMode = 'standard' | 'compact';

export interface NodeLayout {
  /**
   * 노드 전체 사이즈 — 드래그·충돌·hit 영역의 기준. compact에서는 패널 밖
   * 외곽 부속(라벨/슬롯/컨트롤)까지 모두 포함한다.
   */
  width: number;
  height: number;
  /**
   * 패널(데이터 디스플레이) 본체 사이즈. standard에서는 width/height와 동치.
   * compact에서는 외곽 부속을 제외한 작은 카드 영역.
   */
  panelWidth: number;
  panelHeight: number;
  /**
   * 패널 중심 좌표(노드 중심 기준). standard에서는 (0, 0).
   * compact에서는 라벨 슬롯(위) 만큼 아래로 시프트된다. NodeBody가 패널을 그릴 때
   * 사용하는 단일 기준점 — `(cx-halfW, cy-halfH)` 로 좌상단을 계산한다.
   */
  panelCx: number;
  panelCy: number;
  halfW: number;
  halfH: number;
  /** 좌측 정렬 텍스트의 x 시작점 (라벨·값 공통). */
  textX: number;
  labelY: number;
  /** 라벨 정렬 — standard는 'start'(좌측 정렬), compact는 'middle'(중앙 정렬). */
  labelAnchor: 'start' | 'middle';
  valueY: number;
  /** 입력성 ValueNode의 슬라이더 y 좌표 (노드 카드 안쪽 하단). */
  sliderY: number;
  combinerCenterY: number | null;
  hasCombiner: boolean;
  leftPin: PinLayout;
  rightPin: PinLayout;
  /** 스킨이 적용된 노드의 silhouette outline. NodeFrame이 평소 invisible로 두고
   *  선택 시 stroke를 입혀 시각화한다. 스킨이 없으면 null. */
  skinBorder: SkinBorderShape | null;
  /** 식 노드의 fizzex 캔버스 본문 영역(노드 중심 기준). 측정 전이면 fallback
   *  좌표. ExpressionNode가 아니면 null. */
  expressionBody: { x: number; y: number; w: number; h: number } | null;
  /** Observe 노드의 시각화 본문 영역(노드 중심 기준). ObserveNode가 아니면 null. */
  observeBody: { x: number; y: number; w: number; h: number } | null;
  /** Generator 노드의 컨트롤러(▶/■/↺) 슬롯 영역. GeneratorNode가 아니면 null.
   *  compact에서는 패널 *밖 아래쪽* 외곽 컨트롤 슬롯으로 재배치된다. */
  generatorBody: { x: number; y: number; w: number; h: number } | null;
  /**
   * compact 모드에서 패널 아래쪽에 마련되는 외곽 컨트롤 슬롯 — 토글·버튼이
   * 들어가는 자리. NodeView가 자기 컨트롤을 이 슬롯의 cy에 정렬해 그린다.
   * standard에서는 null. compact라도 컨트롤이 없는 종류(예: logic-gate)면 null.
   */
  outerControlSlot: { cy: number; h: number } | null;
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

/** ObserveNode 본문 — 라벨 슬롯 + 시각화 슬롯 내부 패딩. 폭·높이는 STANDARD_PANEL이 정한다. */
const OBSERVE_LABEL_FROM_TOP = 28;
const OBSERVE_BODY_INSET = 16;
/** compact 패널은 56px라 standard 인셋을 그대로 쓰면 시각화 높이가 0이 된다.
 *  compact 전용으로 인셋을 줄여 실제 그릴 수 있는 슬롯을 확보. */
const OBSERVE_BODY_INSET_COMPACT = 6;

/** GeneratorNode 본문 — 라벨 + 현재값 + 컨트롤러(▶/■/↺) 슬롯 내부 패딩. 폭·높이는 STANDARD_PANEL이 정한다. */
const GENERATOR_BODY_INSET = 16;
const GENERATOR_CONTROLS_H = 26;
const GENERATOR_CONTROLS_BOTTOM_PAD = 10;
const GENERATOR_VALUE_FROM_TOP = 62;

/** 식 노드 폭 견적용 — 변수 라벨 평균 글자 폭(px). 정확한 측정은 과함. */
const EXPR_VAR_CHAR_W = 8;
/** 식 노드 좌측 변수 라벨 영역과 본문 사이 갭. */
const EXPR_VAR_GUTTER_PAD = 12;
/** 식 본문(canvas) 최소 폭 — 빈 식이나 단일 변수도 라벨 슬롯이 들어가야 함. */
const EXPR_MIN_BODY_W = 168;
/** 식 본문 최소 높이. */
const EXPR_MIN_BODY_H = 56;
/** 식 노드 좌·우 안쪽 패딩 (소켓과 본문 사이 여백). */
const EXPR_LEFT_INSET = 18;
const EXPR_RIGHT_INSET = 24;
/** 라벨 슬롯 — 노드 라벨이 그려지는 상단 띠. */
const EXPR_LABEL_SLOT_H = 36;
/** 식 본문 아래 여백. */
const EXPR_BOTTOM_PADDING = 16;

/**
 * compact 모드 외곽 사양 — 라벨 슬롯(위) + 패널 + 컨트롤 슬롯(아래) 스택.
 * 각 종류별로 panel 사이즈와 컨트롤 슬롯 유무만 다르고, 외곽 패딩은 공통.
 */
const COMPACT_LABEL_OUTER_H = 24;
const COMPACT_LABEL_BASELINE_FROM_TOP = 18;
const COMPACT_PANEL_LABEL_GAP = 4;
const COMPACT_CONTROLS_OUTER_H = 36;
const COMPACT_PANEL_CONTROLS_GAP = 4;
const COMPACT_SOCKET_SIDE_INSET = 18;

/**
 * compact 모드 종류별 행동 차이 — 패널 사이즈는 COMPACT_PANEL로 통일이라
 * 변동 요소는 외곽 컨트롤 슬롯 유무뿐이다.
 *
 * - true: 토글·슬라이더 등 사용자 컨트롤이 패널 밖 아래쪽 외곽 슬롯에 들어감.
 *   ValueNode(boolean/numeric)·GeneratorNode가 해당.
 * - false: 컨트롤이 없는 종류. ConstantNode(편집은 더블클릭 인라인)·LogicGate
 *   (operator는 라벨 자리, 결과 아이콘만 표시).
 */
interface CompactOpts {
  hasOuterControls: boolean;
  /** 우측 출력 슬롯 수. 미지정이면 1. ConditionNode 만 2 (true·false 게이트). */
  outSockets?: number;
}

/**
 * compact 모드의 공통 layout 계산. 라벨 슬롯(위) + 패널(COMPACT_PANEL 고정) +
 * (옵션) 컨트롤 슬롯(아래)을 세로로 쌓고, 좌·우 socket은 총 박스 외곽에 패널
 * cy로 정렬한다.
 */
function buildCompactLayout(
  node: Node,
  opts: { incomingCount: number },
  compactOpts: CompactOpts,
): NodeLayout {
  const incomingCount = Math.max(0, opts.incomingCount);
  // 입력 슬롯 수 — constant는 입력 없음, boolean ValueNode·condition·observe·
  // generator는 단일 입력, logic-gate는 N항(NOT만 1).
  const isConstant = node.kind === 'constant';
  const isLogicGate = node.kind === 'logic-gate';
  const isUnaryLogicGate = isLogicGate && node.operator === 'not';
  const inSockets = isConstant
    ? 0
    : isLogicGate
      ? isUnaryLogicGate
        ? 1
        : Math.max(1, incomingCount)
      : 1;

  const labelBlockH = COMPACT_LABEL_OUTER_H + COMPACT_PANEL_LABEL_GAP;
  const controlsBlockH = compactOpts.hasOuterControls
    ? COMPACT_PANEL_CONTROLS_GAP + COMPACT_CONTROLS_OUTER_H
    : 0;

  // compact 의 핵심 약속: panel 사이즈는 COMPACT_PANEL 로 *고정* — 종류·socket
  // 수에 의존하지 않는다. socket pin stack 은 panel 과 무관하게 자체 크기로 자라서
  // panel cy 기준으로 위·아래로 흘러나간다. 흘러나간 만큼만 노드 총 박스가 늘어난다.
  const panelW = COMPACT_PANEL.w;
  const panelH = COMPACT_PANEL.h;
  const outSockets = Math.max(1, compactOpts.outSockets ?? 1);
  const inMinH =
    PIN_PAD * 2 + inSockets * SOCKET_SIZE + Math.max(0, inSockets - 1) * PIN_SOCKET_GAP;
  const outMinH =
    PIN_PAD * 2 + outSockets * SOCKET_SIZE + Math.max(0, outSockets - 1) * PIN_SOCKET_GAP;
  const pinDemandH = Math.max(PIN_W, inMinH, outMinH);
  const socketOverflow = Math.max(0, (pinDemandH - panelH) / 2);

  const totalH = labelBlockH + panelH + controlsBlockH + socketOverflow * 2;
  // socket center 는 panel 좌·우 edge 바깥쪽 INSET 만큼 떨어져 위치 —
  // compact 의 "슬롯은 패널 바깥" 약속. 노드 박스(드래그 hit) 는 socket 까지 포함.
  const totalW = panelW + COMPACT_SOCKET_SIDE_INSET * 2;

  const halfW = totalW / 2;
  const halfH = totalH / 2;
  const topY = -halfH;

  const panelCy = topY + socketOverflow + labelBlockH + panelH / 2;
  const labelY = topY + socketOverflow + COMPACT_LABEL_BASELINE_FROM_TOP;
  const outerControlSlot = compactOpts.hasOuterControls
    ? {
        cy:
          panelCy +
          panelH / 2 +
          COMPACT_PANEL_CONTROLS_GAP +
          COMPACT_CONTROLS_OUTER_H / 2,
        h: COMPACT_CONTROLS_OUTER_H,
      }
    : null;

  const leftPin = buildPin(-halfW, panelCy, inSockets);
  const rightPin = buildPin(halfW, panelCy, outSockets);

  // generator의 ▶/↺ 버튼은 기존 generatorBody 슬롯을 그대로 쓰는 형태로 작성되어
  // 있으므로, compact에서도 generatorBody에 outer 컨트롤 슬롯 좌표를 채워 호환.
  const generatorBody =
    node.kind === 'generator' && outerControlSlot
      ? {
          x: -panelW / 2,
          y: outerControlSlot.cy - COMPACT_CONTROLS_OUTER_H / 2,
          w: panelW,
          h: COMPACT_CONTROLS_OUTER_H,
        }
      : null;

  // numeric ValueNode compact — 외곽 컨트롤 슬롯을 슬라이더와 combiner 칩이 공유한다.
  // lag=0 입력 2개 이상이면 슬라이더가 의미 잃고 combiner 칩으로 자리 교체.
  const isNumericValueNode =
    node.kind === 'value' && node.initialValue.kind === 'numeric';
  const hasCombiner = isNumericValueNode && incomingCount > 1;
  const sliderY = outerControlSlot && isNumericValueNode ? outerControlSlot.cy : halfH;
  const combinerCenterY = hasCombiner && outerControlSlot ? outerControlSlot.cy : null;

  // observe compact — 패널 안쪽 패딩만 두고 panel 전체를 시각화 슬롯으로 쓴다.
  // standard에서 라벨이 차지했던 상단 공간이 외곽으로 빠졌으므로 시각화가 패널을
  // 통째로 점유 가능. 인셋은 compact 전용 작은 값을 써서 56px 패널 안에 실효 높이를 확보.
  const observeBody =
    node.kind === 'observe'
      ? {
          x: -panelW / 2 + OBSERVE_BODY_INSET_COMPACT,
          y: panelCy - panelH / 2 + OBSERVE_BODY_INSET_COMPACT,
          w: panelW - OBSERVE_BODY_INSET_COMPACT * 2,
          h: panelH - OBSERVE_BODY_INSET_COMPACT * 2,
        }
      : null;

  return {
    width: totalW,
    height: totalH,
    panelWidth: panelW,
    panelHeight: panelH,
    panelCx: 0,
    panelCy,
    halfW,
    halfH,
    textX: 0,
    labelY,
    labelAnchor: 'middle',
    valueY: panelCy,
    sliderY,
    combinerCenterY,
    hasCombiner,
    leftPin,
    rightPin,
    skinBorder: null,
    expressionBody: null,
    observeBody,
    generatorBody,
    outerControlSlot,
  };
}

/**
 * 노드 카드의 모든 절대 좌표(노드 중심 기준)를 반환한다.
 * 카드 폭은 고정, 높이는 (1) combiner 칩 유무 (2) 좌측 핀 소켓 수에 따라 자동 확장.
 *
 * ExpressionNode는 fizzex가 측정한 size(opts.expressionSize)에 따라 폭·높이가
 * 동적 결정된다. 측정 전이면 기본값으로 fallback.
 */
export function getNodeLayout(
  node: Node,
  opts: {
    incomingCount: number;
    expressionSize?: { width: number; height: number };
    displayMode?: NodeDisplayMode;
  },
): NodeLayout {
  // compact 모드 — 외곽 부속(라벨 위 / 슬롯 좌우 / 컨트롤 아래)으로 분리.
  // 스킨이 적용된 ValueNode는 별도 분기에서 처리되므로 여기 도달하지 않는다.
  if (opts.displayMode === 'compact') {
    if (isValueNode(node) && !node.skin && node.initialValue.kind === 'boolean') {
      return buildCompactLayout(node, opts, { hasOuterControls: true });
    }
    if (isValueNode(node) && !node.skin && node.initialValue.kind === 'numeric') {
      return buildCompactLayout(node, opts, { hasOuterControls: true });
    }
    if (isGeneratorNode(node)) {
      return buildCompactLayout(node, opts, { hasOuterControls: true });
    }
    if (node.kind === 'logic-gate') {
      return buildCompactLayout(node, opts, { hasOuterControls: false });
    }
    if (node.kind === 'constant') {
      return buildCompactLayout(node, opts, { hasOuterControls: false });
    }
    if (isConditionNode(node)) {
      // Condition 은 true/false 두 출력 슬롯 — compact 에서도 두 소켓을 노출.
      return buildCompactLayout(node, opts, { hasOuterControls: false, outSockets: 2 });
    }
    if (isObserveNode(node)) {
      return buildCompactLayout(node, opts, { hasOuterControls: false });
    }
    // 위 외의 kind는 compact 사양이 정의되지 않았으므로 standard fallback.
  }
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
        panelWidth: spec.width,
        panelHeight: spec.height,
        panelCx: 0,
        panelCy: 0,
        halfW,
        halfH,
        textX: 0,
        labelY: 0,
        labelAnchor: 'start',
        valueY: 0,
        sliderY: halfH,
        combinerCenterY: null,
        hasCombiner: false,
        leftPin,
        rightPin,
        skinBorder: { cx: 0, cy: spec.circleCy, r: spec.circleR },
        expressionBody: null,
        observeBody: null,
        generatorBody: null,
        outerControlSlot: null,
      };
    }
  }

  // ExpressionNode — fizzex 측정 폭·높이에 따라 노드 bbox 동적 결정.
  // 변수 슬롯이 좌측 거터를 차지하고, 본문(canvas)은 거터 우측에서 시작한다.
  if (isExpressionNode(node)) {
    const measured = opts.expressionSize;
    const fizW = measured ? Math.ceil(measured.width) : STANDARD_PANEL.w - 60;
    const fizH = measured ? Math.ceil(measured.height) : 60;

    const variables = node.variables;
    const inSockets = Math.max(1, variables.length);
    const varGutterW =
      variables.length > 0
        ? Math.max(...variables.map((v) => v.length * EXPR_VAR_CHAR_W)) +
          EXPR_VAR_GUTTER_PAD
        : 0;

    const bodyW = Math.max(EXPR_MIN_BODY_W, fizW);
    const width =
      EXPR_LEFT_INSET + varGutterW + bodyW + EXPR_RIGHT_INSET;

    const bodyH = Math.max(EXPR_MIN_BODY_H, fizH);
    const baseH = EXPR_LABEL_SLOT_H + bodyH + EXPR_BOTTOM_PADDING;

    const inMinH =
      PIN_PAD * 2 + inSockets * SOCKET_SIZE + Math.max(0, inSockets - 1) * PIN_SOCKET_GAP;
    const pinDemand = Math.max(PIN_W, inMinH) + 12;
    const height = Math.max(baseH, pinDemand);

    const halfW = width / 2;
    const halfH = height / 2;
    const cardTop = -halfH;
    const labelY = cardTop + NAME_FROM_TOP;
    const bodyX = -halfW + EXPR_LEFT_INSET + varGutterW;
    const bodyY = cardTop + EXPR_LABEL_SLOT_H;

    const leftPin = buildPin(-halfW, 0, inSockets);
    const rightPin = buildPin(halfW, 0, 1);

    return {
      width,
      height,
      panelWidth: width,
      panelHeight: height,
      panelCx: 0,
      panelCy: 0,
      halfW,
      halfH,
      textX: -halfW + EXPR_LEFT_INSET,
      labelY,
      labelAnchor: 'start',
      valueY: bodyY,
      sliderY: halfH,
      combinerCenterY: null,
      hasCombiner: false,
      leftPin,
      rightPin,
      skinBorder: null,
      expressionBody: { x: bodyX, y: bodyY, w: bodyW, h: bodyH },
      observeBody: null,
      generatorBody: null,
      outerControlSlot: null,
    };
  }

  // ConditionNode standard — 1입력/1출력 게이트. 좌·우 중앙 단일 소켓.
  // 패널 크기는 STANDARD_PANEL 그대로, 라벨은 상단 정렬(다른 standard 노드와 동일).
  if (isConditionNode(node)) {
    const halfW = STANDARD_PANEL.w / 2;
    const halfH = STANDARD_PANEL.h / 2;
    const cardTop = -halfH;
    const leftPin = buildPin(-halfW, 0, 1);
    // 우측 두 출력 슬롯 — slot 0: true 분기, slot 1: false 분기.
    const rightPin = buildPin(halfW, 0, 2);
    return {
      width: STANDARD_PANEL.w,
      height: STANDARD_PANEL.h,
      panelWidth: STANDARD_PANEL.w,
      panelHeight: STANDARD_PANEL.h,
      panelCx: 0,
      panelCy: 0,
      halfW,
      halfH,
      textX: -halfW + SIDE_INSET,
      labelY: cardTop + NAME_FROM_TOP,
      labelAnchor: 'start',
      valueY: 0,
      sliderY: halfH,
      combinerCenterY: null,
      hasCombiner: false,
      leftPin,
      rightPin,
      skinBorder: null,
      expressionBody: null,
      observeBody: null,
      generatorBody: null,
      outerControlSlot: null,
    };
  }

  // ObserveNode — 본문은 시각화 슬롯. 단일 입력/단일 출력 핀.
  if (isObserveNode(node)) {
    const halfW = STANDARD_PANEL.w / 2;
    const halfH = STANDARD_PANEL.h / 2;
    const cardTop = -halfH;
    const bodyX = -halfW + OBSERVE_BODY_INSET;
    const bodyY = cardTop + OBSERVE_LABEL_FROM_TOP + 8;
    const bodyW = STANDARD_PANEL.w - OBSERVE_BODY_INSET * 2;
    const bodyH = STANDARD_PANEL.h - OBSERVE_LABEL_FROM_TOP - 8 - 12;
    const leftPin = buildPin(-halfW, 0, 1);
    const rightPin = buildPin(halfW, 0, 1);
    return {
      width: STANDARD_PANEL.w,
      height: STANDARD_PANEL.h,
      panelWidth: STANDARD_PANEL.w,
      panelHeight: STANDARD_PANEL.h,
      panelCx: 0,
      panelCy: 0,
      halfW,
      halfH,
      textX: -halfW + SIDE_INSET,
      labelY: cardTop + OBSERVE_LABEL_FROM_TOP,
      labelAnchor: 'start',
      valueY: 0,
      sliderY: halfH,
      combinerCenterY: null,
      hasCombiner: false,
      leftPin,
      rightPin,
      skinBorder: null,
      expressionBody: null,
      observeBody: { x: bodyX, y: bodyY, w: bodyW, h: bodyH },
      generatorBody: null,
      outerControlSlot: null,
    };
  }

  // GeneratorNode — 단일 boolean 입력(emit gate), 단일 출력. 본문에 라벨 + 현재값 + 컨트롤러 슬롯.
  if (isGeneratorNode(node)) {
    const halfW = STANDARD_PANEL.w / 2;
    const halfH = STANDARD_PANEL.h / 2;
    const cardTop = -halfH;
    // 좌측 핀 — boolean gate 입력 단항. incomingCount와 무관하게 1로 고정.
    const leftPin = buildPin(-halfW, 0, 1);
    const rightPin = buildPin(halfW, 0, 1);
    const controlsBottom = halfH - GENERATOR_CONTROLS_BOTTOM_PAD;
    const controlsTop = controlsBottom - GENERATOR_CONTROLS_H;
    return {
      width: STANDARD_PANEL.w,
      height: STANDARD_PANEL.h,
      panelWidth: STANDARD_PANEL.w,
      panelHeight: STANDARD_PANEL.h,
      panelCx: 0,
      panelCy: 0,
      halfW,
      halfH,
      textX: -halfW + GENERATOR_BODY_INSET,
      labelY: cardTop + NAME_FROM_TOP,
      labelAnchor: 'start',
      valueY: cardTop + GENERATOR_VALUE_FROM_TOP,
      sliderY: halfH,
      combinerCenterY: null,
      hasCombiner: false,
      leftPin,
      rightPin,
      skinBorder: null,
      expressionBody: null,
      observeBody: null,
      generatorBody: {
        x: -halfW + GENERATOR_BODY_INSET,
        y: controlsTop,
        w: STANDARD_PANEL.w - GENERATOR_BODY_INSET * 2,
        h: GENERATOR_CONTROLS_H,
      },
      outerControlSlot: null,
    };
  }

  const incomingCount = Math.max(0, opts.incomingCount);
  // 모든 standard 노드(Value/Constant/LogicGate)는 STANDARD_PANEL 사이즈를
  // 공유한다 (Condition/Observe/Generator는 각자 위 분기에서 처리). combiner 칩
  // 유무·소켓 pin overflow 만 baseline 위에 *덧붙는* 형태로 높이를 늘린다 —
  // 종류 자체가 폭·높이를 정하지 않는다.
  const isLogicGate = node.kind === 'logic-gate';
  // NOT 게이트는 단항 — 입력 슬롯이 항상 1로 고정.
  const isUnaryLogicGate = isLogicGate && node.operator === 'not';
  const hasCombiner = !isLogicGate && incomingCount > 1;
  const baseH = hasCombiner ? STANDARD_PANEL.h + COMBINER_ADD_H : STANDARD_PANEL.h;

  const inSockets = isUnaryLogicGate ? 1 : Math.max(1, incomingCount);
  const inMinH = PIN_PAD * 2 + inSockets * SOCKET_SIZE + Math.max(0, inSockets - 1) * PIN_SOCKET_GAP;
  const pinDemand = Math.max(PIN_W, inMinH) + 12;
  const height = Math.max(baseH, pinDemand);

  const halfW = STANDARD_PANEL.w / 2;
  const halfH = height / 2;
  const cardTop = -halfH;

  const labelY = cardTop + NAME_FROM_TOP;
  const valueY = cardTop + VALUE_FROM_TOP;
  const combinerCenterY = hasCombiner ? cardTop + COMBINER_CENTER_FROM_TOP : null;
  const sliderY = halfH - TRACK_FROM_BOTTOM;

  const leftPin = buildPin(-halfW, 0, inSockets);
  const rightPin = buildPin(halfW, 0, 1);

  return {
    width: STANDARD_PANEL.w,
    height,
    panelWidth: STANDARD_PANEL.w,
    panelHeight: height,
    panelCx: 0,
    panelCy: 0,
    halfW,
    halfH,
    textX: -halfW + SIDE_INSET,
    labelY,
    labelAnchor: 'start',
    valueY,
    sliderY,
    combinerCenterY,
    hasCombiner,
    leftPin,
    rightPin,
    skinBorder: null,
    expressionBody: null,
    observeBody: null,
    generatorBody: null,
    outerControlSlot: null,
  };
}
