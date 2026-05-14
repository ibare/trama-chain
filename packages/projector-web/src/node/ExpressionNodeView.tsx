import { memo, useCallback, useEffect, useState } from 'react';
import { tokens } from '@trama/tokens';
import {
  isExpressionNode,
  isNodeValid,
  type EvalDiagnosis,
  type NodeId,
} from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import {
  useFizzexRenderer,
  type FizzexMeasure,
} from '../expression/use-fizzex-renderer.js';
import { useExpressionMeasureStore } from '../expression/expression-measure-store.js';
import { NodeFrame } from './NodeFrame.js';
import { Socket } from './Socket.js';
import {
  useInputConnectionMask,
  useOutputConnected,
} from './use-socket-connections.js';
import { registerInputSocket } from '../canvas/socket-registry.js';
import { completeEdgeDraft } from '../canvas/edge-draft-actions.js';
import { getNodeLayout } from './box.js';
import { slotColor } from './slot-palette.js';

interface Props {
  id: NodeId;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);

function formatInvalidReason(d: EvalDiagnosis & { ok: false }): string {
  switch (d.status) {
    case 'unbound':
      return d.reason ?? (d.variable ? `미연결 변수: ${d.variable}` : '미연결 입력');
    case 'domain':
      return d.reason ?? '정의역 벗어남';
    case 'divergent':
      return d.reason ?? '결과가 유한하지 않음';
    case 'unsupported':
      return d.reason ?? (d.nodeType ? `미지원 노드: ${d.nodeType}` : '식 해석 실패');
    default:
      return '평가 실패';
  }
}

