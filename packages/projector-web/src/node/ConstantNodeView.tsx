import { memo, useCallback, useEffect, useState } from 'react';
import * as Form from '@radix-ui/react-form';
import { tokens } from '@trama/tokens';
import { isConstantNode, isNumericValue, numericValue, type NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeBody } from './NodeBody.js';
import { InlineSvgInput } from './InlineSvgInput.js';
import { Socket } from './Socket.js';
import { useOutputConnected } from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';

interface Props {
  id: NodeId;
}

const CARD_W = 240;
const CARD_H = 124;
const SIDE_INSET = 18;
const LABEL_Y_FROM_TOP = 28;
const VALUE_Y_FROM_TOP = 78;

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

function formatConstantValue(v: number): string {
  if (!Number.isFinite(v)) return '·';
  // 너무 큰 수치(빛의 속도 등)는 지수 표기, 그 외는 4~6자리 유효숫자.
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return v.toExponential(3);
  if (abs >= 100) return v.toFixed(2);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(4);
}

function ConstantNodeViewImpl({ id }: Props): JSX.Element | null {
  const { modelStore, uiStore } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  const updateNode = modelStore((s) => s.updateNode);
  const selection = uiStore((s) => s.selection);
  const isEditing = uiStore((s) => s.editingNode?.id === id);
  const setEditingNode = uiStore((s) => s.setEditingNode);
  const outputConnected = useOutputConnected(id);

  // 좌표는 아래 가드 `!node ... || !node.position`이 통과해야만 의미를 갖는다.
  // hook 순서를 깨지 않기 위한 primitive 폴백 — 화면에는 도달하지 않는다.
  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const labelDraftSeed = node?.label ?? '';
  const constantNumeric =
    node && isConstantNode(node) && isNumericValue(node.value) ? node.value.n : 0;
  const isBooleanConstant =
    node && isConstantNode(node) && node.value.kind === 'boolean';
  const constantBoolean =
    node && isConstantNode(node) && node.value.kind === 'boolean'
      ? node.value.b
      : false;
  const valueDraftSeed = constantNumeric;
  const isCustom = node && isConstantNode(node) && (node.constantKey ?? '') === 'custom';

  // 사용자 정의 단일 값에 한해, 본체 더블클릭으로 수치 인라인 편집 진입.
  // 카탈로그 상수(π·g 등)는 값이 고정 의미라 편집 불가 — 라벨만 편집.
  const onBodyDoubleClick = useCallback(() => {
    setEditingNode(id);
  }, [id, setEditingNode]);

  const getOutputStartPoint = useCallback(
    () => ({ x: posX + CARD_W / 2, y: posY }),
    [posX, posY],
  );
  const { onPointerDown: onSocketPointerDown, onPointerUp: onSocketPointerUp } =
    useEdgeDraftSource(id, { getStartPoint: getOutputStartPoint });

  // 인라인 편집 — 단일 값이면 value/label 모두, 카탈로그 상수면 label만.
  const [nameDraft, setNameDraft] = useState(labelDraftSeed);
  const [valueDraft, setValueDraft] = useState(String(valueDraftSeed));
  useEffect(() => {
    if (isEditing && node) {
      setNameDraft(node.label);
      if (isConstantNode(node) && isNumericValue(node.value)) {
        setValueDraft(String(node.value.n));
      }
    }
  }, [isEditing, node]);

  const commitEdit = useCallback(() => {
    if (!node || !isConstantNode(node)) {
      setEditingNode(null);
      return;
    }
    const patch: { label?: string; value?: ReturnType<typeof numericValue> } = {};
    const v = nameDraft.trim();
    if (v && v !== node.label) patch.label = v;
    if (isCustom && isNumericValue(node.value)) {
      const parsed = parseFloat(valueDraft);
      if (Number.isFinite(parsed) && parsed !== node.value.n) {
        patch.value = numericValue(parsed, node.value.unitId);
      }
    }
    if (Object.keys(patch).length > 0) {
      updateNode(id, patch);
    }
    setEditingNode(null);
  }, [id, isCustom, nameDraft, node, setEditingNode, updateNode, valueDraft]);

  if (!node || !isConstantNode(node) || !node.position) return null;

  const halfW = CARD_W / 2;
  const halfH = CARD_H / 2;
  const cardTop = -halfH;
  const textX = -halfW + SIDE_INSET;
  const labelY = cardTop + LABEL_Y_FROM_TOP;
  const valueY = cardTop + VALUE_Y_FROM_TOP;
  const rightCx = halfW;

  const isSelected = selection.kind === 'node' && selection.id === id;
  const stateClass = 'is-focal';

  const valueText = isBooleanConstant
    ? constantBoolean
      ? '참'
      : '거짓'
    : formatConstantValue(constantNumeric);

  return (
    <NodeFrame
      id={id}
      pos={node.position}
      width={CARD_W}
      height={CARD_H}
      className="trama-constant-node"
      onBodyDoubleClick={onBodyDoubleClick}
    >
      <NodeBody
        width={CARD_W}
        height={CARD_H}
        stateClass={stateClass}
        isSelected={isSelected}
      />

      {isEditing ? (
        <foreignObject x={textX} y={cardTop + 14} width={CARD_W - SIDE_INSET * 2} height={CARD_H - 28}>
          <Form.Root
            className="trama-constant-editor"
            onSubmit={(e) => e.preventDefault()}
          >
            <InlineSvgInput
              name="label"
              className="trama-node-name-input"
              value={nameDraft}
              autoFocus
              placeholder="라벨"
              onChange={setNameDraft}
              onCommit={commitEdit}
              onCancel={() => setEditingNode(null)}
              // 카탈로그 상수(π·g 등)는 라벨만 편집 — Enter로 즉시 커밋. 단일 값은
              // 다음 input(value)으로 포커스를 옮길 여지가 있어 Enter 커밋을 막는다.
              commitOnEnter={!isCustom}
            />
            {isCustom && (
              <InlineSvgInput
                name="value"
                className="trama-node-name-input"
                value={valueDraft}
                type="number"
                step="any"
                placeholder="수치"
                onChange={setValueDraft}
                onCommit={commitEdit}
                onCancel={() => setEditingNode(null)}
              />
            )}
          </Form.Root>
        </foreignObject>
      ) : (
        <>
          <text className="trama-node-label" x={textX} y={labelY} textAnchor="start">
            {node.label}
          </text>
          <text className="trama-node-value" x={textX} y={valueY} textAnchor="start">
            {valueText}
          </text>
        </>
      )}

      {/* 우측 출력 소켓 — 상수는 항상 valid */}
      <Socket cx={rightCx} cy={0} connected={outputConnected} />
      <circle
        className="trama-node-socket-hit"
        cx={rightCx}
        cy={0}
        r={Math.max(SOCKET_SIZE, 12)}
        onPointerDown={onSocketPointerDown}
        onPointerUp={onSocketPointerUp}
      />
    </NodeFrame>
  );
}

export const ConstantNodeView = memo(ConstantNodeViewImpl);
