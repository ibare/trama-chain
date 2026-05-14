import { Link } from 'react-router-dom';

export default function NotFound(): JSX.Element {
  return (
    <section className="trama-notfound">
      <h1>404</h1>
      <p>찾으시는 페이지가 없어요.</p>
      <Link to="/" className="trama-notfound-home">
        홈으로
      </Link>
      <style>{`
        .trama-notfound {
          max-width: 480px;
          margin: 0 auto;
          padding: 6rem 1.5rem;
          text-align: center;
        }
        .trama-notfound h1 {
          font-size: 4rem;
          margin: 0 0 0.5rem;
          color: var(--trama-fg-muted);
        }
        .trama-notfound p {
          color: var(--trama-fg-soft);
          margin: 0 0 2rem;
        }
        .trama-notfound-home {
          display: inline-block;
          padding: 0.5rem 1.25rem;
          border: 1px solid var(--trama-border-strong);
          border-radius: var(--trama-radius-pill);
          color: var(--trama-fg);
        }
        .trama-notfound-home:hover {
          background: var(--trama-fg);
          color: var(--trama-bg);
          text-decoration: none;
        }
      `}</style>
    </section>
  );
}
