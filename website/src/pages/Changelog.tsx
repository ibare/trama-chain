interface Entry {
  date: string;
  title: string;
  notes: ReadonlyArray<string>;
}

const entries: ReadonlyArray<Entry> = [
  {
    date: '2026-05',
    title: '호스트 정렬 — React 19 / Tiptap 3',
    notes: [
      '5개 패키지의 react·react-dom peer를 ^19.0.0으로, 실측 19.2.0으로 정렬 (Methii 호스트와 매칭).',
      'host-tiptap·host-tiptap-bundle peer를 ^3.22.5로 좁힘. 2.x 호환 분기 제거.',
      '@types/react@19의 글로벌 JSX 네임스페이스 제거에 대응하는 shim 도입 (패키지별 react-19-jsx-shim.d.ts).',
    ],
  },
  {
    date: '2026-05',
    title: 'host-tiptap-bundle 0.1.0',
    notes: [
      'host-tiptap + projector-web + core + fizzex를 Rollup으로 단일 ESM에 인라인한 self-contained 번들.',
      'peer는 @tiptap/core·@tiptap/pm·react·react-dom 넷. 외부 호스트가 file: tarball 하나로 trama를 통합 가능.',
      '메티 통합용 요청서 INTEGRATION-METHII.md 동봉.',
    ],
  },
  {
    date: '2026-05',
    title: 'fizzex 기반 식 노드 PoC',
    notes: [
      'ExpressionNode가 fizzex 식 평가기를 사용. 식 안의 자유 변수가 그래프 위의 다른 노드와 묶임.',
      '상수 처리는 π·e 같은 LaTeX 상수도 ConstantNode 엣지로만 — 자동 바인딩 금지 (다섯 결정 #1).',
    ],
  },
  {
    date: '2026-04',
    title: '값·상수 노드 리디자인 + 패널 통일',
    notes: [
      '노드 시각 패러다임을 정리: visuals는 wrapper <g pointer-events="none">에 격리, 인터랙티브 자식은 자체 hit-area.',
      '스킨 노드 엣지 앵커는 공통 원(circle) 보더에 정렬. 스킨 시각 silhouette과 별개의 추상.',
    ],
  },
];

export default function Changelog(): JSX.Element {
  return (
    <article className="trama-changelog">
      <header className="trama-changelog-header">
        <h1>변경 이력</h1>
        <p>
          공개적으로 의미 있는 변경의 요약. 패키지별 자세한 버전은 GitHub 태그·커밋 히스토리를 참고.
        </p>
      </header>

      <ol className="trama-changelog-list">
        {entries.map((e, i) => (
          <li key={i}>
            <header>
              <time>{e.date}</time>
              <h2>{e.title}</h2>
            </header>
            <ul>
              {e.notes.map((n, j) => (
                <li key={j}>{n}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <p className="trama-changelog-foot">
        이 페이지는 수동 큐레이션 — 의미 있는 마일스톤만. 패키지별 패치 단위 변경은 커밋 로그에 있다.
      </p>

      <style>{`
        .trama-changelog {
          max-width: 760px;
          margin: 0 auto;
          padding: 4rem 1.5rem 6rem;
        }
        .trama-changelog-header h1 {
          font-size: 2.25rem;
          margin: 0 0 0.75rem;
          letter-spacing: -0.015em;
        }
        .trama-changelog-header p {
          color: var(--trama-fg-soft);
          margin: 0 0 2.5rem;
        }
        .trama-changelog-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 1.5rem;
        }
        .trama-changelog-list > li {
          background: var(--trama-bg);
          border: 1px solid var(--trama-border);
          border-radius: var(--trama-radius);
          padding: 1.25rem 1.5rem;
        }
        .trama-changelog-list > li > header {
          display: flex;
          align-items: baseline;
          gap: 1rem;
          margin-bottom: 0.5rem;
        }
        .trama-changelog-list time {
          font-size: 0.75rem;
          color: var(--trama-fg-muted);
          font-family: var(--trama-font-mono);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .trama-changelog-list h2 {
          margin: 0;
          font-size: 1.0625rem;
        }
        .trama-changelog-list ul {
          margin: 0;
          padding-left: 1.25rem;
          color: var(--trama-fg-soft);
          font-size: 0.9375rem;
        }
        .trama-changelog-list ul li { margin-bottom: 0.25rem; }
        .trama-changelog-foot {
          margin-top: 2rem;
          color: var(--trama-fg-muted);
          font-size: 0.875rem;
        }
      `}</style>
    </article>
  );
}
