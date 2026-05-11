import { useNavigate } from 'react-router-dom';
import { loadIndex, removeModel } from '../storage.js';

export function ModelList(): JSX.Element {
  const navigate = useNavigate();
  const entries = loadIndex();

  return (
    <div data-trama-root style={{ width: '100vw', height: '100vh', overflow: 'auto' }}>
      <div style={{ maxWidth: 720, margin: '64px auto', padding: '0 24px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--typography-font-serif-question)', fontSize: 'var(--typography-text-question)', margin: 0 }}>
            나의 모델들
          </h1>
          <button
            type="button"
            className="trama-picker-card-label"
            onClick={() => navigate('/new')}
            style={{
              background: 'var(--color-node-fill-focal)',
              border: '1px solid var(--color-node-stroke-focal)',
              borderRadius: 'var(--spacing-radius-pill)',
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            새 모델
          </button>
        </header>
        {entries.length === 0 ? (
          <div className="trama-empty-hint" style={{ textAlign: 'center', padding: 48 }}>
            아직 모델이 없습니다. <span style={{ color: 'var(--color-node-stroke-focal)' }}>새 모델</span>로 시작해보세요.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
            {entries.map((e) => (
              <li
                key={e.id}
                style={{
                  padding: 16,
                  background: 'var(--color-node-fill-calm)',
                  borderRadius: 'var(--spacing-radius-card)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/m/${e.id}`)}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontFamily: 'var(--typography-font-serif-question)', fontSize: '1.125rem' }}>
                    {e.question ?? '제목 없는 모델'}
                  </div>
                  <div className="trama-empty-hint">
                    {new Date(e.updatedAt).toLocaleString('ko-KR')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (confirm('이 모델을 삭제할까요?')) {
                      removeModel(e.id);
                      navigate(0);
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-hint)',
                    cursor: 'pointer',
                    fontSize: 'var(--typography-text-hint)',
                  }}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
