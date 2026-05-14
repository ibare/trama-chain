import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { tokens } from '@trama/tokens';
import {
  isExpressionNode,
  isNodeValid,
  type EvalDiagnosis,
  type NodeId,
} from '@trama/core';
import {
  astToLatex,
  createStateFromLatex,
  EditorView as FizzexEditor,
  type EditorState as FizzexEditorState,
} from 'fizzex';
import { useTrama } from '../store/index.js';
import {
  useFizzexRenderer,
  type FizzexMeasure,
} from '../expression/use-fizzex-renderer.js';
import { useExpressionMeasureStore } from '../expression/expression-measure-store.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeBody } from './NodeBody.js';
import { NodeLabel } from './NodeLabel.js';
import { Socket } from './Socket.js';
import {
  useInputConnectionMask,
  useOutputConnected,
} from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';
import { useNodeLayout } from './use-node-layout.js';
import { slotColor } from './slot-palette.js';

interface Props {
  id: NodeId;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

/**
 * 식 편집기 호스트 — fizzex EditorView를 노드 안에 띄울 때 캔버스 줌·노드 드래그와
 * 이벤트가 충돌하지 않도록 격리한다. 휠은 캔버스의 native 'wheel' 리스너에 닿기 전에
 * stopPropagation으로 막고, pointerdown은 React 합성 이벤트 단계에서 막아 NodeFrame
 * 드래그가 발화하지 않게 한다. 키보드는 Cmd+Enter 커밋·Escape 취소.
 */
function EditorHost({
  children,
  onCommit,
  onCancel,
}: {
  children: React.ReactNode;
  onCommit: () => void;
  onCancel: () => void;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // 최신 onCommit을 ref로 들고 들어가 focusout 리스너가 stale 클로저로 잘못 커밋하지
  // 않게 한다. effect deps에 onCommit을 넣지 않는 이유 — 리스너 재부착이 마운트 직후
  // 발생하는 첫 focusout(IME hidden input ↔ host 사이)을 놓치게 만들 수 있다.
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const stop = (e: WheelEvent): void => {
      e.stopPropagation();
    };
    el.addEventListener('wheel', stop, { passive: true });
    // 포커스가 호스트 바깥으로 빠지면 커밋. relatedTarget이 호스트 안이면 fizzex 내부
    // 포커스 이동(canvas ↔ hidden input)이므로 무시.
    const onFocusOut = (e: FocusEvent): void => {
      const next = e.relatedTarget as Node | null;
      if (next && el.contains(next)) return;
      onCommitRef.current();
    };
    el.addEventListener('focusout', onFocusOut);
    return () => {
      el.removeEventListener('wheel', stop);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  return (
    <div
      ref={hostRef}
      className="trama-expression-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onCommit();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      {children}
    </div>
  );
}

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
  const { modelStore, uiStore, socketRegistry } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  const isValid = modelStore((s) => isNodeValid(s.executionState, id));
  const invalidReason = modelStore((s) => s.executionState.invalidReasons[id]);
  const updateNode = modelStore((s) => s.updateNode);
  const selection = uiStore((s) => s.selection);
  const editingNode = uiStore((s) => s.editingNode);
  const setEditingNode = uiStore((s) => s.setEditingNode);
  const isEditing = editingNode?.id === id;
  const editTarget = isEditing ? editingNode.target : null;
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

  const layout = useNodeLayout(node, {
    incomingCount: variables.length,
    expressionSize: measured,
  });

  // 입력 슬롯 등록 — 변수 갯수만큼. 좌표는 공통 box.ts 레이아웃을 그대로 사용해
  // EdgeView가 부르는 좌표와 어긋나지 않게 단일 출처로 둔다.
  // measured 변경 시 노드 폭이 변하므로 좌측 핀 x좌표도 따라 움직여 재등록 필요.
  useEffect(() => {
    if (!layout || !node || !isExpressionNode(node)) return;
    const varCount = node.variables.length;
    const unregs: Array<() => void> = [];
    layout.leftPin.sockets.forEach((s, i) => {
      if (i >= varCount) return;
      unregs.push(
        socketRegistry.register({
          nodeId: id,
          slotIndex: i,
          offset: { x: s.x, y: s.y },
        }),
      );
    });
    return () => unregs.forEach((u) => u());
  }, [id, layout, node, socketRegistry]);

  // 라벨(타이틀)과 식 본체는 별개의 인라인 편집기. 어느 쪽을 열었는지는 uiStore의
  // editingNode.target이 단일 진실 — 'latex'면 fizzex editor, 'label'이면 라벨 input.
  const onBodyDoubleClick = useCallback(() => {
    setEditingNode(id, 'latex');
  }, [id, setEditingNode]);

  const onLabelDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNode(id, 'label');
    },
    [id, setEditingNode],
  );

