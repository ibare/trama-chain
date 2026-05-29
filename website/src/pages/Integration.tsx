import { useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  TramaExtension,
  TRAMA_NODE_NAME,
  bootstrapTrama,
  parseTramaFenceMeta,
  renderTramaFenceHTML,
  tramaNodeToMarkdown,
} from '@trama-chain/host-tiptap';
import { createEmptyModel, modelToDocument, serializeTrama } from '@trama-chain/core';

/**
 * trama 펜스 라이브 데모용 초기 JSON — 결정적 timestamp 로 SSR/리렌더 안정.
 * createEmptyModel(0) 은 schemaVersion·execution 등 필수 필드를 모두 채운다.
 */
const INITIAL_TRAMA_JSON = serializeTrama(modelToDocument(createEmptyModel(0)));

/**
 * 데모 초기 마크다운 — Pandoc 스타일 메타로 호스트가 영속하는 캔버스 높이 시연.
 * `{height=400}` 부분이 메티/임의 호스트의 markdown-it-attrs 와 호환되는 형식.
 */
const INITIAL_MARKDOWN =
  '위 문단 — Tiptap 의 일반 텍스트.\n\n' +
  '```trama {height=400}\n' +
  INITIAL_TRAMA_JSON +
  '\n```\n\n' +
  '아래 문단 — trama 노드 뒤의 일반 텍스트.';

const SNIPPET_INSTALL = `pnpm add @trama-chain/host-tiptap-bundle`;

const SNIPPET_BOOTSTRAP = `import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  TramaExtension,
  bootstrapTrama,
  parseTramaFenceMeta,
  renderTramaFenceHTML,
} from '@trama-chain/host-tiptap-bundle';

bootstrapTrama();

// 마크다운 → HTML 단계에서 trama 펜스를 직접 변환.
// info-string \`{height=N}\` 을 파싱해 data-height attr 로 동봉하면, NodeView 가
// 마운트 시 그 값을 캔버스 초기 높이로 사용한다.
function tramaFenceToHTML(info: string, body: string): string {
  return renderTramaFenceHTML(body, parseTramaFenceMeta(info));
}

const editor = new Editor({
  element: hostEl,
  extensions: [
    StarterKit.configure({ codeBlock: false }),
    TramaExtension,
  ],
  content:
    '<p>위 문단</p>' +
    tramaFenceToHTML('{height=400}', initialJson) +
    '<p>아래 문단</p>',
});`;

const SNIPPET_MARKDOWN = `import { tramaNodeToMarkdown, TRAMA_NODE_NAME } from '@trama-chain/host-tiptap-bundle';

const parts: string[] = [];
editor.state.doc.descendants((node) => {
  if (node.type.name === TRAMA_NODE_NAME) {
    // attrs.height 가 number 면 \`{height=N}\` 으로 fence info-string 에 동봉.
    // null 이면 메타 없는 \`\`\`trama 그대로.
    const h = typeof node.attrs.height === 'number' ? node.attrs.height : undefined;
    parts.push(tramaNodeToMarkdown(node.textContent, { height: h }));
    return false;
  }
  return true;
});
const markdown = parts.join('\\n');`;

/** HTML 이스케이프 — 데모용 단순 변환에 사용. */
function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 데모용 mini markdown → Tiptap HTML 변환. trama 펜스만 인식하고 나머지는
 * 단락으로 묶는다. 실제 호스트는 markdown-it / remark 같은 본격 파서를 쓰고,
 * 그 파이프라인의 trama 분기에서만 `parseTramaFenceMeta` + `renderTramaFenceHTML`
 * 를 호출한다.
 */
function markdownToTiptapHTML(md: string): string {
  const re = /```trama([^\n]*)\n([\s\S]*?)\n```/g;
  let html = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const head = md.slice(last, m.index).trim();
    if (head) html += `<p>${escapeHTML(head)}</p>`;
    const meta = parseTramaFenceMeta(m[1] ?? '');
    html += renderTramaFenceHTML(m[2] ?? '', meta);
    last = m.index + m[0].length;
  }
  const tail = md.slice(last).trim();
  if (tail) html += `<p>${escapeHTML(tail)}</p>`;
  return html;
}

