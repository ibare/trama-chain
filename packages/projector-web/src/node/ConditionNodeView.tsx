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
import {
  CONDITION_CARD_H,
  CONDITION_CARD_W,
  getConditionNodeLayout,
} from './condition-box.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeBody } from './NodeBody.js';
import { NodeLabel } from './NodeLabel.js';
import { InlineSvgInput } from './InlineSvgInput.js';
import { InteractiveArea } from './InteractiveArea.js';
import { Socket } from './Socket.js';
import {
  useInputConnected,
  useOutputConnected,
} from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';

interface Props {
  id: NodeId;
}

const CARD_W = CONDITION_CARD_W;
const CARD_H = CONDITION_CARD_H;
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
  const outputValid = modelStore((s) => isOutputValid(s.executionState, id, 0));
  const updateNode = modelStore((s) => s.updateNode);
  const selection = uiStore((s) => s.selection);
  const editingNode = uiStore((s) => s.editingNode);
  const setEditingNode = uiStore((s) => s.setEditingNode);
  const isEditing = editingNode?.id === id;
  const editTarget = isEditing ? editingNode.target : null;
  const inputConnected = useInputConnected(id, 0);
  const outputConnected = useOutputConnected(id);

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

  // 좌표는 아래 가드 `!node ... || !node.position` 통과 후에만 의미를 갖는다.
  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const layout = getConditionNodeLayout();
  const { halfH } = layout;

  useEffect(() => {
    return socketRegistry.register({
      nodeId: id,
      slotIndex: 0,
      offset: { x: layout.inputSocket.x, y: layout.inputSocket.y },
    });
  }, [id, layout.inputSocket.x, layout.inputSocket.y, socketRegistry]);

  const getOutputStartPoint = useCallback(
    () => ({
      x: posX + layout.outputSocket.x,
      y: posY + layout.outputSocket.y,
    }),
    [layout.outputSocket.x, layout.outputSocket.y, posX, posY],
  );
  const { onPointerDown: onSocketPointerDown, onPointerUp: onSocketPointerUp } =
    useEdgeDraftSource(id, {
      enabled: !!node && outputValid,
      getStartPoint: getOutputStartPoint,
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

  if (!node || !isConditionNode(node) || !node.position) return null;

  const isSelected = selection.kind === 'node' && selection.id === id;
  const isActive = outputValid;
  const stateClass = isActive ? 'is-calm' : 'is-low';

  const opGlyph = OPERATOR_GLYPH[node.operator];
  const thresholdText = formatThreshold(node.threshold);
  const suffix = inputUnitSuffix ? ` ${inputUnitSuffix}` : '';

  return (
    <NodeFrame
      id={id}
      pos={node.position}
      width={CARD_W}
      height={CARD_H}
      className={`trama-condition-node${isActive ? '' : ' is-invalid'}`}
    >
      <NodeBody
        width={CARD_W}
        height={CARD_H}
        stateClass={stateClass}
        isSelected={isSelected}
        extraClassName="trama-function-body"
      />

      {/* 중앙: {op} {threshold}{unit suffix}.
          - operator 영역(글리프 좌측)은 클릭으로 6종 순환.
          - threshold 영역은 더블클릭으로 인라인 수치 편집 진입. */}
      <InteractiveArea
        x={-56}
        y={-22}
        width={36}
        height={44}
        rx={6}
        ry={6}
        hitClassName="trama-condition-operator-hit"
        onClick={onOperatorClick}
      >
        <text className="trama-function-symbol" x={-38} y={4} textAnchor="middle">
          {opGlyph}
        </text>
      </InteractiveArea>

      {editTarget === 'threshold' ? (
        <foreignObject x={-18} y={-18} width={92} height={36}>
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
            className="trama-function-symbol"
            x={4}
            y={4}
            textAnchor="start"
            onDoubleClick={onThresholdDoubleClick}
          >
            {`${thresholdText}${suffix}`}
          </text>
          <rect
            className="trama-condition-threshold-hit"
            x={-18}
            y={-18}
            width={92}
            height={36}
            fill="transparent"
            onDoubleClick={onThresholdDoubleClick}
          />
        </>
      )}

      <NodeLabel
        text={node.label || '조건'}
        x={0}
        y={halfH - 8}
        width={CARD_W - 24}
        textAnchor="middle"
        isEditing={editTarget === 'label'}
        onCommit={commitLabel}
        onCancel={cancelEdit}
        onIsolatedDoubleClick={onLabelDoubleClick}
      />

      {/* 좌측 단일 입력 소켓 */}
      <Socket
        cx={layout.inputSocket.x}
        cy={layout.inputSocket.y}
        connected={inputConnected}
      />
      <circle
        className="trama-node-socket-hit"
        data-trama-slot-index={0}
        cx={layout.inputSocket.x}
        cy={layout.inputSocket.y}
        r={Math.max(SOCKET_SIZE, 12)}
        onPointerDown={(e) => e.stopPropagation()}
      />

      {/* 우측 단일 출력 소켓 — 조건이 거짓이면 invalid 상태로 시각 표시. */}
      <g className={isActive ? '' : 'is-inactive-output'}>
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
      </g>
    </NodeFrame>
  );
}

function formatThreshold(v: number): string {
  if (!Number.isFinite(v)) return '·';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

export const ConditionNodeView = memo(ConditionNodeViewImpl);
