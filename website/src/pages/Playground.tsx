import { useMemo, useState } from 'react';
import { TramaEditor } from '@trama/projector-web';
import { createEmptyModel, modelToDocument, serializeTrama } from '@trama/core';

function buildInitialJson(): string {
  return serializeTrama(modelToDocument(createEmptyModel()));
}

export default function Playground(): JSX.Element {
  const initialJson = useMemo(() => buildInitialJson(), []);
  const [currentJson, setCurrentJson] = useState<string>(initialJson);
  // JSON 미리보기 트리거는 별도 UI 로 옮길 예정 — state·aside 만 유지.
  const [previewOpen] = useState(false);

  return (
    <div className="trama-playground">
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
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
        }
        .trama-playground-canvas {
          position: relative;
          flex: 1;
          min-height: 0;
        }
        .trama-playground-preview {
          position: absolute;
          right: 1rem;
          top: 1rem;
          bottom: 1rem;
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
