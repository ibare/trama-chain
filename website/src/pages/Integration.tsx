import { useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  TramaExtension,
  TRAMA_NODE_NAME,
  bootstrapTrama,
  renderTramaFenceHTML,
  tramaNodeToMarkdown,
} from '@trama/host-tiptap';

const SAMPLE_JSON = JSON.stringify(
  {
    id: 'mdl-integration',
    question: 'Tiptap 안의 trama 노드',
    nodes: [],
    edges: [],
  },
  null,
  2,
);

const SNIPPET_INSTALL = `pnpm add @trama/host-tiptap-bundle`;

const SNIPPET_BOOTSTRAP = `import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  TramaExtension,
  bootstrapTrama,
  renderTramaFenceHTML,
} from '@trama/host-tiptap-bundle';

// 한 번만 호출 — projector-web의 스코프 CSS 주입.
bootstrapTrama();

const editor = new Editor({
  element: hostEl,
  extensions: [
    // starter-kit의 codeBlock과 우선순위 충돌을 막으려 끈다.
    StarterKit.configure({ codeBlock: false }),
    TramaExtension,
  ],
  content:
    '<p>위 문단</p>' +
    renderTramaFenceHTML(initialJson) +
    '<p>아래 문단</p>',
});`;

const SNIPPET_MARKDOWN = `import { tramaNodeToMarkdown, TRAMA_NODE_NAME } from '@trama/host-tiptap-bundle';

const parts: string[] = [];
editor.state.doc.descendants((node) => {
  if (node.type.name === TRAMA_NODE_NAME) {
    parts.push(tramaNodeToMarkdown(node.textContent));
    return false;
  }
  return true;
});
const markdown = parts.join('\\n');`;

