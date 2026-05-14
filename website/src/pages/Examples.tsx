import { Link } from 'react-router-dom';

interface ExampleItem {
  id: string;
  title: string;
  summary: string;
  fence: string;
}

const examples: ReadonlyArray<ExampleItem> = [
  {
    id: 'linear',
    title: '비례 — 가장 단순한 모델',
    summary:
      '두 값 노드를 일반 엣지(lag=0)로 잇고 linear shape으로 비례 관계를 만든다. timestepN=1.',
    fence: `\`\`\`trama
{
  "nodes": {
    "n_in":  { "kind": "value", "label": "노력", "unit": "rating-10", "value": 5 },
    "n_out": { "kind": "value", "label": "성과", "unit": "rating-10", "value": 0 }
  },
  "edges": {
    "e1": { "from": "n_in", "to": "n_out", "shape": "linear", "lag": 0 }
  },
  "settings": { "timestepN": 1 }
}
\`\`\``,
  },
  {
    id: 'diminishing',
    title: '체감 — 동일한 입력에 출력이 둔화',
    summary:
      'diminishing-returns shape으로 한계 효용을 모델링. 입력이 커질수록 출력 증가폭이 줄어든다.',
    fence: `\`\`\`trama
{
  "nodes": {
    "n_in":  { "kind": "value", "label": "투입 시간", "unit": "hours-24", "value": 4 },
    "n_out": { "kind": "value", "label": "이해도",     "unit": "rating-10", "value": 0 }
  },
  "edges": {
    "e1": { "from": "n_in", "to": "n_out", "shape": "diminishing-returns", "lag": 0 }
  },
  "settings": { "timestepN": 1 }
}
\`\`\``,
  },
  {
    id: 'feedback',
    title: 'Feedback — 시간 진화',
    summary:
      'Feedback 엣지(lag=1)로 자기 자신에게 되먹임. N>1로 두면 단계별로 값이 어떻게 진화하는지 시뮬레이션된다.',
    fence: `\`\`\`trama
{
  "nodes": {
    "x": { "kind": "value", "label": "x", "unit": "rating-10", "value": 1 }
  },
  "edges": {
    "fb": { "from": "x", "to": "x", "shape": "linear", "lag": 1 }
  },
  "settings": { "timestepN": 8 }
}
\`\`\``,
  },
  {
    id: 'expression',
    title: '식 노드 + 상수 노드',
    summary:
      '식 노드(fizzex 기반)와 상수 노드를 ConstantNode 엣지로 연결. 식 안의 자유 변수가 그래프 위의 다른 노드와 묶인다.',
    fence: `\`\`\`trama
{
  "nodes": {
    "r":   { "kind": "value",    "label": "r",  "unit": "ratio-1", "value": 0.5 },
    "pi":  { "kind": "constant", "label": "π",  "value": 3.141592 },
    "area":{ "kind": "expression", "expr": "pi * r^2" }
  },
  "edges": {
    "e1": { "from": "r",  "to": "area", "as": "r",  "lag": 0 },
    "e2": { "from": "pi", "to": "area", "as": "pi", "lag": 0 }
  },
  "settings": { "timestepN": 1 }
}
\`\`\``,
  },
];

export default function Examples(): JSX.Element {
  return (
    <article className="trama-examples">
      <header className="trama-examples-header">
        <h1>예제</h1>
        <p>
          몇 가지 대표 패턴. 각 펜스는 그대로 마크다운에 붙여 넣어 호스트(예: Tiptap × trama)에서
          렌더링하거나, <Link to="/playground">플레이그라운드</Link>에서 직접 만들어볼 수 있다.
        </p>
      </header>

      <div className="trama-examples-list">
        {examples.map((ex) => (
          <section key={ex.id} className="trama-example-card">
            <header>
              <h2>{ex.title}</h2>
            </header>
            <p>{ex.summary}</p>
            <pre className="trama-example-fence">{ex.fence}</pre>
          </section>
        ))}
      </div>

      <aside className="trama-examples-note">
        <strong>예제 갤러리는 계속 확장됩니다.</strong> 모델 직렬화는 결정성을 보장하므로, 더 많은
        패턴이 정착되면 이 페이지가 인터랙티브 카드로 진화합니다.
      </aside>

      <style>{`
        .trama-examples {
          max-width: 960px;
          margin: 0 auto;
          padding: 4rem 1.5rem 6rem;
        }
        .trama-examples-header h1 {
          font-size: 2.25rem;
          margin: 0 0 0.75rem;
          letter-spacing: -0.015em;
        }
        .trama-examples-header p {
          color: var(--trama-fg-soft);
          margin: 0 0 2.5rem;
        }
        .trama-examples-list {
          display: grid;
          gap: 1.25rem;
        }
        .trama-example-card {
          background: var(--trama-bg);
          border: 1px solid var(--trama-border);
          border-radius: var(--trama-radius);
          padding: 1.5rem;
        }
        .trama-example-card h2 {
          margin: 0 0 0.5rem;
          font-size: 1.125rem;
        }
        .trama-example-card p {
          color: var(--trama-fg-soft);
          margin: 0 0 1rem;
          font-size: 0.9375rem;
        }
        .trama-example-fence {
          margin: 0;
          padding: 1rem 1.25rem;
          background: var(--trama-bg-strong);
          color: var(--trama-fg-inverse);
          border-radius: var(--trama-radius);
          font-size: 0.75rem;
          line-height: 1.55;
          overflow-x: auto;
        }
        .trama-examples-note {
          margin-top: 2.5rem;
          padding: 1rem 1.25rem;
          background: var(--trama-bg-soft);
          border-left: 3px solid var(--trama-accent);
          border-radius: 0 var(--trama-radius) var(--trama-radius) 0;
          color: var(--trama-fg-soft);
          font-size: 0.9375rem;
        }
        .trama-examples-note strong { color: var(--trama-fg); }
      `}</style>
    </article>
  );
}
