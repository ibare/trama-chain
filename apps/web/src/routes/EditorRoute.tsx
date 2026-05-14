import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TramaEditor, shapeRegistry, combinerRegistry } from '@trama/projector-web';
import { documentToModel, parseTrama } from '@trama/core';
import { exportMarkdown, loadModelJson, saveModel } from '../storage.js';

export function EditorRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Step 1 검증용 임시 토글. Step 4 sandbox 통과하면 제거.
  const [readOnly, setReadOnly] = useState(false);

  const initialJson = useMemo(() => (id ? loadModelJson(id) : null), [id]);

  const onChange = useCallback(
    (json: string) => {
      try {
        const doc = parseTrama(json, { shapeRegistry, combinerRegistry });
        const m = documentToModel(doc);
        // 라우트의 id와 다른 모델은 저장하지 않는다. HMR로 store가 잠시 새 빈
        // 모델로 리셋된 상태에서 디바운스 onChange가 흘러나와도 그게 새 엔트리로
        // 박히지 않도록 막는 안전벨트.
        if (!id || m.id !== id) return;
        saveModel(m);
      } catch {
        // 잘못된 상태 — 저장 스킵
      }
    },
    [id],
  );

  const onExport = useCallback(() => {
    if (!id) return;
    const raw = loadModelJson(id);
    if (!raw) return;
    try {
      const doc = parseTrama(raw, { shapeRegistry, combinerRegistry });
      const md = exportMarkdown(documentToModel(doc));
      const filename = `${(doc.question ?? 'trama').replace(/[^a-zA-Z0-9가-힣]+/g, '-').slice(0, 40)}-${new Date()
        .toISOString()
        .slice(0, 10)}.trama.md`;
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // noop
    }
  }, [id]);

  if (!initialJson) {
    return (
      <div data-trama-root style={{ width: '100vw', height: '100vh' }}>
        <div className="trama-empty-prompt">
          <h2>모델을 찾을 수 없어요</h2>
          <button type="button" onClick={() => navigate('/')}>
            목록으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <TramaEditor initialJson={initialJson} onChange={onChange} readOnly={readOnly} />
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          gap: 8,
          zIndex: 20,
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => setReadOnly((v) => !v)}
          style={{ ...menuButton, background: readOnly ? '#e8d8b8' : menuButton.background }}
          title="읽기 전용 토글 (Step 1 검증용)"
        >
          {readOnly ? '읽기 전용 ON' : '읽기 전용 OFF'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={menuButton}
          title="모델 목록"
        >
          모델 목록
        </button>
        <button type="button" onClick={onExport} style={menuButton} title="마크다운으로 내보내기">
          내보내기
        </button>
      </div>
    </div>
  );
}

const menuButton: React.CSSProperties = {
  background: 'rgba(247, 245, 240, 0.9)',
  border: '1px solid #a89e8c',
  borderRadius: 999,
  padding: '6px 14px',
  fontSize: '0.8125rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
