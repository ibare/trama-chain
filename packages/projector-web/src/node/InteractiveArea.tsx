import { type MouseEvent, type ReactNode } from 'react';

interface Props {
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
  ry?: number;
  /** hit rect 자체 className 추가. (예: `'trama-conditional-operator-hit'`로 hover 효과 입히기) */
  hitClassName?: string;
  /** 클릭 동작. hit rect의 onClick으로 부착. */
  onClick?: (e: MouseEvent<SVGRectElement>) => void;
  /** 더블클릭 동작. */
  onDoubleClick?: (e: MouseEvent<SVGRectElement>) => void;
  /** 시각 자식. 자동으로 `pointer-events:none` 그룹에 싸여 hit를 통과시킨다. */
  children?: ReactNode;
}

/**
 * 노드 위에 얹는 인터랙티브 클릭 영역.
 *
 * NodeFrame이 drag rect를 z-order 가장 아래에 깔아 두므로, 그 위에 놓이는 이
 * 컴포넌트의 transparent hit `<rect>`가 클릭을 잡고, 같은 `<g>` 형제인 drag rect의
 * `onPointerDown`은 호출되지 않는다 (SVG hit-test는 topmost 요소에만 발화).
 *
 * 자식(visual)은 자동으로 `pointer-events:none`이라 사용자가 별도 클래스/속성 없이
 * 텍스트·도형을 안전하게 얹을 수 있다.
 *
 * 사용 예 — Conditional 노드의 연산자 토글:
 * ```tsx
 * <InteractiveArea x={-56} y={-22} width={112} height={44} rx={6} ry={6}
 *   hitClassName="trama-conditional-operator-hit"
 *   onClick={cycleOperator}>
 *   <text className="trama-function-symbol" x={0} y={4} textAnchor="middle">
 *     {`A ${node.operator} B`}
 *   </text>
 * </InteractiveArea>
 * ```
 */
export function InteractiveArea({
  x,
  y,
  width,
  height,
  rx,
  ry,
  hitClassName,
  onClick,
  onDoubleClick,
  children,
}: Props): JSX.Element {
  const cls = `trama-interactive-area${hitClassName ? ` ${hitClassName}` : ''}`;
  return (
    <g>
      <rect
        className={cls}
        x={x}
        y={y}
        width={width}
        height={height}
        rx={rx}
        ry={ry}
        fill="transparent"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
      {children !== undefined && <g pointerEvents="none">{children}</g>}
    </g>
  );
}
