import { memo, useCallback, useEffect, useState } from 'react';
import { tokens } from '@trama/tokens';
import { isConstantNode, type NodeId } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { NodeFrame } from './NodeFrame.js';
import { Socket } from './Socket.js';
import { useOutputConnected } from './use-socket-connections.js';
import { completeEdgeDraft } from '../canvas/edge-draft-actions.js';

interface Props {
  id: NodeId;
}

const CARD_W = 240;
const CARD_H = 124;
const SIDE_INSET = 18;
const LABEL_Y_FROM_TOP = 28;
const VALUE_Y_FROM_TOP = 78;

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

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
  const node = useModelStore((s) => s.model.nodes[id]);
  const updateNode = useModelStore((s) => s.updateNode);
  const selection = useUIStore((s) => s.selection);
  const editingNodeId = useUIStore((s) => s.editingNodeId);
  const setEditingNode = useUIStore((s) => s.setEditingNode);
  const startEdgeDraft = useUIStore((s) => s.startEdgeDraft);
  const outputConnected = useOutputConnected(id);

  const pos = node?.position ?? { x: 200, y: 200 };
  const labelDraftSeed = node?.label ?? '';
  const valueDraftSeed = node && isConstantNode(node) ? node.value : 0;
  const isCustom = node && isConstantNode(node) && (node.constantKey ?? '') === 'custom';

  // 인라인 편집 중에는 drag 시작을 막아 input 포커스가 끊기지 않게.
  const canStartDrag = useCallback(() => editingNodeId !== id, [editingNodeId, id]);

  // 사용자 정의 임의 수에 한해, 본체 더블클릭으로 수치 인라인 편집 진입.
  // 카탈로그 상수(π·g 등)는 값이 고정 의미라 편집 불가 — 라벨만 편집.
  const onBodyDoubleClick = useCallback(() => {
    setEditingNode(id);
  }, [id, setEditingNode]);

  const onSocketPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      const startPoint = { x: pos.x + CARD_W / 2, y: pos.y };
      startEdgeDraft({ fromNodeId: id, startPoint, pointer: startPoint, lag });
    },
    [id, pos.x, pos.y, startEdgeDraft],
  );

  const onSocketPointerUp = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    completeEdgeDraft({ dropScreen: { x: e.clientX, y: e.clientY } });
  }, []);

  // 인라인 편집 — 임의 수면 value/label 모두, 카탈로그 상수면 label만.
  const [nameDraft, setNameDraft] = useState(labelDraftSeed);
  const [valueDraft, setValueDraft] = useState(String(valueDraftSeed));
  useEffect(() => {
    if (editingNodeId === id && node) {
      setNameDraft(node.label);
      if (isConstantNode(node)) setValueDraft(String(node.value));
    }
  }, [editingNodeId, id, node]);

  const commitEdit = useCallback(() => {
    if (!node || !isConstantNode(node)) {
      setEditingNode(null);
      return;
    }
    const patch: { label?: string; value?: number } = {};
    const v = nameDraft.trim();
    if (v && v !== node.label) patch.label = v;
    if (isCustom) {
      const parsed = parseFloat(valueDraft);
      if (Number.isFinite(parsed) && parsed !== node.value) patch.value = parsed;
    }
    if (Object.keys(patch).length > 0) {
      updateNode(id, patch, 'update-node', '상수 편집');
    }
    setEditingNode(null);
  }, [id, isCustom, nameDraft, node, setEditingNode, updateNode, valueDraft]);

  if (!node || !isConstantNode(node)) return null;

  const halfW = CARD_W / 2;
  const halfH = CARD_H / 2;
  const cardTop = -halfH;
  const textX = -halfW + SIDE_INSET;
  const labelY = cardTop + LABEL_Y_FROM_TOP;
  const valueY = cardTop + VALUE_Y_FROM_TOP;
  const rightCx = halfW;

  const isSelected = selection.kind === 'node' && selection.id === id;
  const stateClass = 'is-focal';
  const isEditing = editingNodeId === id;

  const valueText = formatConstantValue(node.value);

  return (
    <NodeFrame
      id={id}
      pos={pos}
      width={CARD_W}
      height={CARD_H}
      className="trama-constant-node"
      canStartDrag={canStartDrag}
      onBodyDoubleClick={onBodyDoubleClick}
    >
      <rect
        className={`trama-node-body ${stateClass}${isSelected ? ' is-selected' : ''}`}
        x={-halfW}
        y={-halfH}
        width={CARD_W}
        height={CARD_H}
        rx={CARD_CORNER}
        ry={CARD_CORNER}
      />

      {isEditing ? (
        <foreignObject x={textX} y={cardTop + 14} width={CARD_W - SIDE_INSET * 2} height={CARD_H - 28}>
          <div className="trama-constant-editor">
            <input
              className="trama-node-name-input"
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCustom) commitEdit();
                if (e.key === 'Escape') setEditingNode(null);
              }}
              onBlur={() => {
                if (!isCustom) commitEdit();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="라벨"
            />
            {isCustom && (
              <input
                className="trama-node-name-input"
                value={valueDraft}
                type="number"
                step="any"
                onChange={(e) => setValueDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') setEditingNode(null);
                }}
                onBlur={commitEdit}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="수치"
              />
            )}
          </div>
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
