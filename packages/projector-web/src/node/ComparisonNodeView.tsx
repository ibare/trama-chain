import { memo, useCallback, useEffect, useState } from 'react';
import * as Form from '@radix-ui/react-form';
import { tokens } from '@trama/tokens';
import {
  isComparisonNode,
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

const OPERATOR_GLYPH: Record<ConditionOperator, string> = {
  '>': '>',
  '<': '<',
  '>=': '≥',
  '<=': '≤',
  '==': '=',
  '!=': '≠',
};

/**
 * ComparisonNode 뷰 — ConditionNode와 시각/조작은 거의 동일하지만, 출력 의미가
 * boolean이라는 점이 다르다. UI 시그널로 우측 출력 소켓 옆에 작은 "⊤/⊥"
 * 마커를 두어 데이터-통과 게이트(Condition)와 구분한다.
 *
 * ConditionNodeView의 거의 모든 인터랙션(operator cycle, threshold inline
 * edit, label edit)을 그대로 재사용 — 두 노드가 동일한 시각 골격을 공유하는
 * 게 자연스럽기 때문에 별도 컴포넌트로 두되 구조는 의도적으로 평행.
 */
function ComparisonNodeViewImpl({ id }: Props): JSX.Element | null {
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
  const inputConnected = useInputConnected(id, 0);
  const outputConnected = useOutputConnected(id);

  const inputUnitSuffix = modelStore((s) => {
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (!e || e.to !== id || (e.slotIndex ?? 0) !== 0) continue;
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
  const layout = getConditionNodeLayout();
  const { halfH, halfW } = layout;

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
    if (!node || !isComparisonNode(node)) return;
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

  const [thresholdDraft, setThresholdDraft] = useState(
    node && isComparisonNode(node) ? String(node.threshold) : '0',
  );
  useEffect(() => {
    if (editTarget === 'threshold' && node && isComparisonNode(node)) {
      setThresholdDraft(String(node.threshold));
    }
  }, [editTarget, node]);

  const commitThreshold = useCallback(() => {
    if (!node || !isComparisonNode(node)) {
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

  if (!node || !isComparisonNode(node) || !node.position) return null;

  const isSelected = selection.kind === 'node' && selection.id === id;
  const isActive = outputValid;
  // 결과 boolean을 시각 톤으로 — 참이면 focal, 거짓이면 calm, 미정이면 low.
  const stateClass = !isActive ? 'is-low' : outputValue ? 'is-focal' : 'is-calm';

  const opGlyph = OPERATOR_GLYPH[node.operator];
  const thresholdText = formatThreshold(node.threshold);
  const suffix = inputUnitSuffix ? ` ${inputUnitSuffix}` : '';
  const resultMark = !isActive ? '·' : outputValue ? '⊤' : '⊥';

  return (
    <NodeFrame
      id={id}
      pos={node.position}
      width={CARD_W}
      height={CARD_H}
      className={`trama-comparison-node${isActive ? '' : ' is-invalid'}`}
    >
      <NodeBody
        width={CARD_W}
        height={CARD_H}
        stateClass={stateClass}
        isSelected={isSelected}
        extraClassName="trama-function-body"
      />

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
        <foreignObject x={0} y={-13} width={70} height={26}>
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
            x={0}
            y={-13}
            width={70}
            height={26}
            fill="transparent"
            onDoubleClick={onThresholdDoubleClick}
          />
        </>
      )}

      <NodeLabel
        text={node.label || '비교'}
        x={0}
        y={halfH - 8}
        width={CARD_W - 24}
        textAnchor="middle"
        isEditing={editTarget === 'label'}
        onCommit={commitLabel}
        onCancel={cancelEdit}
        onIsolatedDoubleClick={onLabelDoubleClick}
      />

      {/* 출력이 boolean임을 알리는 우측 상단 마커. Condition(데이터 통과 게이트)와
          시각적으로 구분. */}
      <text
        className="trama-comparison-output-mark"
        x={halfW - 12}
        y={-halfH + 16}
        textAnchor="end"
        pointerEvents="none"
      >
        {resultMark}
      </text>

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

export const ComparisonNodeView = memo(ComparisonNodeViewImpl);
