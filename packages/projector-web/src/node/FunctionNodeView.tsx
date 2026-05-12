import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import { isFunctionNode, isNodeValid, type NodeId } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { functionRegistry } from '../store/registries.js';
import { layoutForFunctionDef } from './function-box.js';
import { NodeFrame } from './NodeFrame.js';
import { Socket } from './Socket.js';
import { useInputConnectionMask, useOutputConnected } from './use-socket-connections.js';
import { registerInputSocket } from '../canvas/socket-registry.js';
import { completeEdgeDraft } from '../canvas/edge-draft-actions.js';

interface Props {
  id: NodeId;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

function FunctionNodeViewImpl({ id }: Props): JSX.Element | null {
  const node = useModelStore((s) => s.model.nodes[id]);
  const isValid = useModelStore((s) => isNodeValid(s.executionState, id));
  const selection = useUIStore((s) => s.selection);
  const startEdgeDraft = useUIStore((s) => s.startEdgeDraft);
  const inputMask = useInputConnectionMask(id);
  const outputConnected = useOutputConnected(id);

  const pos = node?.position ?? { x: 200, y: 200 };
  const functionKey = node && isFunctionNode(node) ? node.functionKey : null;

  // 입력 슬롯 등록 — snap 후보.
  useEffect(() => {
    if (functionKey === null) return;
    const def = functionRegistry.get(functionKey);
    if (!def) return;
    const layout = layoutForFunctionDef(def);
    const unregs = layout.inputSockets.map((s) =>
      registerInputSocket({
        nodeId: id,
        slotIndex: s.slotIndex,
        offset: { x: s.x, y: s.y },
      }),
    );
    return () => unregs.forEach((u) => u());
  }, [id, functionKey]);

  const onSocketPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (!node || !isFunctionNode(node) || !isValid) return;
      const def = functionRegistry.get(node.functionKey);
      if (!def) return;
      const layout = layoutForFunctionDef(def);
      (e.target as Element).setPointerCapture(e.pointerId);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      const startPoint = {
        x: pos.x + layout.outputSocket.x,
        y: pos.y + layout.outputSocket.y,
      };
      startEdgeDraft({ fromNodeId: id, startPoint, pointer: startPoint, lag });
    },
    [id, isValid, node, pos.x, pos.y, startEdgeDraft],
  );

  const onSocketPointerUp = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    completeEdgeDraft({ dropScreen: { x: e.clientX, y: e.clientY } });
  }, []);

  if (!node || !isFunctionNode(node)) return null;
  const def = functionRegistry.get(node.functionKey);
  if (!def) return null;

  const layout = layoutForFunctionDef(def);
  const { halfW, halfH, width, height, symbolY, labelY } = layout;
  const isSelected = selection.kind === 'node' && selection.id === id;
  const stateClass = isValid ? 'is-calm' : 'is-low';

  return (
    <NodeFrame
      id={id}
      pos={pos}
      width={width}
      height={height}
      className={`trama-function-node${isValid ? '' : ' is-invalid'}`}
    >
      <rect
        className={`trama-node-body trama-function-body ${stateClass}${isSelected ? ' is-selected' : ''}`}
        x={-halfW}
        y={-halfH}
        width={width}
        height={height}
        rx={CARD_CORNER}
        ry={CARD_CORNER}
      />
      <text className="trama-function-symbol" x={0} y={symbolY} textAnchor="middle">
        {def.symbol}
      </text>
      <text className="trama-function-label" x={0} y={labelY} textAnchor="middle">
        {node.label || def.labels.ko}
      </text>

      {/* 입력 슬롯 — 슬롯별 개별 핀. anchor 위치로 분산되므로 슬롯마다 작은 핀.
          각 슬롯에 hit 영역을 둬서 엣지 드롭 시 정확한 슬롯을 식별. */}
      {layout.inputSockets.map((s) => (
        <g key={`in${s.slotIndex}`}>
          <Socket cx={s.x} cy={s.y} connected={(inputMask & (1 << s.slotIndex)) !== 0} />
          <circle
            className="trama-node-socket-hit"
            data-trama-slot-index={s.slotIndex}
            cx={s.x}
            cy={s.y}
            r={Math.max(SOCKET_SIZE, 12)}
          />
        </g>
      ))}

      {/* 출력 소켓 — valid일 때만 보임 */}
      {isValid && (
        <>
          <Socket
            cx={layout.outputSocket.x}
            cy={layout.outputSocket.y}
            connected={outputConnected}
          />
          <circle
            className="trama-node-socket-hit"
            cx={layout.outputSocket.x}
            cy={layout.outputSocket.y}
            r={Math.max(SOCKET_SIZE, 12)}
            onPointerDown={onSocketPointerDown}
            onPointerUp={onSocketPointerUp}
          />
        </>
      )}
    </NodeFrame>
  );
}

export const FunctionNodeView = memo(FunctionNodeViewImpl);

