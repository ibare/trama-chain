import { memo, useCallback, useEffect, useState } from 'react';
import * as Form from '@radix-ui/react-form';
import { tokens } from '@trama/tokens';
import {
  isConditionNode,
  isOutputValid,
  isValueNode,
  type ConditionOperator,
  type NodeId,
} from '@trama/core';
import { useTrama } from '../store/index.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { useNodeLayout } from './use-node-layout.js';
import { resolveDisplayMode } from './display-mode.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeBody } from './NodeBody.js';
import { NodeLabel } from './NodeLabel.js';
import { ModeToggle } from './ModeToggle.js';
import { InlineSvgInput } from './InlineSvgInput.js';
import { InteractiveArea } from './InteractiveArea.js';
import { Socket } from './Socket.js';
import { conditionSourceSlotColor } from './slot-palette.js';
import {
  useInputConnected,
  useOutputConnected,
} from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';

interface Props {
  id: NodeId;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

const OPERATORS: ConditionOperator[] = ['>', '<', '>=', '<=', '==', '!='];

/** 비교 연산자의 시각 기호. 표시용 — 저장값은 ASCII enum 그대로. */
const OPERATOR_GLYPH: Record<ConditionOperator, string> = {
  '>': '>',
  '<': '<',
  '>=': '≥',
  '<=': '≤',
  '==': '=',
  '!=': '≠',
};

function ConditionNodeViewImpl({ id }: Props): JSX.Element | null {
  const { modelStore, uiStore, socketRegistry } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  // 두 슬롯 각각의 valid — true(0)·false(1) 가 상호 배타지만 양쪽 모두 invalid 인
  // 입력 미연결 상태도 있으므로 독립 selector.
  const outputValid0 = modelStore((s) => isOutputValid(s.executionState, id, 0));
  const outputValid1 = modelStore((s) => isOutputValid(s.executionState, id, 1));
  const updateNode = modelStore((s) => s.updateNode);
  const selection = uiStore((s) => s.selection);
  const editingNode = uiStore((s) => s.editingNode);
  const setEditingNode = uiStore((s) => s.setEditingNode);
  const isEditing = editingNode?.id === id;
  const editTarget = isEditing ? editingNode.target : null;
  const inputConnected = useInputConnected(id, 0);
  const outputConnected0 = useOutputConnected(id, 0);
  const outputConnected1 = useOutputConnected(id, 1);

  // 입력 source 노드의 단위를 따라가 임계값에 suffix를 붙인다 (예: '≥ 10 °C').
  // 미연결이면 raw 표시.
  const inputUnitSuffix = modelStore((s) => {
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (!e || e.to !== id || e.slotIndex !== 0) continue;
      const src = s.model.nodes[e.from];
      if (src && isValueNode(src)) {
        return resolveNodeUnit(src).suffix ?? '';
      }
      break;
    }
    return '';
  });

  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const layout = useNodeLayout(node, {
    incomingCount: inputConnected ? 1 : 0,
    displayMode: node ? resolveDisplayMode(node) : undefined,
  });

  useEffect(() => {
    if (!layout) return;
    return socketRegistry.register({
      nodeId: id,
      slotIndex: 0,
      offset: { x: layout.leftPin.cx, y: layout.leftPin.cy },
    });
  }, [id, layout, socketRegistry]);

  const getOutputStartPoint0 = useCallback(() => {
    const out = layout?.rightPin.sockets[0];
    return out
      ? { x: posX + out.x, y: posY + out.y }
      : { x: posX, y: posY };
  }, [layout, posX, posY]);
  const getOutputStartPoint1 = useCallback(() => {
    const out = layout?.rightPin.sockets[1];
    return out
      ? { x: posX + out.x, y: posY + out.y }
      : { x: posX, y: posY };
  }, [layout, posX, posY]);
  const { onPointerDown: onSocketPointerDown0, onPointerUp: onSocketPointerUp0 } =
    useEdgeDraftSource(id, {
      enabled: !!layout,
      getStartPoint: getOutputStartPoint0,
      sourceSlotIndex: 0,
    });
  const { onPointerDown: onSocketPointerDown1, onPointerUp: onSocketPointerUp1 } =
    useEdgeDraftSource(id, {
      enabled: !!layout,
      getStartPoint: getOutputStartPoint1,
      sourceSlotIndex: 1,
    });

