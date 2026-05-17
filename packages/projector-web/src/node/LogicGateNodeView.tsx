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
import { resolveDisplayMode } from './display-mode.js';
import { NodeBody } from './NodeBody.js';
import { NodeFrame } from './NodeFrame.js';
import { ModeToggle } from './ModeToggle.js';
import { InteractiveArea } from './InteractiveArea.js';
import { BooleanStateIcon } from './BooleanStateIcon.js';
import { Socket } from './Socket.js';
import { slotColor } from './slot-palette.js';
import { useOutputConnected } from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';

interface Props {
  id: NodeId;
  incomingCount: number;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

// NOT은 단항이라 슬롯 수가 다르고, AND↔NOT 토글로 입력 엣지가 잘려나가는
// 사고를 막기 위해 클릭 순환에서 제외한다. NOT 노드는 메뉴에서 별도 항목으로 추가.
const OPERATORS: LogicGateOperator[] = ['and', 'or', 'xor'];

const OPERATOR_LABEL: Record<LogicGateOperator, string> = {
  and: 'AND',
  or: 'OR',
  xor: 'XOR',
  not: 'NOT',
};

/**
 * LogicGateNode 뷰 — boolean 입력 N개를 operator로 결합해 boolean을 출력한다.
 *
 * compact 구성:
 *   - 타이틀(라벨 슬롯): operator 텍스트(AND/OR/XOR/NOT) — 클릭 시 순환.
 *   - 패널 안: 결과 아이콘(✓/✗)만.  사용자 라벨은 별도로 두지 않는다.
 *     "게이트 종류 = 노드의 이름" 디자인 — 라벨과 operator가 어긋날 여지를
 *     없앤다.
 *
 * 결과 아이콘은 boolean ValueNode와 동일한 [[BooleanStateIcon]] — boolean을
 * 보여주는 모든 노드가 단일 시각 컴포넌트를 공유한다.
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
  const outputConnected = useOutputConnected(id);

  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const layout = useNodeLayout(node, {
    incomingCount,
    displayMode: node ? resolveDisplayMode(node) : undefined,
  });

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

  const currentMode = node ? resolveDisplayMode(node) : 'compact';
  const onToggleMode = useCallback(() => {
    if (uiStore.getState().readOnly) return;
    updateNode(id, {
      displayMode: currentMode === 'compact' ? 'standard' : 'compact',
    });
  }, [currentMode, id, uiStore, updateNode]);

  const onOperatorClick = useCallback(() => {
    if (uiStore.getState().readOnly) return;
    if (!node || !isLogicGateNode(node)) return;
    // NOT은 단항이라 N항 게이트와 슬롯 수가 다르므로 클릭 순환의 일부가 아니다.
    if (node.operator === 'not') return;
    const idx = OPERATORS.indexOf(node.operator);
    const next = OPERATORS[(idx + 1) % OPERATORS.length]!;
    updateNode(id, { operator: next });
  }, [id, node, uiStore, updateNode]);

  if (!node || !isLogicGateNode(node) || !node.position || !layout) return null;

  const isSelected = selection.kind === 'node' && selection.id === id;
  const isActive = outputValid;
  const stateClass = !isActive ? 'is-low' : outputValue ? 'is-focal' : 'is-calm';

  const opLabel = OPERATOR_LABEL[node.operator];
  const resultBoolean = isActive ? !!outputValue : false;

  const { width, height, panelCx, panelCy, panelWidth, panelHeight, labelY } = layout;
  const panelHalfW = panelWidth / 2;
  // 타이틀(라벨 슬롯) = operator 표시 + 클릭 순환.  패널 안 = ✓/✗ 결과만.
  // 라벨 슬롯 hit 영역은 baseline 위·아래로 균등하게 잡아 클릭 표적을 명확히 한다.
  const titleHitH = 24;
  const titleHitY = labelY - titleHitH + 6;

  return (
    <NodeFrame
      id={id}
      pos={node.position}
      width={width}
      height={height}
      panelCx={panelCx}
      panelCy={panelCy}
      panelWidth={panelWidth}
      panelHeight={panelHeight}
      className={`trama-logic-gate-node${isActive ? '' : ' is-invalid'}`}
    >
      <NodeBody
        width={panelWidth}
        height={panelHeight}
        cx={panelCx}
        cy={panelCy}
        stateClass={stateClass}
        isSelected={isSelected}
        extraClassName="trama-function-body"
      />

      <InteractiveArea
        x={panelCx - panelHalfW + 12}
        y={titleHitY}
        width={panelWidth - 24}
        height={titleHitH}
        rx={8}
        ry={8}
        hitClassName="trama-logic-gate-operator-hit"
        onClick={onOperatorClick}
      >
        <text
          className="trama-logic-gate-operator-title"
          x={0}
          y={labelY}
          textAnchor="middle"
        >
          {opLabel}
        </text>
      </InteractiveArea>

      {isActive && (
        <BooleanStateIcon cx={panelCx} cy={panelCy} on={resultBoolean} />
      )}

      <ModeToggle
        panelRight={panelCx + panelHalfW}
        panelTop={panelCy - panelHeight / 2}
        mode={currentMode}
        onToggle={onToggleMode}
      />

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
