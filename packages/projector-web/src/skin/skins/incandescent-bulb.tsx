import { useId } from 'react';
import { InteractiveArea } from '../../node/InteractiveArea.js';
import type { BooleanSkinRenderProps } from '../types.js';

/**
 * 백열전구 스킨 — boolean 도메인 첫 스킨.
 *
 * 전류가 흐르면 필라멘트가 달궈진다는 물리 메타포. 토글이 "스위치"를 표현한다면,
 * 전구는 "스위치가 켜졌을 때 발생하는 효과 — 빛"을 표현한다. boolean ValueNode 의
 * 출력이 다운스트림에서 켜고 끄는 회로의 의미를 가질 때 시각적 짝이 된다.
 *
 * 레이아웃 (200×220, box.ts SKIN_LAYOUTS['incandescent-bulb'] 와 일치):
 *   - 상단 24px       : 라벨 슬롯 (InteractiveArea 로 인스펙터 진입)
 *   - 원형 보더 안    : 구체(유리) + 필라멘트 + 베이스(스크류)
 *   - 인터랙션        : 전구 본체 클릭으로 ON↔OFF 토글
 *
 * ON 시: 구체 안 노란-주황 그라데이션 + 외부 radial glow, 필라멘트 백색.
 * OFF 시: 차가운 반투명 유리, 필라멘트 어두운 회색, glow 없음.
 */
