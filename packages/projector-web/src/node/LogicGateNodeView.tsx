import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import {
  isLogicGateNode,
  isOutputValid,
  type LogicGateOperator,
  type NodeId,
} from '@trama/core';
import { useTrama } from '../store/index.js';
import { useNodeLayout } from './use-node-layout.js';
import { NodeBody } from './NodeBody.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeLabel } from './NodeLabel.js';
import { InteractiveArea } from './InteractiveArea.js';
import { Socket } from './Socket.js';
import { slotColor } from './slot-palette.js';
import { useOutputConnected } from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';

interface Props {
  id: NodeId;
  incomingCount: number;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

const OPERATORS: LogicGateOperator[] = ['and', 'or', 'xor'];

const OPERATOR_GLYPH: Record<LogicGateOperator, string> = {
  and: '⋀',
  or: '⋁',
  xor: '⊕',
};

/**
 * LogicGateNode 뷰 — boolean 입력 N개를 operator로 결합해 boolean을 출력한다.
 *
 * ComparisonNode와 평행한 boolean 출력 노드 — 우측 상단 ⊤/⊥ 마커로 결과를
 * 시각화한다. 입력은 가변(엣지 연결에 따라 동적으로 좌측 핀이 늘어남) — 카드
 * 폭은 일반 ValueNode와 같은 box.ts 경로를 그대로 쓰고 좌측 핀의 N-슬롯 동작이
 * 그대로 적용된다.
 *
 * 본문 중앙의 큰 게이트 심볼(⋀/⋁/⊕)을 클릭하면 operator가 순환한다 —
 * ComparisonNode의 operator cycle과 같은 패턴.
 */
function LogicGateNodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  const { modelStore, uiStore, socketRegistry } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  const outputValid = modelStore((s) => isOutputValid(s.executionState, id, 0));
  const outputValue = modelStore((s) => {
    const v = s.executionState.values[id];
    if (v && v.kind === 'boolean') return v.b;
    return null;
  });
  const updateNode = modelStore((s) => s.updateNode);
  const selection = uiStore((s) => s.selection);
  const editingNode = uiStore((s) => s.editingNode);
  const setEditingNode = uiStore((s) => s.setEditingNode);
  const isEditing = editingNode?.id === id;
  const editTarget = isEditing ? editingNode.target : null;
  const outputConnected = useOutputConnected(id);

  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const layout = useNodeLayout(node, { incomingCount });

  useEffect(() => {
    if (!layout) return;
    return socketRegistry.register({
      nodeId: id,
      offset: { x: layout.leftPin.cx, y: layout.leftPin.cy },
    });
  }, [id, layout, socketRegistry]);

  const getOutputStartPoint = useCallback(() => {
    const out = layout?.rightPin.sockets[0];
    return out ? { x: posX + out.x, y: posY + out.y } : { x: posX, y: posY };
  }, [layout, posX, posY]);
  const { onPointerDown: onSocketPointerDown, onPointerUp: onSocketPointerUp } =
    useEdgeDraftSource(id, {
      enabled: !!layout && outputValid,
      getStartPoint: getOutputStartPoint,
    });

  const onOperatorClick = useCallback(() => {
    if (uiStore.getState().readOnly) return;
    if (!node || !isLogicGateNode(node)) return;
    const idx = OPERATORS.indexOf(node.operator);
    const next = OPERATORS[(idx + 1) % OPERATORS.length]!;
    updateNode(id, { operator: next });
  }, [id, node, uiStore, updateNode]);

  const onLabelDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNode(id, 'label');
    },
    [id, setEditingNode],
  );

  const commitLabel = useCallback(
    (next: string) => {
      if (node && next !== node.label) updateNode(id, { label: next });
      setEditingNode(null);
    },
    [id, node, setEditingNode, updateNode],
  );
  const cancelEdit = useCallback(() => setEditingNode(null), [setEditingNode]);

  if (!node || !isLogicGateNode(node) || !node.position || !layout) return null;

  const isSelected = selection.kind === 'node' && selection.id === id;
  const isActive = outputValid;
  const stateClass = !isActive ? 'is-low' : outputValue ? 'is-focal' : 'is-calm';

  const opGlyph = OPERATOR_GLYPH[node.operator];
  const resultMark = !isActive ? '·' : outputValue ? '⊤' : '⊥';

  const { halfW, halfH, width, height, valueY } = layout;

  return (
    <NodeFrame
      id={id}
      pos={node.position}
      width={width}
      height={height}
      className={`trama-logic-gate-node${isActive ? '' : ' is-invalid'}`}
    >
      <NodeBody
        width={width}
        height={height}
        stateClass={stateClass}
        isSelected={isSelected}
        extraClassName="trama-function-body"
      />

      <NodeLabel
        text={node.label}
        x={layout.textX}
        y={layout.labelY}
        width={width - (layout.textX - -halfW) * 2}
        isEditing={editTarget === 'label'}
        onCommit={commitLabel}
        onCancel={cancelEdit}
        onIsolatedDoubleClick={onLabelDoubleClick}
      />

      <InteractiveArea
        x={-32}
        y={valueY - 28}
        width={64}
        height={52}
        rx={8}
        ry={8}
        hitClassName="trama-condition-operator-hit"
        onClick={onOperatorClick}
      >
        <text
          className="trama-function-symbol"
          x={0}
          y={valueY + 10}
          textAnchor="middle"
        >
          {opGlyph}
        </text>
      </InteractiveArea>

      {/* boolean 출력 마커 — ComparisonNode와 동일 패턴으로 우측 상단에 ⊤/⊥ */}
      <text
        className="trama-comparison-output-mark"
        x={halfW - 12}
        y={-halfH + 16}
        textAnchor="end"
        pointerEvents="none"
      >
        {resultMark}
      </text>

      {layout.leftPin.sockets.map((s, i) => (
        <Socket
          key={`l${i}`}
          cx={s.x}
          cy={s.y}
          connected={i < incomingCount}
          color={slotColor(i, incomingCount)}
        />
      ))}

      <g className={isActive ? '' : 'is-inactive-output'}>
        {layout.rightPin.sockets[0] && (
          <>
            <Socket
              cx={layout.rightPin.sockets[0].x}
              cy={layout.rightPin.sockets[0].y}
              connected={outputConnected}
            />
            <circle
              className="trama-node-socket-hit"
              cx={layout.rightPin.sockets[0].x}
              cy={layout.rightPin.sockets[0].y}
              r={Math.max(SOCKET_SIZE, 12)}
              onPointerDown={onSocketPointerDown}
              onPointerUp={onSocketPointerUp}
            />
          </>
        )}
      </g>
    </NodeFrame>
  );
}

export const LogicGateNodeView = memo(LogicGateNodeViewImpl);
