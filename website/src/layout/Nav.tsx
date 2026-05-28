import { NavLink } from 'react-router-dom';

const items: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/concepts', label: '개념' },
  { to: '/playground', label: '플레이그라운드' },
  { to: '/examples', label: '예제' },
  { to: '/integration', label: '통합' },
  { to: '/api', label: 'API' },
  { to: '/changelog', label: '변경 이력' },
];

export default function Nav(): JSX.Element {
  return (
    <nav className="trama-nav">
      <NavLink to="/" className="trama-nav-brand" end>
        Trama
      </NavLink>
      <ul className="trama-nav-list">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                'trama-nav-link' + (isActive ? ' is-active' : '')
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <a
        className="trama-nav-github"
        href="https://github.com/ibare/trama-chain"
        target="_blank"
        rel="noreferrer noopener"
      >
        GitHub
      </a>
      <style>{`
        .trama-nav {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 0.875rem 1.5rem;
          border-bottom: 1px solid var(--trama-border);
          background: var(--trama-bg-soft);
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .trama-nav-brand {
          font-weight: 700;
          font-size: 1.125rem;
          color: var(--trama-fg);
          letter-spacing: -0.01em;
        }
        .trama-nav-brand:hover { text-decoration: none; }
        .trama-nav-list {
          display: flex;
          gap: 0.25rem;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .trama-nav-link {
          padding: 0.4rem 0.75rem;
          border-radius: var(--trama-radius-pill);
          color: var(--trama-fg-soft);
          font-size: 0.9375rem;
        }
        .trama-nav-link:hover {
          background: rgba(0, 0, 0, 0.04);
          text-decoration: none;
        }
        .trama-nav-link.is-active {
          background: var(--trama-fg);
          color: var(--trama-bg);
        }
        .trama-nav-github {
          margin-left: auto;
          padding: 0.4rem 0.875rem;
          border: 1px solid var(--trama-border-strong);
          border-radius: var(--trama-radius-pill);
          font-size: 0.875rem;
          color: var(--trama-fg);
          background: var(--trama-bg);
        }
        .trama-nav-github:hover {
          background: var(--trama-fg);
          color: var(--trama-bg);
          text-decoration: none;
        }
      `}</style>
    </nav>
  );
}