  const getOutputStartPoint = useCallback(() => {
    const out = layout?.rightPin.sockets[0];
    return out
      ? { x: pos.x + out.x, y: pos.y + out.y }
      : { x: pos.x, y: pos.y };
  }, [layout, pos.x, pos.y]);
  const { onPointerDown: onSocketPointerDown, onPointerUp: onSocketPointerUp } =
    useEdgeDraftSource(id, {
      enabled: isValid && !!layout,
      getStartPoint: getOutputStartPoint,
    });

  // 인라인 수식 편집 — fizzex EditorView. 진입 시점의 latex을 EditorState로 변환해
  // initialState로 넘기고, 편집 중 최신 상태는 ref에 박아두었다가 커밋 시 astToLatex로
  // 직렬화. LaTeX 문법을 모르는 사용자도 자동완성·키 바인딩으로 수식을 만들 수 있다.
  const editorStateRef = useRef<FizzexEditorState | null>(null);
  const [editorInitialState, setEditorInitialState] = useState<FizzexEditorState | null>(null);
  useEffect(() => {
    if (editTarget === 'latex') {
      const initial = createStateFromLatex(latex);
      editorStateRef.current = initial;
      setEditorInitialState(initial);
    } else {
      editorStateRef.current = null;
      setEditorInitialState(null);
    }
  }, [editTarget, latex]);

  const commitLatex = useCallback(() => {
    if (!node || !isExpressionNode(node)) {
      setEditingNode(null);
      return;
    }
    const state = editorStateRef.current;
    const next = state ? astToLatex(state.ast).trim() : '';
    if (next && next !== node.latex) {
      // variables는 model-store.updateNode가 fizzex.analyze 로 자동 동기화.
      updateNode(id, { latex: next });
    }
    setEditingNode(null);
  }, [id, node, setEditingNode, updateNode]);

  // 라벨(타이틀) 인라인 편집은 NodeLabel 컴포넌트가 담당. 여기선 커밋·취소 콜백만 제공.
  const commitLabel = useCallback(
    (next: string) => {
      if (node && next !== node.label) updateNode(id, { label: next });
      setEditingNode(null);
    },
    [id, node, setEditingNode, updateNode],
  );
  const cancelLabel = useCallback(() => setEditingNode(null), [setEditingNode]);

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
  if (!layout) return null;

  const { width, height, halfW, halfH, textX, labelY } = layout;
  const isSelected = selection.kind === 'node' && selection.id === id;
  const stateClass = isValid ? 'is-calm' : 'is-low';
  const isEditingLabel = editTarget === 'label';
  const isEditingLatex = editTarget === 'latex';

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
      onBodyDoubleClick={onBodyDoubleClick}
    >
      {!isValid && invalidReason ? (
        <title>{formatInvalidReason(invalidReason)}</title>
      ) : null}
      <NodeBody
        width={width}
        height={height}
        stateClass={stateClass}
        isSelected={isSelected}
      />
      <NodeLabel
        text={node.label}
        x={textX}
        y={labelY}
        width={width - (textX - -halfW) * 2}
        isEditing={isEditingLabel}
        onCommit={commitLabel}
        onCancel={cancelLabel}
        onIsolatedDoubleClick={onLabelDoubleClick}
      />

      {isEditingLatex && editorInitialState ? (
        <foreignObject x={body.x} y={body.y} width={body.w} height={body.h}>
          <EditorHost
            onCommit={commitLatex}
            onCancel={() => setEditingNode(null)}
          >
            <FizzexEditor
              initialState={editorInitialState}
              onChange={(s) => {
                editorStateRef.current = s;
              }}
              autoSize
              // body 영역을 최소 폭·높이로 — 짧은 식에서도 클릭 면적이 충분하고,
              // 식이 길어지면 autoSize가 캔버스를 더 키운다 (foreignObject 경계를
              // 넘어가도 commit 이후 view 재측정으로 노드 bbox가 따라 펴진다).
              minWidth={Math.max(140, body.w - 8)}
              minHeight={Math.max(48, body.h - 8)}
              padding={6}
              displayMode="inline"
              // LaTeX 명령어를 모르는 사용자가 분수·제곱·루트·그릭문자 등을 발견할 수
              // 있게 자동완성 칩을 노출 — 본 교체의 핵심 가치.
              showSuggestions
            />
          </EditorHost>
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
              onPointerDown={(e) => e.stopPropagation()}
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
