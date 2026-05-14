import { Link } from 'react-router-dom';

interface ConceptItem {
  id: string;
  title: string;
  body: JSX.Element;
}

const items: ReadonlyArray<ConceptItem> = [
  {
    id: 'shape',
    title: 'Shape — 함수의 모양',
    body: (
      <>
        <p>
          엣지마다 <strong>shape</strong>이 붙는다. 비례·역치·체감·가속·골짜기·확률 등 함수 카테고리별
          shape이 17개 이상 제공되고, 각 shape은 자체 직접 조작 편집기를 갖는다. 모양을 바꾸면 결과가
          즉시 다음 노드로 전파된다.
        </p>
        <p>
          shape의 정의역과 치역(<code>domain.range</code>)은 노드의 단위(<code>unit</code>)에 역제안을
          넣을 수 있다. 스킨은 단위 도메인의 전문가다.
        </p>
      </>
    ),
  },
  {
    id: 'edges',
    title: '두 종류의 엣지',
    body: (
      <>
        <p>
          하나의 그래프가 정적·동적·확률 시뮬레이션을 통합 표현한다.
        </p>
        <ul>
          <li>
            <strong>일반 엣지 <code>lag = 0</code></strong> — 같은 timestep 안에서{' '}
            source → target. 모든 일반 엣지는 instantaneous DAG.
          </li>
          <li>
            <strong>Feedback 엣지 <code>lag = 1</code></strong> — 다음 timestep의 target으로 전달.
            시간 차원에서 사이클이 가능. Feedback이 없으면 N 컨트롤은 자동 숨겨진다.
          </li>
        </ul>
        <p>
          <code>N = 1</code>이면 단일 정적 전파, <code>N &gt; 1</code>이고 feedback이 있으면 의미
          있는 시간 진화 또는 stochastic process.
        </p>
      </>
    ),
  },
  {
    id: 'value-constant',
    title: '값 노드와 상수 노드',
    body: (
      <>
        <p>
          <strong>값 노드(Value)</strong>는 사용자가 조작하는 변수다. 단위(unit)와 초기값을 갖고,
          shape 엣지로 다른 값을 만든다.
        </p>
        <p>
          <strong>상수 노드(Constant)</strong>는 변하지 않는 수치 — π·e·중력가속도 같은 것. 식 노드가
          상수를 받을 때도 자동 바인딩이 아니라 명시적인 <em>ConstantNode 엣지</em>로 연결되어야
          한다. 그래프에 무엇이 들어와 있는지 사용자가 그린 것만으로 결정된다는 첫 번째 결정의 직접
          결과.
        </p>
      </>
    ),
  },
  {
    id: 'expression-combiner',
    title: '식 노드와 결합기',
    body: (
      <>
        <p>
          한 값에 들어오는 입력이 여러 개면 어떻게 합칠지를 명시해야 한다. 트라마는 두 가지 방식을
          제공한다.
        </p>
        <ul>
          <li>
            <strong>Combiner</strong> — <code>sum</code>, <code>product</code>, <code>min</code>,
            <code>max</code> 같은 사전 정의된 결합 규칙. 노드의 입력 결합 모드로 선택.
          </li>
          <li>
            <strong>Expression Node</strong> — fizzex 기반 식 노드. 다이어그램 위에 직접 수식을 쓰고,
            식 안의 자유 변수를 다른 노드와 엣지로 묶는다.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'serialization',
    title: '마크다운 직렬화',
    body: (
      <>
        <p>
          UI는 모델을 만드는 한 가지 표면일 뿐이다. 모든 모델은 마크다운 코드 펜스(<code>```trama</code>)
          안의 JSON으로 저장·전송된다.
        </p>
        <ul>
          <li>파싱: <code>JSON.parse</code> + Zod 스키마 검증</li>
          <li>직렬화: stable key ordering으로 round-trip 결정성 보장</li>
          <li>손으로 편집할 일은 없지만 <em>읽을 수 있고 파싱 가능하고 임베드 가능</em>해야 함</li>
        </ul>
        <p>
          fizzex, aperi21, oon, depix, FACET과 같은 마크다운 펜스 + DSL 계열에 속한다.
        </p>
      </>
    ),
  },
  {
    id: 'projector',
    title: 'Projector 패턴',
    body: (
      <>
        <p>
          도메인 로직은 React에 의존하지 않는다. 같은 JSON을 여러 표면이 각자의 방식으로 렌더링한다.
        </p>
        <table className="trama-table">
          <thead>
            <tr>
              <th>패키지</th>
              <th>역할</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>@trama/core</code>
              </td>
              <td>모델·함수·실행·단위·스키마. React 비의존.</td>
            </tr>
            <tr>
              <td>
                <code>@trama/tokens</code>
              </td>
              <td>JSON 토큰 → TS 상수 + 스코프 CSS. 글로벌 <code>:root</code>에 절대 깔지 않음.</td>
            </tr>
            <tr>
              <td>
                <code>@trama/projector-web</code>
              </td>
              <td>풀 캔버스 인터랙티브 편집기.</td>
            </tr>
            <tr>
              <td>
                <code>@trama/projector-embed</code>
              </td>
              <td>정적 읽기 전용 임베드.</td>
            </tr>
            <tr>
              <td>
                <code>@trama/host-tiptap</code>
              </td>
              <td>Tiptap 노드 확장 — <code>tramaBlock</code> 펜스를 NodeView로.</td>
            </tr>
            <tr>
              <td>
                <code>@trama/host-tiptap-bundle</code>
              </td>
              <td>위 셋을 단일 ESM으로 묶은 산출물. 외부 호스트가 file: tarball로 소비.</td>
            </tr>
          </tbody>
        </table>
        <p>
          토큰을 스코프된 CSS 변수로만 노출하는 이유: Trama가 들어가는 외부 페이지의 Tailwind·CSS와
          충돌·간섭하지 않기 위함.
        </p>
      </>
    ),
  },
];

export default function Concepts(): JSX.Element {
  return (
    <article className="trama-doc">
      <header className="trama-doc-header">
        <h1>개념</h1>
        <p>
          트라마를 이해하는 데 필요한 핵심 어휘들. 더 깊은 사용법은{' '}
          <Link to="/playground">플레이그라운드</Link>에서 직접 만져보면서.
        </p>
      </header>

      <nav className="trama-doc-toc">
        {items.map((it) => (
          <a key={it.id} href={`#${it.id}`}>
            {it.title}
          </a>
        ))}
      </nav>

      <div className="trama-doc-body">
        {items.map((it) => (
          <section key={it.id} id={it.id}>
            <h2>{it.title}</h2>
            {it.body}
          </section>
        ))}
      </div>

      <style>{`
        .trama-doc {
          max-width: 880px;
          margin: 0 auto;
          padding: 4rem 1.5rem 6rem;
        }
        .trama-doc-header h1 {
          font-size: 2.25rem;
          letter-spacing: -0.015em;
          margin: 0 0 0.75rem;
        }
        .trama-doc-header p { color: var(--trama-fg-soft); margin: 0 0 2.5rem; }
        .trama-doc-toc {
          background: var(--trama-bg-soft);
          border: 1px solid var(--trama-border);
          border-radius: var(--trama-radius);
          padding: 1rem 1.25rem;
          margin-bottom: 3rem;
          display: grid;
          gap: 0.375rem;
          font-size: 0.9375rem;
        }
        .trama-doc-toc a { color: var(--trama-fg-soft); }
        .trama-doc-toc a:hover { color: var(--trama-fg); }
        .trama-doc-body section { margin-bottom: 3rem; scroll-margin-top: 5rem; }
        .trama-doc-body h2 {
          font-size: 1.5rem;
          margin: 0 0 1rem;
          letter-spacing: -0.005em;
        }
        .trama-doc-body p, .trama-doc-body li { color: var(--trama-fg-soft); }
        .trama-doc-body strong { color: var(--trama-fg); }
        .trama-doc-body ul { padding-left: 1.25rem; }
        .trama-doc-body ul li { margin-bottom: 0.5rem; }
        .trama-doc-body code {
          background: var(--trama-bg-soft);
          padding: 0.0625rem 0.375rem;
          border-radius: 4px;
          font-size: 0.875em;
        }
        .trama-table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.9375rem;
        }
        .trama-table th, .trama-table td {
          padding: 0.625rem 0.75rem;
          border-bottom: 1px solid var(--trama-border);
          text-align: left;
          vertical-align: top;
        }
        .trama-table th {
          background: var(--trama-bg-soft);
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--trama-fg-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .trama-table td:first-child { width: 30%; white-space: nowrap; }
      `}</style>
    </article>
  );
}