export default function Integration(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editable, setEditable] = useState(true);
  const [markdown, setMarkdown] = useState('');
  /**
   * tramaBlock 의 현재 attrs.height. 호스트가 영속하는 값으로, 사용자가 캔버스
   * 하단 핸들을 끌면 NodeView 가 트랜잭션으로 setNodeMarkup 하여 갱신한다.
   * null 이면 한 번도 리사이즈 안 된 fence — 마크다운 추출 시 메타 없이 발사.
   */
  const [currentHeight, setCurrentHeight] = useState<number | null>(null);

  const initialContent = useMemo(() => markdownToTiptapHTML(INITIAL_MARKDOWN), []);

  useEffect(() => {
    if (!hostRef.current) return;
    bootstrapTrama();
    const editor = new Editor({
      element: hostRef.current,
      extensions: [StarterKit.configure({ codeBlock: false }), TramaExtension],
      content: initialContent,
      editable: true,
    });
    editorRef.current = editor;

    // tramaBlock 의 attrs.height 를 라이브 표시. 'update' 는 트랜잭션마다 호출되어
    // 노드 attr 변화·텍스트 변화 모두를 잡는다.
    const syncHeight = (): void => {
      let h: number | null = null;
      editor.state.doc.descendants((node) => {
        if (node.type.name === TRAMA_NODE_NAME) {
          h = typeof node.attrs.height === 'number' ? node.attrs.height : null;
          return false;
        }
        return true;
      });
      setCurrentHeight(h);
    };
    editor.on('update', syncHeight);
    syncHeight();

    return () => {
      editor.off('update', syncHeight);
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
        const h = typeof node.attrs.height === 'number' ? node.attrs.height : undefined;
        parts.push(tramaNodeToMarkdown(node.textContent, { height: h }));
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
          <code>@trama-chain/host-tiptap-bundle</code>은 Tiptap 호스트가 단일 ESM 의존만으로 trama
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
            <code>bootstrapTrama()</code>는 projector-web/host-tiptap의 스코프 CSS를{' '}
            <code>head</code>에 1회 주입. idempotent.
          </li>
          <li>
            <code>StarterKit</code>의 <code>codeBlock</code>은 끄는 게 안전.{' '}
            <code>tramaBlock</code>이 <code>pre[data-trama]</code> 파싱을 가져가야 한다.
          </li>
          <li>
            <code>parseTramaFenceMeta(info)</code> 는 펜스 info-string 의 Pandoc 스타일{' '}
            <code>{'{height=N}'}</code> 을 파싱해 <code>{'{ height }'}</code> 객체로 반환.
            <code>renderTramaFenceHTML(json, meta)</code> 가 그 값을 <code>data-height</code>{' '}
            attr 로 동봉해 NodeView 가 초기 캔버스 높이로 사용한다.
          </li>
        </ul>
      </section>

      <section className="trama-integration-section">
        <h2>3. 마크다운 추출</h2>
        <pre className="trama-code">{SNIPPET_MARKDOWN}</pre>
        <p className="trama-note">
          호스트의 markdown-it / remark <code>toMarkdown</code> 훅에서도 같은 방식으로 노드를 찾아{' '}
          <code>tramaNodeToMarkdown(text, {'{ height }'})</code> 으로 펜스를 만들면 된다.
          attrs.height 가 null(한 번도 안 건드린 fence) 이면 메타 없이 깔끔하게 발사.
        </p>
      </section>

      <section className="trama-integration-section">
        <h2>라이브 데모</h2>
        <p className="trama-note">
          아래 영역은 실제로 <code>@trama-chain/host-tiptap</code>을 임베드한 Tiptap 에디터. 가운데
          노드를 클릭/드래그/편집하고, 위·아래 문단도 같이 살아 있는지 확인하면 된다.
        </p>
        <p className="trama-note">
          캔버스 하단 가장자리를 끌어 높이를 조절하면 <code>tramaBlock</code> 의{' '}
          <code>attrs.height</code> 가 갱신된다 — 우상단 라이브 표시로 확인. 「마크다운 추출」을
          누르면 <code>{'```trama {height=N}'}</code> 형태로 펜스 info-string 에 메타가 동봉되어
          round-trip 된다.
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
            <span className="trama-tool-status">
              attrs.height:{' '}
              <strong>{currentHeight != null ? `${currentHeight} px` : '— (메타 없음)'}</strong>
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
          gap: 0.75rem;
          align-items: center;
          padding: 0.625rem 1rem;
          border-bottom: 1px solid var(--trama-border);
          background: var(--trama-bg-soft);
          flex-wrap: wrap;
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
        .trama-tool-status + .trama-tool-status { margin-left: 0; }
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
        /* Tiptap ProseMirror 의 contenteditable 기본 포커스 outline 제거. */
        .trama-integration-host .ProseMirror,
        .trama-integration-host .ProseMirror:focus,
        .trama-integration-host .ProseMirror-focused {
          outline: none;
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