export default function Integration(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editable, setEditable] = useState(true);
  const [markdown, setMarkdown] = useState('');

  const initialContent = useMemo(
    () =>
      `<p>아래 가운데가 <code>tramaBlock</code> NodeView로 마운트된다. 위·아래 문단은 일반 Tiptap 문서.</p>` +
      renderTramaFenceHTML(SAMPLE_JSON) +
      `<p>외부 setJson 적용, readOnly 토글, 마크다운 추출이 round-trip된다.</p>`,
    [],
  );

  useEffect(() => {
    if (!hostRef.current) return;
    bootstrapTrama();
    const editor = new Editor({
      element: hostRef.current,
      extensions: [
        StarterKit.configure({ codeBlock: false }),
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
    const parts: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === TRAMA_NODE_NAME) {
        parts.push(tramaNodeToMarkdown(node.textContent));
        return false;
      }
      return true;
    });
    setMarkdown(parts.join('\n'));
  };

  return (
    <article className="trama-integration">
      <header className="trama-integration-header">
        <h1>호스트 통합</h1>
        <p>
          <code>@trama/host-tiptap-bundle</code>은 Tiptap 호스트가 단일 ESM 의존만으로 trama
          노드를 마운트할 수 있게 한다. peer는 <code>@tiptap/core</code>,{' '}
          <code>@tiptap/pm</code>, <code>react</code>, <code>react-dom</code> 넷.
        </p>
      </header>

      <section className="trama-integration-section">
        <h2>1. 설치</h2>
        <pre className="trama-code">{SNIPPET_INSTALL}</pre>
        <p className="trama-note">
          호스트의 react·react-dom·@tiptap이 peer 범위와 맞는지 확인. trama는 React 19.x와
          Tiptap 3.x에 정렬되어 있다.
        </p>
      </section>

      <section className="trama-integration-section">
        <h2>2. Tiptap 에디터에 등록</h2>
        <pre className="trama-code">{SNIPPET_BOOTSTRAP}</pre>
        <ul className="trama-note-list">
          <li>
            <code>bootstrapTrama()</code>는 projector-web의 스코프 CSS를 <code>head</code>에 1회
            주입. idempotent.
          </li>
          <li>
            <code>StarterKit</code>의 <code>codeBlock</code>은 끄는 게 안전.{' '}
            <code>tramaBlock</code>이 <code>pre[data-trama]</code> 파싱을 가져가야 한다.
          </li>
          <li>
            <code>renderTramaFenceHTML(json)</code>은 펜스 본문 JSON을{' '}
            <code>&lt;pre data-trama&gt;&lt;code&gt;…&lt;/code&gt;&lt;/pre&gt;</code> 으로 만들어
            준다.
          </li>
        </ul>
      </section>

      <section className="trama-integration-section">
        <h2>3. 마크다운 추출</h2>
        <pre className="trama-code">{SNIPPET_MARKDOWN}</pre>
        <p className="trama-note">
          호스트의 markdown-it / remark <code>toMarkdown</code> 훅에서도 같은 방식으로 노드를 찾아{' '}
          <code>tramaNodeToMarkdown</code>으로 펜스를 만들면 된다.
        </p>
      </section>

      <section className="trama-integration-section">
        <h2>라이브 데모</h2>
        <p className="trama-note">
          아래 영역은 실제로 <code>@trama/host-tiptap</code>을 임베드한 Tiptap 에디터. 가운데
          노드를 클릭/드래그/편집하고, 위·아래 문단도 같이 살아 있는지 확인하면 된다.
        </p>
        <div className="trama-integration-demo">
          <div className="trama-integration-toolbar">
            <button type="button" onClick={onToggleEditable} className="trama-tool-btn">
              {editable ? '읽기 전용으로' : '편집 모드로'}
            </button>
            <button type="button" onClick={onExtractMarkdown} className="trama-tool-btn">
              마크다운 추출
            </button>
            <span className="trama-tool-status">
              editable: <strong>{String(editable)}</strong>
            </span>
          </div>
          <div className="trama-integration-grid">
            <div ref={hostRef} className="trama-integration-host" />
            <pre className="trama-integration-output">
              {markdown || '// "마크다운 추출" 버튼을 누르세요'}
            </pre>
          </div>
        </div>
      </section>

      <style>{`
        .trama-integration {
          max-width: 1080px;
          margin: 0 auto;
          padding: 4rem 1.5rem 6rem;
        }
        .trama-integration-header h1 {
          font-size: 2.25rem;
          margin: 0 0 0.75rem;
          letter-spacing: -0.015em;
        }
        .trama-integration-header p {
          color: var(--trama-fg-soft);
          margin: 0 0 2.5rem;
        }
        .trama-integration-section { margin-bottom: 3rem; }
        .trama-integration-section h2 {
          font-size: 1.375rem;
          margin: 0 0 0.75rem;
        }
        .trama-code {
          margin: 0;
          padding: 1.25rem 1.5rem;
          background: var(--trama-bg-strong);
          color: var(--trama-fg-inverse);
          border-radius: var(--trama-radius);
          font-size: 0.8125rem;
          line-height: 1.55;
          overflow-x: auto;
        }
        .trama-note {
          color: var(--trama-fg-muted);
          font-size: 0.9375rem;
          margin: 0.75rem 0 0;
        }
        .trama-note-list {
          color: var(--trama-fg-muted);
          font-size: 0.9375rem;
          margin: 0.75rem 0 0;
          padding-left: 1.25rem;
        }
        .trama-note-list li { margin-bottom: 0.375rem; }
        .trama-note code, .trama-note-list code,
        .trama-integration-header code, .trama-integration-section p code {
          background: var(--trama-bg-soft);
          padding: 0.0625rem 0.375rem;
          border-radius: 4px;
          font-size: 0.875em;
        }
        .trama-integration-demo {
          border: 1px solid var(--trama-border);
          border-radius: var(--trama-radius);
          overflow: hidden;
          margin-top: 1rem;
        }
        .trama-integration-toolbar {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          padding: 0.625rem 1rem;
          border-bottom: 1px solid var(--trama-border);
          background: var(--trama-bg-soft);
        }
        .trama-tool-btn {
          padding: 0.375rem 0.875rem;
          border: 1px solid var(--trama-border-strong);
          border-radius: var(--trama-radius-pill);
          background: var(--trama-bg);
          color: var(--trama-fg);
          font-size: 0.8125rem;
          cursor: pointer;
        }
        .trama-tool-btn:hover { background: var(--trama-fg); color: var(--trama-bg); }
        .trama-tool-status {
          margin-left: auto;
          font-size: 0.8125rem;
          color: var(--trama-fg-muted);
        }
        .trama-tool-status strong { color: var(--trama-fg); }
        .trama-integration-grid {
          display: grid;
          grid-template-columns: 1fr;
          min-height: 480px;
        }
        @media (min-width: 880px) {
          .trama-integration-grid { grid-template-columns: 1.4fr 1fr; }
        }
        .trama-integration-host {
          padding: 1.25rem;
          background: var(--trama-bg);
          overflow: auto;
          border-bottom: 1px solid var(--trama-border);
        }
        @media (min-width: 880px) {
          .trama-integration-host {
            border-bottom: none;
            border-right: 1px solid var(--trama-border);
          }
        }
        .trama-integration-output {
          margin: 0;
          padding: 1rem 1.25rem;
          background: var(--trama-bg-strong);
          color: var(--trama-fg-inverse);
          font-size: 0.75rem;
          line-height: 1.55;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }
      `}</style>
    </article>
  );
}
