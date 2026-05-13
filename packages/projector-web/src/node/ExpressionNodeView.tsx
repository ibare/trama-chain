import { memo, useCallback, useEffect, useState } from 'react';
import { tokens } from '@trama/tokens';
import { isExpressionNode, isNodeValid, type NodeId } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { extractVariables } from '../expression/fizzex-evaluator.js';
import { useFizzexRenderer } from '../expression/use-fizzex-renderer.js';
import { NodeFrame } from './NodeFrame.js';
import { Socket } from './Socket.js';
import {
  useInputConnectionMask,
  useOutputConnected,
} from './use-socket-connections.js';
import { registerInputSocket } from '../canvas/socket-registry.js';
import { completeEdgeDraft } from '../canvas/edge-draft-actions.js';
import { getNodeLayout } from './box.js';

interface Props {
  id: NodeId;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

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

  // 입력 슬롯 등록 — 변수 갯수만큼. 좌표는 공통 box.ts 레이아웃을 그대로 사용해
  // EdgeView가 부르는 좌표와 어긋나지 않게 단일 출처로 둔다.
  useEffect(() => {
    if (!node || !isExpressionNode(node)) return;
    const layoutNow = getNodeLayout(node, { incomingCount: node.variables.length });
    const unregs: Array<() => void> = [];
    layoutNow.leftPin.sockets.forEach((s, i) => {
      if (i >= node.variables.length) return;
      unregs.push(
        registerInputSocket({
          nodeId: id,
          slotIndex: i,
          offset: { x: s.x, y: s.y },
        }),
      );
    });
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
      if (!isValid || !node) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      const layoutNow = getNodeLayout(node, { incomingCount: variables.length });
      const out = layoutNow.rightPin.sockets[0];
      const startPoint = out
        ? { x: pos.x + out.x, y: pos.y + out.y }
        : { x: pos.x, y: pos.y };
      startEdgeDraft({ fromNodeId: id, startPoint, pointer: startPoint, lag });
    },
    [id, isValid, node, pos.x, pos.y, startEdgeDraft, variables.length],
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

  // fizzex Canvas 렌더러를 host div의 마운트 라이프타임에 묶는다.
  // 편집/뷰 토글로 div가 remount되어도 callback ref가 새 view를 부착·재렌더.
  const rendererHostRef = useFizzexRenderer(latex, {
    baseFontSize: 22,
    color: tokens.color.nodeTextPrimary,
    padding: 0,
    displayMode: 'inline',
  });

  if (!node || !isExpressionNode(node)) return null;

  const layout = getNodeLayout(node, { incomingCount: variables.length });
  const { width, height, halfW, halfH, textX, labelY } = layout;
  const isSelected = selection.kind === 'node' && selection.id === id;
  const stateClass = isValid ? 'is-calm' : 'is-low';
  const isEditing = editingNodeId === id;

  // 수식 본체 영역 — 라벨 아래부터 카드 하단 여백까지. 좌우는 textX 정렬.
  const bodyX = textX;
  const bodyW = width - (textX - -halfW) * 2;
  const bodyY = labelY + 4;
  const bodyH = halfH - bodyY - 10;
  const outSocket = layout.rightPin.sockets[0] ?? { x: halfW, y: 0 };

  return (
    <NodeFrame
      id={id}
      pos={pos}
      width={width}
      height={height}
      className={`trama-expression-node${isValid ? '' : ' is-invalid'}`}
      canStartDrag={canStartDrag}
      onBodyDoubleClick={onBodyDoubleClick}
    >
      <rect
        className={`trama-node-body ${stateClass}${isSelected ? ' is-selected' : ''}`}
        x={-halfW}
        y={-halfH}
        width={width}
        height={height}
        rx={CARD_CORNER}
        ry={CARD_CORNER}
      />
      <text className="trama-node-label" x={textX} y={labelY} textAnchor="start">
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
        const s = layout.leftPin.sockets[i];
        if (!s) return null;
        const connected = (inputMask & (1 << i)) !== 0;
        return (
          <g key={`in-${i}`}>
            <Socket cx={s.x} cy={s.y} connected={connected} />
            <circle
              className="trama-node-socket-hit"
              data-trama-slot-index={i}
              cx={s.x}
              cy={s.y}
              r={Math.max(SOCKET_SIZE, 12)}
            />
            <text
              className="trama-expression-var"
              x={s.x + 14}
              y={s.y + 4}
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
          <Socket cx={outSocket.x} cy={outSocket.y} connected={outputConnected} />
          <circle
            className="trama-node-socket-hit"
            cx={outSocket.x}
            cy={outSocket.y}
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