function ExpressionNodeViewImpl({ id }: Props): JSX.Element | null {
  const node = useModelStore((s) => s.model.nodes[id]);
  const isValid = useModelStore((s) => isNodeValid(s.executionState, id));
  const invalidReason = useModelStore((s) => s.executionState.invalidReasons[id]);
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

  // fizzex가 측정한 식의 픽셀 폭·높이. 측정 전이면 null — getNodeLayout이
  // fallback 크기 사용. 측정 후 setState로 리렌더되며 노드 bbox가 적정 크기로 펴짐.
  const [measured, setMeasured] = useState<FizzexMeasure | null>(null);
  const setStoreMeasure = useExpressionMeasureStore((s) => s.setMeasure);
  const clearStoreMeasure = useExpressionMeasureStore((s) => s.clearMeasure);
  const onMeasure = useCallback(
    (size: FizzexMeasure) => {
      setMeasured((prev) => {
        if (prev && prev.width === size.width && prev.height === size.height) return prev;
        return size;
      });
      // EdgeView가 핀 좌표를 정확히 계산하려면 동일한 측정값이 필요 — store에 흘려둔다.
      setStoreMeasure(id, size);
    },
    [id, setStoreMeasure],
  );
  // 노드가 언마운트되면 측정값 기록 제거 — stale 측정값으로 EdgeView가 잘못 계산하지 않도록.
  useEffect(() => () => clearStoreMeasure(id), [id, clearStoreMeasure]);

  // 입력 슬롯 등록 — 변수 갯수만큼. 좌표는 공통 box.ts 레이아웃을 그대로 사용해
  // EdgeView가 부르는 좌표와 어긋나지 않게 단일 출처로 둔다.
  // measured 변경 시 노드 폭이 변하므로 좌측 핀 x좌표도 따라 움직여 재등록 필요.
  useEffect(() => {
    if (!node || !isExpressionNode(node)) return;
    const layoutNow = getNodeLayout(node, {
      incomingCount: node.variables.length,
      expressionSize: measured ?? undefined,
    });
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
  }, [id, node, measured]);

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
      const layoutNow = getNodeLayout(node, {
        incomingCount: variables.length,
        expressionSize: measured ?? undefined,
      });
      const out = layoutNow.rightPin.sockets[0];
      const startPoint = out
        ? { x: pos.x + out.x, y: pos.y + out.y }
        : { x: pos.x, y: pos.y };
      startEdgeDraft({ fromNodeId: id, startPoint, pointer: startPoint, lag });
    },
    [id, isValid, measured, node, pos.x, pos.y, startEdgeDraft, variables.length],
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
      // variables는 model-store.updateNode가 fizzex.analyze 로 자동 동기화.
      updateNode(id, { latex: v }, 'update-node', '식 편집');
    }
    setEditingNode(null);
  }, [id, latexDraft, node, setEditingNode, updateNode]);

  // fizzex Canvas 렌더러를 host div의 마운트 라이프타임에 묶는다.
  // 편집/뷰 토글로 div가 remount되어도 callback ref가 새 view를 부착·재렌더.
  // render 후 getSize()를 onMeasure로 흘려보내 노드 폭·높이를 식에 맞춰 펴낸다.
  const rendererHostRef = useFizzexRenderer(
    latex,
    {
      baseFontSize: 22,
      color: tokens.color.nodeTextPrimary,
      padding: 0,
      displayMode: 'inline',
    },
    onMeasure,
  );

  if (!node || !isExpressionNode(node)) return null;

  const layout = getNodeLayout(node, {
    incomingCount: variables.length,
    expressionSize: measured ?? undefined,
  });
  const { width, height, halfW, halfH, textX, labelY } = layout;
  const isSelected = selection.kind === 'node' && selection.id === id;
  const stateClass = isValid ? 'is-calm' : 'is-low';
  const isEditing = editingNodeId === id;

  // 수식 본체 영역 — box.ts가 변수 거터·좌우 인셋을 반영해 계산해준다.
  // 측정 전이거나 fallback이면 expressionBody가 null이 될 수 없도록 box.ts에서
  // 기본값을 계산 — 항상 존재.
  const body = layout.expressionBody ?? {
    x: textX,
    y: labelY + 4,
    w: width - (textX - -halfW) * 2,
    h: halfH - (labelY + 4) - 10,
  };
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
      {!isValid && invalidReason ? (
        <title>{formatInvalidReason(invalidReason)}</title>
      ) : null}
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
        <foreignObject x={body.x} y={body.y} width={body.w} height={body.h}>
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
        <foreignObject x={body.x} y={body.y} width={body.w} height={body.h}>
          <div ref={rendererHostRef} className="trama-expression-canvas" />
        </foreignObject>
      )}

      {/* 좌측 입력 슬롯 — 변수마다 1핀. 슬롯 인덱스 = variables 배열 인덱스. */}
      {variables.map((name, i) => {
        const s = layout.leftPin.sockets[i];
        if (!s) return null;
        const connected = (inputMask & (1 << i)) !== 0;
        const color = slotColor(i, variables.length);
        return (
          <g key={`in-${i}`}>
            <Socket cx={s.x} cy={s.y} connected={connected} color={color} />
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
              style={color ? { fill: color } : undefined}
            >
              {name}
            </text>
          </g>
        );
      })}

      {/* 우측 출력 — 항상 노출. invalid일 땐 X 마크로 평가 불가를 알린다. 호버 시
          노드 전체 <title>에 사유가 뜨고, 드래그 시작은 onSocketPointerDown에서
          isValid 가드로 차단된다. */}
      <Socket cx={outSocket.x} cy={outSocket.y} connected={outputConnected} />
      {!isValid && (
        <g className="trama-socket-invalid-mark" pointerEvents="none">
          <line
            x1={outSocket.x - 4}
            y1={outSocket.y - 4}
            x2={outSocket.x + 4}
            y2={outSocket.y + 4}
          />
          <line
            x1={outSocket.x - 4}
            y1={outSocket.y + 4}
            x2={outSocket.x + 4}
            y2={outSocket.y - 4}
          />
        </g>
      )}
      <circle
        className={`trama-node-socket-hit${isValid ? '' : ' is-invalid'}`}
        cx={outSocket.x}
        cy={outSocket.y}
        r={Math.max(SOCKET_SIZE, 12)}
        onPointerDown={onSocketPointerDown}
        onPointerUp={onSocketPointerUp}
      />
    </NodeFrame>
  );
}

export const ExpressionNodeView = memo(ExpressionNodeViewImpl);
