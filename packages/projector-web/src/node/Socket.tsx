import { tokens } from '@trama/tokens';

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const SOCKET_DOT_SIZE = parseFloat(tokens.spacing.socketDotSize);

interface Props {
  cx: number;
  cy: number;
  connected: boolean;
  /** 멀티슬롯 노드의 슬롯 식별색. null/미지정이면 기본 socketRing 색. */
  color?: string | null;
}

/**
 * 통합 소켓 비주얼. 타입·역할(in/out)과 무관하게 동일한 외형으로,
 * 오직 연결 여부만 점(dot) 유무로 표현한다.
 *
 * - 항상 외곽 링이 그려진다.
 * - connected일 때만 안쪽 점이 채워진다.
 * - hit 영역은 호출자가 별도로 둔다(역할마다 핸들러가 다르므로).
 */
export function Socket({ cx, cy, connected, color }: Props): JSX.Element {
  const ringStyle = color ? { stroke: color } : undefined;
  const dotStyle = color ? { fill: color } : undefined;
  return (
    <g pointerEvents="none">
      <circle
        className="trama-node-socket-ring"
        cx={cx}
        cy={cy}
        r={SOCKET_SIZE / 2}
        style={ringStyle}
      />
      {connected && (
        <circle
          className="trama-node-socket-dot"
          cx={cx}
          cy={cy}
          r={SOCKET_DOT_SIZE / 2}
          style={dotStyle}
        />
      )}
    </g>
  );
}
