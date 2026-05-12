import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { tokens } from '@trama/tokens';
import { isExpressionNode, isNodeValid, type NodeId } from '@trama/core';
import { DOMRendererView } from 'fizzex';
import { useModelStore, useUIStore } from '../store/index.js';
import { extractVariables } from '../expression/fizzex-evaluator.js';
import { NodeFrame } from './NodeFrame.js';
import { Socket } from './Socket.js';
import {
  useInputConnectionMask,
  useOutputConnected,
} from './use-socket-connections.js';
import { registerInputSocket } from '../canvas/socket-registry.js';
import { completeEdgeDraft } from '../canvas/edge-draft-actions.js';

interface Props {
  id: NodeId;
}

const CARD_W = 260;
const CARD_H = 120;
const SIDE_INSET = 22;
const LABEL_Y_FROM_TOP = 22;
const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

/** 좌측 핀 N개를 노드 높이 안에 균등 분산. */
function leftPinY(idx: number, n: number): number {
  if (n <= 1) return 0;
  const span = Math.min(CARD_H - 36, (n - 1) * 24);
  const top = -span / 2;
  return top + (idx * span) / (n - 1);
}

function ExpressionNodeViewImpl({ id }: Props): JSX.Element | null {
  const node = useModelStore((s) => s.model.nodes[id]);
  const isValid = useModelStore((s) => isNodeValid(s.executionState, id));
  const updateNode = useModelStore((s) => s.updateNode);
  const selection = useUIStore((s) => s.selection);
  const editingNodeId = useUIStore((s) => s.editingNodeId);
  const setEditingNode = useUIStore((s) => s.setEditingNode);
  const startEdgeDraft = useUIStore((s) => s.startEdgeDraft);
  const inputMask = useInputConnectionMask(id);
  const outputConnected = useOutputConnected(id);

  const pos = node?.position ?? { x: 200, y: 200 };
  const latex = node && isExpressionNode(node) ? node.latex : '';
  const variables = node && isExpressionNode(node) ? node.variables : [];

  // 입력 슬롯 등록 — 변수 갯수만큼.
  useEffect(() => {
    if (!node || !isExpressionNode(node)) return;
    const n = node.variables.length;
    const unregs: Array<() => void> = [];
    for (let i = 0; i < n; i++) {
      unregs.push(
        registerInputSocket({
          nodeId: id,
          slotIndex: i,
          offset: { x: -CARD_W / 2, y: leftPinY(i, n) },
        }),
      );
    }
    return () => unregs.forEach((u) => u());
  }, [id, node]);

  const canStartDrag = useCallback(
    () => editingNodeId !== id,
    [editingNodeId, id],
  );

  const onBodyDoubleClick = useCallback(() => {
    setEditingNode(id);
  }, [id, setEditingNode]);

  const onSocketPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (!isValid) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      const startPoint = { x: pos.x + CARD_W / 2, y: pos.y };
      startEdgeDraft({ fromNodeId: id, startPoint, pointer: startPoint, lag });
    },
    [id, isValid, pos.x, pos.y, startEdgeDraft],
  );

  const onSocketPointerUp = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      completeEdgeDraft({ dropScreen: { x: e.clientX, y: e.clientY } });
    },
    [],
  );

  // 인라인 LaTeX 편집 — textarea.
  const [latexDraft, setLatexDraft] = useState(latex);
  useEffect(() => {
    if (editingNodeId === id) setLatexDraft(latex);
  }, [editingNodeId, id, latex]);

  const commitLatex = useCallback(() => {
    if (!node || !isExpressionNode(node)) {
      setEditingNode(null);
      return;
    }
    const v = latexDraft.trim();
    if (v && v !== node.latex) {
      const vars = extractVariables(v);
      updateNode(id, { latex: v, variables: vars }, 'update-node', '식 편집');
    }
    setEditingNode(null);
  }, [id, latexDraft, node, setEditingNode, updateNode]);

  // fizzex Canvas 렌더러 — foreignObject 안의 div에 캡슐화.
  const rendererHostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<DOMRendererView | null>(null);
  useEffect(() => {
    const host = rendererHostRef.current;
    if (!host) return;
    const view = new DOMRendererView(host, {
      baseFontSize: 22,
      color: tokens.color.nodeTextPrimary,
      padding: 0,
      displayMode: 'inline',
    });
    rendererRef.current = view;
    return () => {
      view.destroy();
      rendererRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.render(latex || ' ');
  }, [latex]);

  if (!node || !isExpressionNode(node)) return null;

  const halfW = CARD_W / 2;
  const halfH = CARD_H / 2;
  const isSelected = selection.kind === 'node' && selection.id === id;
  const stateClass = isValid ? 'is-calm' : 'is-low';
  const isEditing = editingNodeId === id;

  // 수식 본체 영역 — 좌측 핀과 우측 출력 핀을 피해서 가운데.
  const bodyX = -halfW + SIDE_INSET;
  const bodyW = CARD_W - SIDE_INSET * 2;
  const bodyY = -halfH + LABEL_Y_FROM_TOP + 4;
  const bodyH = CARD_H - LABEL_Y_FROM_TOP - 14;

  return (
    <NodeFrame
      id={id}
      pos={pos}
      width={CARD_W}
      height={CARD_H}
      className={`trama-expression-node${isValid ? '' : ' is-invalid'}`}
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
      <text
        className="trama-node-label"
        x={-halfW + SIDE_INSET}
        y={-halfH + LABEL_Y_FROM_TOP}
        textAnchor="start"
      >
        {node.label}
      </text>

      {isEditing ? (
        <foreignObject x={bodyX} y={bodyY} width={bodyW} height={bodyH}>
          <textarea
            className="trama-expression-editor"
            value={latexDraft}
            autoFocus
            onChange={(e) => setLatexDraft(e.target.value)}
            onBlur={commitLatex}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commitLatex();
              }
              if (e.key === 'Escape') setEditingNode(null);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="LaTeX 식 (예: a + b)"
          />
        </foreignObject>
      ) : (
        <foreignObject x={bodyX} y={bodyY} width={bodyW} height={bodyH}>
          <div ref={rendererHostRef} className="trama-expression-canvas" />
        </foreignObject>
      )}

      {/* 좌측 입력 슬롯 — 변수마다 1핀. 슬롯 인덱스 = variables 배열 인덱스. */}
      {variables.map((name, i) => {
        const y = leftPinY(i, variables.length);
        const connected = (inputMask & (1 << i)) !== 0;
        return (
          <g key={`in-${i}`}>
            <Socket cx={-halfW} cy={y} connected={connected} />
            <circle
              className="trama-node-socket-hit"
              data-trama-slot-index={i}
              cx={-halfW}
              cy={y}
              r={Math.max(SOCKET_SIZE, 12)}
            />
            <text
              className="trama-expression-var"
              x={-halfW + 14}
              y={y + 4}
              textAnchor="start"
            >
              {name}
            </text>
          </g>
        );
      })}

      {/* 우측 출력 — valid일 때만 */}
      {isValid && (
        <>
          <Socket cx={halfW} cy={0} connected={outputConnected} />
          <circle
            className="trama-node-socket-hit"
            cx={halfW}
            cy={0}
            r={Math.max(SOCKET_SIZE, 12)}
            onPointerDown={onSocketPointerDown}
            onPointerUp={onSocketPointerUp}
          />
        </>
      )}
    </NodeFrame>
  );
}

export const ExpressionNodeView = memo(ExpressionNodeViewImpl);
