import { InteractiveArea } from '../../node/InteractiveArea.js';
import type { BooleanSkinRenderProps } from '../types.js';

/**
 * 오디오 잭 스킨 — boolean 도메인 두 번째 스킨.
 *
 * 1/4-inch TRS 잭의 *꽂힘/빠짐* 을 boolean ON/OFF 에 매핑. ON 에선 plug 가
 * 본체 좌측 변에 박혀 있고, OFF 에선 plug 가 본체 아래로 떨어진다. 케이블
 * 지삭(plug 반대편) 은 항상 본체 좌측 input slot 위치 `(-circleR, circleCy)`
 * 에 정착해 트라마 엣지로 자연스럽게 이어진다 — OFF 시엔 dropped plug 까지
 * 곡선으로 늘어진 케이블이 시각적 인과의 자취 역할.
 *
 * ON  : plug 본체 좌측 변에 박힘
 * OFF : socket hole 노출 + plug 가 본체 아래에 떨어짐 + 케이블 곡선
 */
export function AudioJack({
  on,
  halfW,
  halfH,
  onToggle,
  disabled,
  onLabelClick,
}: BooleanSkinRenderProps): JSX.Element {
  const labelSlotH = 24;
  const labelHitW = Math.min(halfW * 1.6, 160);

  // 본체 사각형 — bbox 상반. 우측 변은 노드 우측 앵커(circleR=100) 에 정렬,
  // 좌측 변은 input slot(-100) 에서 우측으로 떨어뜨려 케이블이 시각적으로
  // 드러나도록 한다. bodyCy = -30 (box.ts circleCy 와 일치).
  const bodyW = 100;
  const bodyH = 98;
  const bodyCy = -30;
  const bodyRight = 100;
  const bodyLeft = bodyRight - bodyW;
  const bodyTop = bodyCy - bodyH / 2;

  // input slot 앵커 — leftPin.cx = -circleR = -100. 본체 좌측 변과 떨어져 있다.
  const slotX = -100;
  const slotY = bodyCy;

  // plug 치수
  const plugGripW = 22;
  const plugGripH = 18;
  const plugTipW = 14;
  const plugTipH = 6;

  // OFF dropped plug 위치 — 본체 아래.
  const offPlugLeft = -110;
  const offPlugTop = 72;
  const offPlugW = 30;
  const offPlugH = plugGripH;
  const offPlugTipLeft = offPlugLeft + offPlugW;
  const offPlugTipTop = offPlugTop + (offPlugH - plugTipH) / 2;

  return (
    <>
      {/* 라벨 슬롯 hit — 인스펙터 진입점. */}
      <InteractiveArea
        x={-labelHitW / 2}
        y={-halfH}
        width={labelHitW}
        height={labelSlotH}
        hitClassName="trama-skin-jack-name-hit"
        onClick={() => {
          if (onLabelClick) onLabelClick();
        }}
      />

      {/* 본체 visuals — pointer-events:none 격리. 인터랙션은 아래 InteractiveArea. */}
      <g pointerEvents="none">
        {/* 본체 사각형 */}
        <rect
          x={bodyLeft}
          y={bodyTop}
          width={bodyW}
          height={bodyH}
          rx={14}
          ry={14}
          fill="#fafaf6"
          stroke="#6b4a2c"
          strokeWidth={2}
        />

        {on ? (
          <>
            {/* ON 케이블 — input slot 에서 plug grip 좌측까지 직선. */}
            <line
              x1={slotX}
              y1={slotY}
              x2={bodyLeft - plugGripW}
              y2={slotY}
              stroke="#4a2e1a"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            {/* ON — plug grip 이 본체 좌측 변에 박힘. tip(꼬다리) 은 본체
                안으로 완전히 들어가 보이지 않는다. */}
            <rect
              x={bodyLeft - plugGripW}
              y={slotY - plugGripH / 2}
              width={plugGripW}
              height={plugGripH}
              rx={3}
              ry={3}
              fill="#8b5a35"
              stroke="#4a2e1a"
              strokeWidth={1}
            />
            {[0.3, 0.5, 0.7].map((t) => (
              <line
                key={t}
                x1={bodyLeft - plugGripW + plugGripW * t}
                x2={bodyLeft - plugGripW + plugGripW * t}
                y1={slotY - plugGripH / 2 + 2}
                y2={slotY + plugGripH / 2 - 2}
                stroke="#4a2e1a"
                strokeWidth={0.6}
                opacity={0.6}
              />
            ))}
          </>
        ) : (
          <>
            {/* OFF — socket hole (본체 좌측 변 안쪽). */}
            <circle
              cx={bodyLeft + 8}
              cy={slotY}
              r={5}
              fill="#1a1109"
              stroke="#3a2818"
              strokeWidth={0.8}
            />
            <circle cx={bodyLeft + 8} cy={slotY} r={2} fill="#000000" />

            {/* OFF cable — input slot(-100,-30) → dropped plug 좌측까지의 곡선. */}
            <path
              d={`M ${slotX} ${slotY} C ${slotX - 4} ${slotY + 50} ${offPlugLeft - 6} ${offPlugTop - 24} ${offPlugLeft} ${offPlugTop + offPlugH / 2}`}
              fill="none"
              stroke="#4a2e1a"
              strokeWidth={2.5}
              strokeLinecap="round"
            />

            {/* OFF dropped plug — silver tip + brown grip. */}
            <rect
              x={offPlugTipLeft}
              y={offPlugTipTop}
              width={plugTipW}
              height={plugTipH}
              fill="#cfcfcf"
              stroke="#7a7a7a"
              strokeWidth={0.5}
            />
            <rect
              x={offPlugLeft}
              y={offPlugTop}
              width={offPlugW}
              height={offPlugH}
              rx={3}
              ry={3}
              fill="#8b5a35"
              stroke="#4a2e1a"
              strokeWidth={1}
            />
            {[0.3, 0.5, 0.7].map((t) => (
              <line
                key={t}
                x1={offPlugLeft + offPlugW * t}
                x2={offPlugLeft + offPlugW * t}
                y1={offPlugTop + 2}
                y2={offPlugTop + offPlugH - 2}
                stroke="#4a2e1a"
                strokeWidth={0.6}
                opacity={0.6}
              />
            ))}
          </>
        )}
      </g>

      {/* 본체 hit — 클릭으로 토글. */}
      <InteractiveArea
        x={bodyLeft}
        y={bodyTop}
        width={bodyW}
        height={bodyH}
        hitClassName="trama-skin-jack-hit"
        onClick={() => {
          if (disabled) return;
          if (onToggle) onToggle();
        }}
      />
    </>
  );
}
