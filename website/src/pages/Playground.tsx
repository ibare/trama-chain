import { useMemo, useState } from 'react';
import { TramaEditor } from '@trama/projector-web';
import {
  addValueNode,
  createEmptyModel,
  modelToDocument,
  serializeTrama,
} from '@trama/core';

function buildInitialJson(): string {
  let m = createEmptyModel();
  m = { ...m, question: '플레이그라운드 — 노드를 추가하고 엣지를 그려보세요' };
  m = addValueNode(m, {
    label: '입력',
    unitId: 'rating-10',
    initialNumber: 5,
    position: { x: 360, y: 280 },
    isFocal: false,
  });
  m = addValueNode(m, {
    label: '출력',
    unitId: 'rating-10',
    initialNumber: 0,
    position: { x: 760, y: 280 },
    isFocal: true,
  });
  return serializeTrama(modelToDocument(m));
}

export default function Playground(): JSX.Element {
  const initialJson = useMemo(() => buildInitialJson(), []);
  const [currentJson, setCurrentJson] = useState<string>(initialJson);
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="trama-playground">
      <header className="trama-playground-header">
        <div>
          <h1>플레이그라운드</h1>
          <p>브라우저 안에서 동작하는 트라마 편집기. 저장은 되지 않습니다.</p>
        </div>
        <button
          type="button"
          className="trama-playground-toggle"
          onClick={() => setPreviewOpen((v) => !v)}
        >
          {previewOpen ? 'JSON 닫기' : '현재 JSON 보기'}
        </button>
      </header>

      <div className="trama-playground-canvas">
        <TramaEditor value={currentJson} onChange={setCurrentJson} />
      </div>

      {previewOpen && (
        <aside className="trama-playground-preview">
          <header>
            <strong>직렬화된 JSON</strong>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(currentJson)}
            >
              복사
            </button>
          </header>
          <pre>{currentJson}</pre>
        </aside>
      )}

      <style>{`
        .trama-playground {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 56px);
          position: relative;
        }
        .trama-playground-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--trama-border);
          background: var(--trama-bg-soft);
        }
        .trama-playground-header h1 {
          font-size: 1.25rem;
          margin: 0 0 0.125rem;
          letter-spacing: -0.005em;
        }
        .trama-playground-header p {
          margin: 0;
          color: var(--trama-fg-muted);
          font-size: 0.875rem;
        }
        .trama-playground-toggle {
          margin-left: auto;
          padding: 0.4rem 0.875rem;
          border: 1px solid var(--trama-border-strong);
          border-radius: var(--trama-radius-pill);
          background: var(--trama-bg);
          color: var(--trama-fg);
          font-size: 0.875rem;
          cursor: pointer;
        }
        .trama-playground-toggle:hover {
          background: var(--trama-fg);
          color: var(--trama-bg);
        }
        .trama-playground-canvas {
          position: relative;
          flex: 1;
          min-height: 0;
        }
        .trama-playground-preview {
          position: absolute;
          right: 1rem;
          bottom: 1rem;
          top: 5rem;
          width: min(420px, 50vw);
          background: var(--trama-bg-strong);
          color: var(--trama-fg-inverse);
          border-radius: var(--trama-radius);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          z-index: 30;
        }
        .trama-playground-preview header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.625rem 0.875rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 0.8125rem;
        }
        .trama-playground-preview header button {
          padding: 0.25rem 0.625rem;
          background: rgba(255, 255, 255, 0.1);
          color: var(--trama-fg-inverse);
          border: none;
          border-radius: 4px;
          font-size: 0.75rem;
          cursor: pointer;
        }
        .trama-playground-preview header button:hover {
          background: rgba(255, 255, 255, 0.18);
        }
        .trama-playground-preview pre {
          margin: 0;
          padding: 0.875rem;
          overflow: auto;
          font-size: 0.75rem;
          line-height: 1.5;
          flex: 1;
          white-space: pre-wrap;
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}
