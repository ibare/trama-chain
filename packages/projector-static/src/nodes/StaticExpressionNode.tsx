import { tokens } from '@trama/tokens';
import { isExpressionNode } from '@trama/core';
import type { StaticNodeRendererProps } from '../registry.js';
import { isSlotValid } from '../snapshot.js';
import { PinShape, SocketVisual } from './primitives.js';

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

/**
 * Expression 의 정적 시각. fizzex Canvas 렌더는 정적 출력에서는 생략하고 latex
 * 문자열을 본문 영역(layout.expressionBody)에 텍스트로 그대로 표시. 변수 슬롯
 * N 개 + 변수명 라벨, 우측 출력 1. valid 가 아니면 결과 X 마크.
 */
export function StaticExpressionNode({
  node,
  layout,
  slotIndex,
}: StaticNodeRendererProps): JSX.Element | null {
  if (!isExpressionNode(node)) return null;
  const pos = node.position ?? { x: 0, y: 0 };
  const valid = isSlotValid(slotIndex, node.id);
  const stateClass = valid ? 'is-calm' : 'is-low';

  const body = layout.expressionBody;
  const outSocket = layout.rightPin.sockets[0];

  return (
    <g
      className={`trama-static-node trama-static-expression ${valid ? '' : 'is-invalid'}`}
      transform={`translate(${pos.x} ${pos.y})`}
    >
      <rect
        className={`trama-static-node-body ${stateClass}`}
        x={layout.panelCx - layout.panelWidth / 2}
        y={layout.panelCy - layout.panelHeight / 2}
        width={layout.panelWidth}
        height={layout.panelHeight}
        rx={CARD_CORNER}
        ry={CARD_CORNER}
      />
      <text
        className="trama-static-node-label"
        x={layout.labelAnchor === 'middle' ? layout.panelCx : layout.textX}
        y={layout.labelY}
        textAnchor={layout.labelAnchor}
      >
        {node.label}
      </text>
      {body && (
        <text
          className="trama-static-expression-latex"
          x={body.x + body.w / 2}
          y={body.y + body.h / 2}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {node.latex}
        </text>
      )}
      <PinShape pin={layout.leftPin} stateClass={stateClass} />
      {node.variables.map((name, i) => {
        const s = layout.leftPin.sockets[i];
        if (!s) return null;
        return (
          <g key={`in-${i}`}>
            <SocketVisual cx={s.x} cy={s.y} stateClass={stateClass} />
            <text
              className="trama-static-expression-var"
              x={s.x + 14}
              y={s.y + 4}
              textAnchor="start"
            >
              {name}
            </text>
          </g>
        );
      })}
      <PinShape pin={layout.rightPin} stateClass={stateClass} />
      {outSocket && (
        <>
          <SocketVisual cx={outSocket.x} cy={outSocket.y} stateClass={stateClass} />
          {!valid && (
            <g className="trama-static-socket-invalid-mark" pointerEvents="none">
              <line
                x1={outSocket.x - 4}
                y1={outSocket.y - 4}
                x2={outSocket.x + 4}
                y2={outSocket.y + 4}
              />
              <line
                x1={outSocket.x - 4}
                y1={outSocket.y + 4}
                x2={outSocket.x + 4}
                y2={outSocket.y - 4}
              />
            </g>
          )}
        </>
      )}
    </g>
  );
}
