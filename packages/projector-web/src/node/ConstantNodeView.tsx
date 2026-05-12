import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { tokens } from '@trama/tokens';
import { isConstantNode, type NodeId } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import {
  getIncidentEdgeHandles,
  registerNodeEl,
  type EdgeHandle,
} from '../canvas/drag-registry.js';

interface Props {
  id: NodeId;
}

const CARD_W = 144;
const CARD_H = 96;
const SYMBOL_Y_FROM_TOP = 38;
const LABEL_Y_FROM_TOP = 62;
const VALUE_Y_FROM_TOP = 80;

const PIN_W = parseFloat(tokens.spacing.pinMinSize);
const PIN_RADIUS = parseFloat(tokens.spacing.pinRadius);
const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const SOCKET_DOT_SIZE = parseFloat(tokens.spacing.socketDotSize);
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);
const DRAG_THRESHOLD_PX = 3;

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
  const addEdge = useModelStore((s) => s.addEdge);
  const selection = useUIStore((s) => s.selection);
  const selectNode = useUIStore((s) => s.selectNode);
  const editingNodeId = useUIStore((s) => s.editingNodeId);
  const setEditingNode = useUIStore((s) => s.setEditingNode);
  const startEdgeDraft = useUIStore((s) => s.startEdgeDraft);
  const endEdgeDraft = useUIStore((s) => s.endEdgeDraft);

  const outerGRef = useRef<SVGGElement | null>(null);
  useEffect(() => {
    const el = outerGRef.current;
    if (!el) return undefined;
    return registerNodeEl(id, el);
  }, [id]);

  const pos = node?.position ?? { x: 200, y: 200 };
  const labelDraftSeed = node?.label ?? '';
  const valueDraftSeed = node && isConstantNode(node) ? node.value : 0;
  const isCustom = node && isConstantNode(node) && (node.constantKey ?? '') === 'custom';

  const moveRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPosX: number;
    startPosY: number;
    lastDx: number;
    lastDy: number;
    dragged: boolean;
    incidents: EdgeHandle[];
  } | null>(null);

  const onBodyPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (editingNodeId === id) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      selectNode(id);
      moveRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPosX: pos.x,
        startPosY: pos.y,
        lastDx: 0,
        lastDy: 0,
        dragged: false,
        incidents: getIncidentEdgeHandles(id),
      };
    },
    [editingNodeId, id, pos.x, pos.y, selectNode],
  );

  const onBodyPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      if (!m) return;
      const dx = e.clientX - m.startClientX;
      const dy = e.clientY - m.startClientY;
      if (!m.dragged) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        m.dragged = true;
      }
      m.lastDx = dx;
      m.lastDy = dy;
      const gEl = outerGRef.current;
      if (gEl) {
        const nx = m.startPosX + dx;
        const ny = m.startPosY + dy;
        gEl.setAttribute('transform', `translate(${nx} ${ny})`);
      }
      for (const h of m.incidents) {
        h.applyDrag(id, dx, dy);
      }
    },
    [id],
  );

  const onBodyPointerUp = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      moveRef.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (m?.dragged && (m.lastDx !== 0 || m.lastDy !== 0)) {
        updateNode(
          id,
          { position: { x: m.startPosX + m.lastDx, y: m.startPosY + m.lastDy } },
          'move-node',
          '위치 이동',
        );
      }
    },
    [id, updateNode],
  );

  // 사용자 정의 임의 수에 한해, 본체 더블클릭으로 수치 인라인 편집 진입.
  // 카탈로그 상수(π·g 등)는 값이 고정 의미라 편집 불가 — 라벨만 편집.
  const onBodyDoubleClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      e.stopPropagation();
      setEditingNode(id);
    },
    [id, setEditingNode],
  );

  const handleDragRef = useRef<{ dragged: boolean } | null>(null);

  const onSocketPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      const startPoint = { x: pos.x, y: pos.y };
      startEdgeDraft(id, startPoint, startPoint, lag);
      handleDragRef.current = { dragged: false };
    },
    [id, pos.x, pos.y, startEdgeDraft],
  );

  const onSocketPointerMove = useCallback(() => {
    if (!handleDragRef.current) return;
    handleDragRef.current.dragged = true;
  }, []);

  const onSocketPointerUp = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      handleDragRef.current = null;
      const dropX = e.clientX;
      const dropY = e.clientY;
      const target = document.elementFromPoint(dropX, dropY);
      const slotEl = target?.closest?.('[data-trama-slot-index]');
      const groupEl = target?.closest?.('[data-trama-node-id]');
      const targetId = groupEl?.getAttribute('data-trama-node-id');
      if (targetId && targetId !== id) {
        const lag: 0 | 1 = e.altKey ? 1 : 0;
        const model = useModelStore.getState().model;
        const targetNode = model.nodes[targetId];
        // 함수 노드면 slotIndex 결정 (ValueNodeView와 동일 로직).
        let slotIndex: number | undefined;
        if (targetNode && targetNode.kind === 'function') {
          const explicit = slotEl?.getAttribute('data-trama-slot-index');
          // arity는 함수 정의에서 — registries는 ValueNodeView에서 import. 단순화를
          // 위해 explicit 슬롯이 있으면 그것, 없으면 0으로. 슬롯 차있으면 store가 거부.
          if (explicit !== null && explicit !== undefined) {
            slotIndex = Number(explicit);
          } else {
            slotIndex = 0;
          }
        }
        addEdge({
          from: id,
          to: targetId,
          shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
          lag,
          slotIndex,
        });
      }
      endEdgeDraft();
    },
    [addEdge, endEdgeDraft, id],
  );

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
  const symbolY = cardTop + SYMBOL_Y_FROM_TOP;
  const labelY = cardTop + LABEL_Y_FROM_TOP;
  const valueY = cardTop + VALUE_Y_FROM_TOP;
  const rightCx = halfW;

  const isSelected = selection.kind === 'node' && selection.id === id;
  const stateClass = 'is-focal'; // 상수는 항상 "입력"성 — 사용자가 의미를 설정한 값
  const isEditing = editingNodeId === id;

  // 심볼: 라벨이 짧으면(2자 이하) 라벨 자체를, 길면 첫 글자. 카탈로그 정의가 있다면
  // constantKey와 매칭되는 ConstantDefinition에서 가져오는 게 더 정확하지만,
  // v1엔 단순화 — 사용자 라벨이 보통 심볼 역할을 한다 (π·g·½ 등은 라벨이 이미 심볼).
  const symbol = node.label.length <= 2 ? node.label : node.label.charAt(0);
  const valueText = formatConstantValue(node.value);

  return (
    <g
      ref={outerGRef}
      className="trama-node trama-constant-node"
      data-trama-node-id={id}
      transform={`translate(${pos.x} ${pos.y})`}
    >
      <g className="trama-node-inner">
        <rect
          className={`trama-node-body ${stateClass}${isSelected ? ' is-selected' : ''}`}
          x={-halfW}
          y={-halfH}
          width={CARD_W}
          height={CARD_H}
          rx={CARD_CORNER}
          ry={CARD_CORNER}
          onPointerDown={onBodyPointerDown}
          onPointerMove={onBodyPointerMove}
          onPointerUp={onBodyPointerUp}
          onDoubleClick={onBodyDoubleClick}
        />

        {isEditing ? (
          <foreignObject x={-halfW + 8} y={cardTop + 18} width={CARD_W - 16} height={CARD_H - 28}>
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
            <text
              className="trama-function-symbol"
              x={0}
              y={symbolY}
              textAnchor="middle"
            >
              {symbol}
            </text>
            <text
              className="trama-function-label"
              x={0}
              y={labelY}
              textAnchor="middle"
            >
              {node.label}
            </text>
            <text
              className="trama-node-unit"
              x={0}
              y={valueY}
              textAnchor="middle"
            >
              {valueText}
            </text>
          </>
        )}

        {/* 우측 핀 (출력) — 상수는 항상 valid */}
        <rect
          className={`trama-node-pin ${stateClass}`}
          x={rightCx - PIN_W / 2}
          y={-PIN_W / 2}
          width={PIN_W}
          height={PIN_W}
          rx={Math.min(PIN_RADIUS, PIN_W / 2)}
          ry={Math.min(PIN_RADIUS, PIN_W / 2)}
        />
        <g pointerEvents="none">
          <circle
            className={`trama-node-socket-ring ${stateClass}`}
            cx={rightCx}
            cy={0}
            r={SOCKET_SIZE / 2}
          />
          <circle
            className={`trama-node-socket-dot ${stateClass}`}
            cx={rightCx}
            cy={0}
            r={SOCKET_DOT_SIZE / 2}
          />
        </g>
        <circle
          className="trama-node-socket-hit"
          cx={rightCx}
          cy={0}
          r={Math.max(SOCKET_SIZE, 12)}
          onPointerDown={onSocketPointerDown}
          onPointerMove={onSocketPointerMove}
          onPointerUp={onSocketPointerUp}
        />
      </g>
    </g>
  );
}

export const ConstantNodeView = memo(ConstantNodeViewImpl);