  const onOperatorClick = useCallback(() => {
    if (uiStore.getState().readOnly) return;
    if (!node || !isConditionNode(node)) return;
    const idx = OPERATORS.indexOf(node.operator);
    const next = OPERATORS[(idx + 1) % OPERATORS.length]!;
    updateNode(id, { operator: next });
  }, [id, node, uiStore, updateNode]);

  const onThresholdDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNode(id, 'threshold');
    },
    [id, setEditingNode],
  );

  const onLabelDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNode(id, 'label');
    },
    [id, setEditingNode],
  );

  // threshold 인라인 편집: draft 상태 + 커밋 시 파싱.
  const [thresholdDraft, setThresholdDraft] = useState(
    node && isConditionNode(node) ? String(node.threshold) : '0',
  );
  useEffect(() => {
    if (editTarget === 'threshold' && node && isConditionNode(node)) {
      setThresholdDraft(String(node.threshold));
    }
  }, [editTarget, node]);

  const commitThreshold = useCallback(() => {
    if (!node || !isConditionNode(node)) {
      setEditingNode(null);
      return;
    }
    const parsed = parseFloat(thresholdDraft);
    if (Number.isFinite(parsed) && parsed !== node.threshold) {
      updateNode(id, { threshold: parsed });
    }
    setEditingNode(null);
  }, [id, node, setEditingNode, thresholdDraft, updateNode]);

  const commitLabel = useCallback(
    (next: string) => {
      if (node && next !== node.label) updateNode(id, { label: next });
      setEditingNode(null);
    },
    [id, node, setEditingNode, updateNode],
  );
  const cancelEdit = useCallback(() => setEditingNode(null), [setEditingNode]);

  const currentMode = node ? resolveDisplayMode(node) : 'standard';
  const onToggleMode = useCallback(() => {
    if (uiStore.getState().readOnly) return;
    updateNode(id, {
      displayMode: currentMode === 'compact' ? 'standard' : 'compact',
    });
  }, [currentMode, id, uiStore, updateNode]);

  if (!node || !isConditionNode(node) || !node.position || !layout) return null;

  const isSelected = selection.kind === 'node' && selection.id === id;
  // 본문 상태색은 어느 슬롯이든 valid 면 calm — 두 슬롯이 상호 배타라 어차피
  // 둘 중 하나만 valid 다. 슬롯별 흐림 처리는 각 소켓 <g> 의 is-inactive-output.
  const isActive = outputValid0 || outputValid1;
  const stateClass = isActive ? 'is-calm' : 'is-low';

  const opGlyph = OPERATOR_GLYPH[node.operator];
  const thresholdText = formatThreshold(node.threshold);
  const suffix = inputUnitSuffix ? ` ${inputUnitSuffix}` : '';

  const {
    width,
    height,
    panelCx,
    panelCy,
    panelWidth,
    panelHeight,
    labelY,
    labelAnchor,
  } = layout;
  const panelHalfW = panelWidth / 2;
  const isCompact = currentMode === 'compact';
  // compact: 패널 안쪽에 op+threshold만, 폰트 축소. standard: 기존 중앙 정렬 표시.
  const opX = isCompact ? panelCx - 14 : -56 + 18 /* 글리프 중앙 보정 */;
  const thresholdX = isCompact ? panelCx + 6 : 4;
  const thresholdInputW = isCompact ? Math.min(60, panelWidth - 30) : 70;

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
      className={`trama-condition-node${isActive ? '' : ' is-invalid'}`}
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

      {/* operator 글리프 — 클릭 시 6종 순환. compact는 패널 중앙 좌측, standard는 본문 좌측. */}
      <InteractiveArea
        x={isCompact ? panelCx - 28 : -56}
        y={panelCy - 14}
        width={isCompact ? 28 : 36}
        height={isCompact ? 28 : 44}
        rx={6}
        ry={6}
        hitClassName="trama-condition-operator-hit"
        onClick={onOperatorClick}
      >
        <text
          className={`trama-function-symbol${isCompact ? ' is-compact' : ''}`}
          x={opX}
          y={panelCy}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {opGlyph}
        </text>
      </InteractiveArea>

      {/* threshold 텍스트(또는 인라인 편집) — compact는 패널 중앙 우측, standard는 본문 우측. */}
      {editTarget === 'threshold' ? (
        <foreignObject
          x={thresholdX - 4}
          y={panelCy - 13}
          width={thresholdInputW}
          height={26}
        >
          <Form.Root onSubmit={(e) => e.preventDefault()}>
            <InlineSvgInput
              name="threshold"
              className="trama-node-name-input"
              value={thresholdDraft}
              type="number"
              step="any"
              autoFocus
              onChange={setThresholdDraft}
              onCommit={commitThreshold}
              onCancel={cancelEdit}
            />
          </Form.Root>
        </foreignObject>
      ) : (
        <>
          <text
            className={`trama-function-symbol${isCompact ? ' is-compact' : ''}`}
            x={thresholdX}
            y={panelCy}
            textAnchor="start"
            dominantBaseline="central"
            onDoubleClick={onThresholdDoubleClick}
          >
            {`${thresholdText}${suffix}`}
          </text>
          <rect
            className="trama-condition-threshold-hit"
            x={thresholdX - 4}
            y={panelCy - 13}
            width={thresholdInputW}
            height={26}
            fill="transparent"
            onDoubleClick={onThresholdDoubleClick}
          />
        </>
      )}

      <NodeLabel
        text={node.label || '조건'}
        x={labelAnchor === 'middle' ? panelCx : 0}
        y={labelY}
        width={panelWidth - 24}
        textAnchor={labelAnchor === 'middle' ? 'middle' : 'middle'}
        isEditing={editTarget === 'label'}
        onCommit={commitLabel}
        onCancel={cancelEdit}
        onIsolatedDoubleClick={onLabelDoubleClick}
      />

      {!isEditing && (
        <ModeToggle
          panelRight={panelCx + panelHalfW}
          panelTop={panelCy - panelHeight / 2}
          mode={currentMode}
          onToggle={onToggleMode}
        />
      )}

      {/* 좌측 단일 입력 소켓 */}
      <Socket
        cx={layout.leftPin.cx}
        cy={layout.leftPin.cy}
        connected={inputConnected}
      />
      <circle
        className="trama-node-socket-hit"
        data-trama-slot-index={0}
        cx={layout.leftPin.cx}
        cy={layout.leftPin.cy}
        r={Math.max(SOCKET_SIZE, 12)}
        onPointerDown={(e) => e.stopPropagation()}
      />

      {/* 우측 두 출력 소켓 — slot 0: true(파랑), slot 1: false(붉은빛).
          현재 비활성 슬롯은 흐림(is-inactive-output) 처리해 다운스트림 흐름을 시각화. */}
      {layout.rightPin.sockets[0] && (
        <g className={outputValid0 ? '' : 'is-inactive-output'}>
          <Socket
            cx={layout.rightPin.sockets[0].x}
            cy={layout.rightPin.sockets[0].y}
            connected={outputConnected0}
            color={conditionSourceSlotColor(0)}
          />
          <circle
            className="trama-node-socket-hit"
            data-trama-source-slot-index={0}
            cx={layout.rightPin.sockets[0].x}
            cy={layout.rightPin.sockets[0].y}
            r={Math.max(SOCKET_SIZE, 12)}
            onPointerDown={onSocketPointerDown0}
            onPointerUp={onSocketPointerUp0}
          />
        </g>
      )}
      {layout.rightPin.sockets[1] && (
        <g className={outputValid1 ? '' : 'is-inactive-output'}>
          <Socket
            cx={layout.rightPin.sockets[1].x}
            cy={layout.rightPin.sockets[1].y}
            connected={outputConnected1}
            color={conditionSourceSlotColor(1)}
          />
          <circle
            className="trama-node-socket-hit"
            data-trama-source-slot-index={1}
            cx={layout.rightPin.sockets[1].x}
            cy={layout.rightPin.sockets[1].y}
            r={Math.max(SOCKET_SIZE, 12)}
            onPointerDown={onSocketPointerDown1}
            onPointerUp={onSocketPointerUp1}
          />
        </g>
      )}
    </NodeFrame>
  );
}

function formatThreshold(v: number): string {
  if (!Number.isFinite(v)) return '·';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

export const ConditionNodeView = memo(ConditionNodeViewImpl);
