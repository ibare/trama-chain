/**
 * /sandbox/tiptap — @trama/host-tiptap 통합 검증 라우트.
 *
 * 검증 항목 (Step 4 체크리스트):
 *  1. trama fence HTML → Tiptap document로 parseHTML 진입 (initialContent 마운트)
 *  2. NodeView가 TramaEditor를 마운트하고 JSON을 textContent에서 읽음
 *  3. 내부 편집이 onChange → writeBack → ProseMirror tr.replaceWith 경로로 흐름
 *  4. "마크다운 추출" 버튼이 doc.descendants로 tramaBlock을 찾아 ```trama 펜스로
 *     직렬화 — 호스트 측 직렬화기가 해야 할 일과 동등
 *  5. "readOnly 토글"이 editor.setEditable + NodeView setEditable로 깊이까지
 *     전파되어 trama 안쪽 mutator까지 모두 잠김
 *  6. "외부 setJson" 버튼이 textContent를 직접 갈아끼우고 NodeView update가
 *     setJson을 통해 React에 반영
 *
 * 본 라우트는 메티 호스트의 동작을 흉내내며, 메티 측 패치 없이도 단독으로
 * round-trip을 검증할 수 있다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  TramaExtension,
  TRAMA_NODE_NAME,
  renderTramaFenceHTML,
  tramaNodeToMarkdown,
} from '@trama/host-tiptap';

const SAMPLE_JSON = JSON.stringify(
  {
    id: 'mdl-sandbox',
    question: 'tiptap 샌드박스 테스트',
    nodes: [],
    edges: [],
  },
  null,
  2,
);

const ALT_JSON = JSON.stringify(
  {
    id: 'mdl-sandbox',
    question: '외부 setJson 적용 후',
    nodes: [],
    edges: [],
  },
  null,
  2,
);

export function TiptapSandboxRoute(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editable, setEditable] = useState(true);
  const [markdown, setMarkdown] = useState('');

  const initialContent = useMemo(
    () =>
      `<p>위/아래는 일반 문단. 가운데가 <code>tramaBlock</code> NodeView로 마운트되어야 한다.</p>` +
      renderTramaFenceHTML(SAMPLE_JSON) +
      `<p>아래 문단도 함께 살아 있다.</p>`,
    [],
  );

  useEffect(() => {
    if (!hostRef.current) return;
    const editor = new Editor({
      element: hostRef.current,
      extensions: [
        StarterKit.configure({
          // tramaBlock의 parseHTML이 pre[data-trama]를 잡아야 하므로 starter-kit의
          // codeBlock과의 우선순위 분쟁을 차단한다.
          codeBlock: false,
        }),
        TramaExtension,
      ],
      content: initialContent,
      editable: true,
    });
    editorRef.current = editor;
    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, [initialContent]);

  const onToggleEditable = (): void => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = !editable;
    editor.setEditable(next);
    setEditable(next);
  };

  const onExtractMarkdown = (): void => {
    const editor = editorRef.current;
    if (!editor) return;
    // 호스트가 해야 할 일과 동일한 직렬화: doc.descendants로 tramaBlock을 찾아
    // textContent를 펜스로 감싼다. (실제 메티 통합에서는 markdown-it/remark의
    // toMarkdown 훅에서 동일 처리.)
    const parts: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === TRAMA_NODE_NAME) {
        parts.push(tramaNodeToMarkdown(node.textContent));
        return false; // tramaBlock 내부는 더 안 들어감
      }
      return true;
    });
    setMarkdown(parts.join('\n'));
  };

  const onSwapJson = (): void => {
    const editor = editorRef.current;
    if (!editor) return;
    // 외부 변경 시뮬레이션: 첫 번째 tramaBlock 노드의 textContent를 ALT_JSON으로
    // 치환한다. NodeView.update가 setJson을 호출해야 함.
    const { state, view } = editor;
    let from = -1;
    let to = -1;
    state.doc.descendants((node, pos) => {
      if (from !== -1) return false;
      if (node.type.name === TRAMA_NODE_NAME) {
        from = pos + 1;
        to = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });
    if (from === -1) return;
    const tr = state.tr.replaceWith(from, to, state.schema.text(ALT_JSON));
    view.dispatch(tr);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid #cdc6b8',
          background: '#f6f3ec',
          fontFamily: 'inherit',
        }}
      >
        <strong style={{ marginRight: 16 }}>Tiptap × trama 샌드박스</strong>
        <button type="button" onClick={onToggleEditable} style={btn}>
          {editable ? '읽기 전용으로 전환' : '편집 모드로 전환'}
        </button>
        <button type="button" onClick={onExtractMarkdown} style={btn}>
          마크다운 추출
        </button>
        <button type="button" onClick={onSwapJson} style={btn}>
          외부 setJson 적용
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7a7060' }}>
          editable: <strong>{String(editable)}</strong>
        </span>
      </header>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>
        <div
          ref={hostRef}
          className="tiptap-sandbox-host"
          style={{
            overflow: 'auto',
            padding: 24,
            background: '#fffdf7',
            borderRight: '1px solid #cdc6b8',
          }}
        />
        <pre
          style={{
            margin: 0,
            padding: 24,
            overflow: 'auto',
            background: '#1f1d18',
            color: '#f1e8d2',
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {markdown || '// "마크다운 추출" 버튼을 누르세요'}
        </pre>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: 'white',
  border: '1px solid #a89e8c',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
