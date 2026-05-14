export default function Footer(): JSX.Element {
  return (
    <footer className="trama-footer">
      <div className="trama-footer-inner">
        <span>
          © {new Date().getFullYear()} Trama. 관계를 함수 형태로 정의하는 프레이밍 도구.
        </span>
        <div className="trama-footer-links">
          <a href="https://github.com/ibare/trama" target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
          <a href="https://github.com/ibare/trama/issues" target="_blank" rel="noreferrer noopener">
            이슈
          </a>
        </div>
      </div>
      <style>{`
        .trama-footer {
          border-top: 1px solid var(--trama-border);
          background: var(--trama-bg-soft);
          padding: 1.5rem;
          color: var(--trama-fg-muted);
          font-size: 0.875rem;
        }
        .trama-footer-inner {
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .trama-footer-links {
          display: flex;
          gap: 1rem;
        }
      `}</style>
    </footer>
  );
}
