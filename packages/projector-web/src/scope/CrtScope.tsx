import { useId, type ReactNode } from "react";

/**
 * 빈티지 CRT 오실로스코프 룩의 SVG 패널. 콘텐츠(파형·게이지 등)는 children 으로
 * 받아 내부 클립 영역에 그린다. 자체 인터랙션은 없으며 전체 wrapper 가
 * pointer-events: none 으로 닫혀 있어 상위 hit-area 가 포인터를 그대로 받는다.
 *
 * 좌표: (cx, cy) 는 부모 좌표계에서의 패널 중심. w/h 는 외곽 사각 크기.
 */
export interface CrtScopeProps {
  cx: number;
  cy: number;
  w: number;
  h: number;
  children?: ReactNode;
}

export function CrtScope({ cx, cy, w, h, children }: CrtScopeProps) {
  const uid = useId();
  const vignetteId = `${uid}-vignette`;
  const scanlineId = `${uid}-scanline`;
  const clipId = `${uid}-clip`;
  const bezelInset = 1;
  const innerX = bezelInset;
  const innerY = bezelInset;
  const innerW = w - bezelInset * 2;
  const innerH = h - bezelInset * 2;
  const cornerR = 6;
  const gridCols = 8;
  const gridRows = 4;
  const colStep = innerW / gridCols;
  const rowStep = innerH / gridRows;
  const gridLines: ReactNode[] = [];
  for (let i = 1; i < gridCols; i++) {
    const x = innerX + colStep * i;
    gridLines.push(
      <line
        key={`v${i}`}
        x1={x}
        y1={innerY}
        x2={x}
        y2={innerY + innerH}
        stroke="rgba(120,255,160,0.08)"
        strokeWidth={0.5}
      />,
    );
  }
  for (let i = 1; i < gridRows; i++) {
    const y = innerY + rowStep * i;
    gridLines.push(
      <line
        key={`h${i}`}
        x1={innerX}
        y1={y}
        x2={innerX + innerW}
        y2={y}
        stroke="rgba(120,255,160,0.08)"
        strokeWidth={0.5}
      />,
    );
  }
  return (
    <g
      transform={`translate(${cx - w / 2}, ${cy - h / 2})`}
      pointerEvents="none"
    >
      <defs>
        <radialGradient id={vignetteId} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0%" stopColor="#0a3e1c" />
          <stop offset="65%" stopColor="#062814" />
          <stop offset="100%" stopColor="#02110a" />
        </radialGradient>
        <pattern
          id={scanlineId}
          width={2}
          height={2}
          patternUnits="userSpaceOnUse"
        >
          <rect width={2} height={1} fill="rgba(0,0,0,0.32)" />
        </pattern>
        <clipPath id={clipId}>
          <rect
            x={innerX}
            y={innerY}
            width={innerW}
            height={innerH}
            rx={cornerR}
          />
        </clipPath>
      </defs>
      <rect width={w} height={h} rx={cornerR + 1} fill="#0a0a0a" />
      <rect
        x={innerX}
        y={innerY}
        width={innerW}
        height={innerH}
        rx={cornerR}
        fill={`url(#${vignetteId})`}
      />
      <g clipPath={`url(#${clipId})`}>
        {gridLines}
        {children}
        <rect
          x={innerX}
          y={innerY}
          width={innerW}
          height={innerH}
          fill={`url(#${scanlineId})`}
        />
      </g>
      <rect
        x={innerX}
        y={innerY}
        width={innerW}
        height={innerH}
        rx={cornerR}
        fill="none"
        stroke="rgba(0,0,0,0.6)"
        strokeWidth={1}
      />
    </g>
  );
}
