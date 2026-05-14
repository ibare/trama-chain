import { Link } from 'react-router-dom';

const SAMPLE_FENCE = `\`\`\`trama
{
  "nodes": {
    "n1": { "kind": "value", "label": "노력", "unit": "rating-10", "value": 5 },
    "n2": { "kind": "value", "label": "성과", "unit": "rating-10", "value": 0 }
  },
  "edges": {
    "e1": {
      "from": "n1", "to": "n2",
      "shape": "diminishing-returns",
      "lag": 0
    }
  },
  "settings": { "timestepN": 1 }
}
\`\`\``;

const SNIPPET_INSTALL = `pnpm add @trama/host-tiptap-bundle`;
const SNIPPET_USE = `import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  TramaExtension,
  bootstrapTrama,
} from '@trama/host-tiptap-bundle';

bootstrapTrama();

new Editor({
  element: hostEl,
  extensions: [
    StarterKit.configure({ codeBlock: false }),
    TramaExtension,
  ],
});`;

export default function Home(): JSX.Element {
  return (
    <div className="trama-home">
      <section className="trama-hero">
        <div className="trama-hero-inner">
          <p className="trama-hero-tag">관계를 함수 형태로</p>
          <h1>
            변수 사이의 관계를
            <br />
            <em>함수의 모양</em>으로 그린다.
          </h1>
          <p className="trama-hero-lead">
            다른 그래프 도구는 +/− 극성으로 끝낸다. Trama는 비례·역치·체감·가속·골짜기·확률 등
            함수 카테고리별 <strong>shape</strong>을 직접 조작 편집기로 제공하고, 사용자가 모양을
            바꾸면 결과가 즉시 전파된다.
          </p>
          <div className="trama-hero-cta">
            <Link to="/playground" className="trama-btn trama-btn-primary">
              플레이그라운드 열기
            </Link>
            <Link to="/concepts" className="trama-btn">
              개념 보기
            </Link>
            <a
              className="trama-btn"
              href="https://github.com/ibare/trama"
              target="_blank"
              rel="noreferrer noopener"
            >
              GitHub
            </a>
          </div>
        </div>
      </section>

      <section className="trama-section">
        <h2>다섯 가지 결정</h2>
        <p className="trama-section-lead">
          이 다섯을 위반하는 기능은 추가하지 않는다.
        </p>
        <ol className="trama-five">
          <li>
            <strong>자동 추론 없음.</strong> 도구는 사용자가 명시적으로 그린 것만 다룬다.
          </li>
          <li>
            <strong>함수의 형태가 핵심 인지 노동.</strong> +/− 극성이 아니라 모양으로 표현한다.
          </li>
          <li>
            <strong>물성 시각화.</strong> 값 변화는 데이터 시각화가 아니라 물건이 반응하는 모습이다.
          </li>
          <li>
            <strong>관점의 다양성 존중.</strong> 같은 상황을 다르게 모델링하는 게 정상이다.
          </li>
          <li>
            <strong>시각적 아름다움은 비협상.</strong>
          </li>
        </ol>
      </section>

      <section className="trama-section trama-section-soft">
        <h2>한 그래프, 두 종류의 엣지</h2>
        <p className="trama-section-lead">
          같은 모델 안에서 정적·동적·확률 시뮬레이션을 통합 표현한다.
        </p>
        <div className="trama-edge-grid">
          <article className="trama-card">
            <h3>일반 엣지 <code>lag = 0</code></h3>
            <p>같은 timestep 안에서 source → target. 모든 일반 엣지는 instantaneous DAG.</p>
          </article>
          <article className="trama-card">
            <h3>Feedback 엣지 <code>lag = 1</code></h3>
            <p>다음 timestep의 target으로 전달. 시간 차원에서 사이클이 가능. Feedback이 없으면 N 컨트롤은 자동 숨김.</p>
          </article>
        </div>
      </section>

      <section className="trama-section">
        <h2>마크다운으로 직렬화</h2>
        <p className="trama-section-lead">
          UI는 모델을 만드는 한 가지 표면일 뿐. 모든 모델은 <code>```trama</code> 펜스 안의 JSON으로
          저장·전송·임베드된다.
        </p>
        <pre className="trama-code">{SAMPLE_FENCE}</pre>
        <p className="trama-section-foot">
          fizzex(수식), aperi21(물리), oon(화성학), depix(다이어그램), FACET(소프트웨어 공학)과 같은
          마크다운 펜스 + DSL 계열에 속한다.
        </p>
      </section>

      <section className="trama-section trama-section-soft">
        <h2>호스트 에디터에 임베드</h2>
        <p className="trama-section-lead">
          <code>@trama/host-tiptap-bundle</code> 하나만 추가하면 Tiptap 문서 안에 <code>```trama</code>{' '}
          펜스가 자동으로 인터랙티브 노드로 마운트된다.
        </p>
        <div className="trama-snippet-grid">
          <div>
            <h4>설치</h4>
            <pre className="trama-code">{SNIPPET_INSTALL}</pre>
          </div>
          <div>
            <h4>Tiptap에 등록</h4>
            <pre className="trama-code">{SNIPPET_USE}</pre>
          </div>
        </div>
        <p className="trama-section-foot">
          상세 가이드는 <Link to="/integration">통합 페이지</Link>에서.
        </p>
      </section>

      <section className="trama-section trama-cta-section">
        <h2>지금 시작하기</h2>
        <div className="trama-hero-cta">
          <Link to="/playground" className="trama-btn trama-btn-primary">
            플레이그라운드
          </Link>
          <Link to="/examples" className="trama-btn">
            예제 갤러리
          </Link>
          <Link to="/api" className="trama-btn">
            API 레퍼런스
          </Link>
        </div>
      </section>

      <style>{`
        .trama-home { color: var(--trama-fg); }
        .trama-hero {
          padding: 6rem 1.5rem 5rem;
          background: linear-gradient(180deg, var(--trama-bg) 0%, var(--trama-bg-soft) 100%);
          border-bottom: 1px solid var(--trama-border);
        }
        .trama-hero-inner {
          max-width: 880px;
          margin: 0 auto;
          text-align: center;
        }
        .trama-hero-tag {
          font-size: 0.875rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--trama-accent);
          margin: 0 0 1rem;
        }
        .trama-hero h1 {
          font-size: clamp(2rem, 5vw, 3.5rem);
          line-height: 1.15;
          letter-spacing: -0.02em;
          margin: 0 0 1.5rem;
          color: var(--trama-fg);
        }
        .trama-hero h1 em {
          font-style: normal;
          color: var(--trama-accent);
        }
        .trama-hero-lead {
          font-size: 1.0625rem;
          color: var(--trama-fg-soft);
          max-width: 640px;
          margin: 0 auto 2rem;
        }
        .trama-hero-cta {
          display: flex;
          justify-content: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .trama-btn {
          padding: 0.625rem 1.25rem;
          border-radius: var(--trama-radius-pill);
          border: 1px solid var(--trama-border-strong);
          background: var(--trama-bg);
          color: var(--trama-fg);
          font-size: 0.9375rem;
        }
        .trama-btn:hover {
          background: var(--trama-fg);
          color: var(--trama-bg);
          text-decoration: none;
        }
        .trama-btn-primary {
          background: var(--trama-fg);
          color: var(--trama-bg);
          border-color: var(--trama-fg);
        }
        .trama-btn-primary:hover {
          background: var(--trama-accent);
          border-color: var(--trama-accent);
        }
        .trama-section {
          max-width: 880px;
          margin: 0 auto;
          padding: 4rem 1.5rem;
        }
        .trama-section-soft {
          max-width: none;
          background: var(--trama-bg-soft);
          border-block: 1px solid var(--trama-border);
        }
        .trama-section-soft > * {
          max-width: 880px;
          margin-inline: auto;
        }
        .trama-section h2 {
          font-size: 1.75rem;
          letter-spacing: -0.01em;
          margin: 0 0 0.5rem;
        }
        .trama-section-lead {
          color: var(--trama-fg-soft);
          margin: 0 0 2rem;
        }
        .trama-section-foot {
          color: var(--trama-fg-muted);
          font-size: 0.9375rem;
          margin: 1.25rem 0 0;
        }
        .trama-five {
          margin: 0;
          padding-left: 1.25rem;
          display: grid;
          gap: 0.75rem;
        }
        .trama-five li { color: var(--trama-fg-soft); }
        .trama-five li strong { color: var(--trama-fg); margin-right: 0.25rem; }
        .trama-edge-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1rem;
        }
        .trama-card {
          background: var(--trama-bg);
          border: 1px solid var(--trama-border);
          border-radius: var(--trama-radius);
          padding: 1.25rem 1.5rem;
        }
        .trama-card h3 {
          margin: 0 0 0.5rem;
          font-size: 1.0625rem;
        }
        .trama-card code {
          font-size: 0.8125rem;
          color: var(--trama-fg-muted);
          background: var(--trama-bg-soft);
          padding: 0.0625rem 0.375rem;
          border-radius: 4px;
          margin-left: 0.25rem;
        }
        .trama-card p { color: var(--trama-fg-soft); margin: 0; font-size: 0.9375rem; }
        .trama-code {
          margin: 0;
          padding: 1.25rem 1.5rem;
          background: var(--trama-bg-strong);
          color: var(--trama-fg-inverse);
          border-radius: var(--trama-radius);
          font-size: 0.8125rem;
          line-height: 1.55;
          overflow-x: auto;
          white-space: pre;
        }
        .trama-snippet-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
        }
        @media (min-width: 760px) {
          .trama-snippet-grid { grid-template-columns: 1fr 1.4fr; }
        }
        .trama-snippet-grid h4 {
          margin: 0 0 0.5rem;
          font-size: 0.875rem;
          color: var(--trama-fg-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .trama-cta-section { text-align: center; padding-bottom: 6rem; }
      `}</style>
    </div>
  );
}