export function IncandescentBulb({
  on,
  halfW,
  halfH,
  onToggle,
  disabled,
  onLabelClick,
}: BooleanSkinRenderProps): JSX.Element {
  const uid = useId().replace(/[:#]/g, '');

  const labelSlotH = 24;
  const labelHitW = Math.min(halfW * 1.6, 140);

  // 원 보더 중심·반경 (box.ts 와 일치). 시각 요소는 이 원 안에 self-define.
  const cy = 12;
  const r = Math.min(halfW, halfH - labelSlotH / 2) - 6;

  // 전구 형상 — 구체(상단) + 목(중간) + 스크류 베이스(하단).
  // 원 보더 안에 정확히 들어가도록 r 기준으로 비례 잡는다.
  const bulbR = r * 0.62;
  const bulbCy = cy - r * 0.18;
  const neckTop = bulbCy + bulbR * 0.82;
  const neckW = bulbR * 0.74;
  const baseTop = neckTop + r * 0.14;
  const baseW = bulbR * 0.66;
  const baseH = r * 0.34;
  const baseBottom = baseTop + baseH;

  // 필라멘트 — 구체 중심에 코일 모양 path (지그재그 5칸).
  const filamentY = bulbCy + bulbR * 0.05;
  const filamentW = bulbR * 0.62;
  const filamentH = bulbR * 0.5;
  const filamentX0 = -filamentW / 2;
  const filamentTop = filamentY - filamentH / 2;
  const filamentBottom = filamentY + filamentH / 2;
  const peaks = 5;
  let filamentD = `M ${filamentX0} ${filamentBottom}`;
  for (let i = 0; i < peaks; i++) {
    const xPeak = filamentX0 + ((i + 0.5) / peaks) * filamentW;
    const xNext = filamentX0 + ((i + 1) / peaks) * filamentW;
    filamentD += ` L ${xPeak} ${filamentTop} L ${xNext} ${filamentBottom}`;
  }

  // ON/OFF 팔레트 — 인라인 색 (다른 스킨과 동일 패턴).
  const glassFillOn = `url(#${uid}-glass-on)`;
  const glassFillOff = `url(#${uid}-glass-off)`;
  const filamentStrokeOn = '#fff4c2';
  const filamentStrokeOff = '#6a6f78';
  const filamentGlow = on ? `url(#${uid}-filament-glow)` : 'none';
  const externalGlowR = bulbR * 1.55;

  return (
    <>
      <defs>
        {/* 외부 radial glow — ON 시 전구 주변이 노랗게 번진다. */}
        <radialGradient id={`${uid}-aura`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd964" stopOpacity={0.55} />
          <stop offset="45%" stopColor="#ffba2a" stopOpacity={0.18} />
          <stop offset="100%" stopColor="#ffba2a" stopOpacity={0} />
        </radialGradient>
        {/* ON 유리 — 따뜻한 노란 그라데이션 (위쪽이 더 밝음). */}
        <radialGradient
          id={`${uid}-glass-on`}
          cx="50%"
          cy="40%"
          r="55%"
        >
          <stop offset="0%" stopColor="#fff3a8" />
          <stop offset="55%" stopColor="#ffd755" />
          <stop offset="100%" stopColor="#f6a522" />
        </radialGradient>
        {/* OFF 유리 — 차가운 회색-청 유리 (반투명). */}
        <radialGradient
          id={`${uid}-glass-off`}
          cx="50%"
          cy="40%"
          r="55%"
        >
          <stop offset="0%" stopColor="#f1f4f8" stopOpacity={0.85} />
          <stop offset="60%" stopColor="#c9d1dc" stopOpacity={0.7} />
          <stop offset="100%" stopColor="#9ba6b5" stopOpacity={0.55} />
        </radialGradient>
        {/* 필라멘트 자체의 micro-glow. */}
        <filter id={`${uid}-filament-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="blurred" />
          <feMerge>
            <feMergeNode in="blurred" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 라벨 슬롯 — 인스펙터 진입점 (라벨 텍스트는 NodeLabel 이 별도 렌더). */}
      <InteractiveArea
        x={-labelHitW / 2}
        y={-halfH}
        width={labelHitW}
        height={labelSlotH}
        hitClassName="trama-skin-bulb-name-hit"
        onClick={() => {
          if (onLabelClick) onLabelClick();
        }}
      />

      {/* 본체 visuals — pointer-events:none, drag/click hit 는 아래 InteractiveArea 가 받는다. */}
      <g pointerEvents="none">
        {/* 외부 aura — ON 일 때만 표시. */}
        {on && (
          <circle
            cx={0}
            cy={bulbCy}
            r={externalGlowR}
            fill={`url(#${uid}-aura)`}
          />
        )}

        {/* 베이스(스크류) */}
        <rect
          x={-baseW / 2}
          y={baseTop}
          width={baseW}
          height={baseH}
          rx={baseW * 0.12}
          ry={baseW * 0.12}
          fill="#7a7e88"
          stroke="#4d505a"
          strokeWidth={1}
        />
        {/* 베이스 위 나사산 라인 3개 */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={-baseW / 2 + 2}
            x2={baseW / 2 - 2}
            y1={baseTop + baseH * t}
            y2={baseTop + baseH * t}
            stroke="#4d505a"
            strokeWidth={0.8}
          />
        ))}
        {/* 베이스 끝 (전기 접점) */}
        <ellipse
          cx={0}
          cy={baseBottom + 2}
          rx={baseW * 0.22}
          ry={baseW * 0.12}
          fill="#3a3d45"
        />

        {/* 목(neck) — 베이스와 구체 연결 사다리꼴 */}
        <path
          d={`M ${-neckW / 2} ${neckTop} L ${neckW / 2} ${neckTop} L ${baseW / 2} ${baseTop} L ${-baseW / 2} ${baseTop} Z`}
          fill="#b1b6c1"
          stroke="#7d8290"
          strokeWidth={0.8}
        />

        {/* 유리 구체 */}
        <circle
          cx={0}
          cy={bulbCy}
          r={bulbR}
          fill={on ? glassFillOn : glassFillOff}
          stroke={on ? '#d99318' : '#7d8290'}
          strokeWidth={1.2}
        />

        {/* 구체 하이라이트 — 좌상단 sheen */}
        <ellipse
          cx={-bulbR * 0.35}
          cy={bulbCy - bulbR * 0.4}
          rx={bulbR * 0.22}
          ry={bulbR * 0.34}
          fill="#ffffff"
          opacity={on ? 0.45 : 0.32}
        />

        {/* 필라멘트 지지선 (얇은 수직 2개) */}
        <line
          x1={-filamentW * 0.18}
          x2={-filamentW * 0.18}
          y1={filamentBottom}
          y2={neckTop - bulbR * 0.05}
          stroke={on ? '#a87216' : '#5a5e67'}
          strokeWidth={0.8}
        />
        <line
          x1={filamentW * 0.18}
          x2={filamentW * 0.18}
          y1={filamentBottom}
          y2={neckTop - bulbR * 0.05}
          stroke={on ? '#a87216' : '#5a5e67'}
          strokeWidth={0.8}
        />

        {/* 필라멘트 코일 */}
        <path
          d={filamentD}
          fill="none"
          stroke={on ? filamentStrokeOn : filamentStrokeOff}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={filamentGlow}
        />
      </g>

      {/* 본체 hit — 전구 클릭으로 토글. disabled (외부 입력 연결) 면 비활성. */}
      <InteractiveArea
        x={-bulbR}
        y={bulbCy - bulbR}
        width={bulbR * 2}
        height={bulbR * 2 + (baseBottom - (bulbCy + bulbR))}
        hitClassName="trama-skin-bulb-hit"
        onClick={() => {
          if (disabled) return;
          if (onToggle) onToggle();
        }}
      />
    </>
  );
}
