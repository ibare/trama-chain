interface PackageEntry {
  name: string;
  role: string;
  description: string;
  exports: ReadonlyArray<string>;
  peer?: ReadonlyArray<string>;
}

const packages: ReadonlyArray<PackageEntry> = [
  {
    name: '@trama/core',
    role: '도메인 모델·실행·스키마',
    description:
      '모델 타입, 함수 카테고리 정의, 실행 엔진(timestep, feedback), 단위(unit) 시스템, 스키마(Zod) 검증, 마크다운 ↔ JSON 직렬화 / 파싱. React 비의존. 트라마의 모든 표면이 이 패키지 위에서 동작한다.',
    exports: [
      'createEmptyModel / addValueNode / connectEdge — 모델 조작',
      'modelToDocument / documentToModel — 모델 ↔ Document',
      'serializeTrama / parseTrama — Document ↔ JSON',
      'serializeTramaMarkdown / extractAndParseTramaFromMarkdown — 마크다운 펜스 round-trip',
      'TramaParseError, TramaSchema (Zod)',
    ],
  },
  {
    name: '@trama/tokens',
    role: '디자인 토큰',
    description:
      'JSON으로 정의된 디자인 토큰을 TS 상수와 스코프된 CSS 변수로 빌드. 변수는 [data-trama-root] 셀렉터 안에서만 노출되어 외부 페이지의 Tailwind·전역 CSS와 충돌하지 않는다.',
    exports: ['tokens (TS 상수 트리)', 'tokens.css (스코프된 :root 셀렉터)'],
  },
  {
    name: '@trama/projector-web',
    role: '풀 캔버스 인터랙티브 편집기',
    description:
      'React 컴포넌트로 노출되는 트라마 편집기. SVG 캔버스, 노드 인터랙션, shape 직접 조작, 식 편집, 상수 엣지, 실행 시각화를 모두 포함.',
    exports: [
      'TramaEditor — 풀 캔버스 컴포넌트 (value, onChange, readOnly)',
      'shapeRegistry / combinerRegistry — 등록된 함수·결합기 카탈로그',
      'useTrama — TramaEditor Provider 안에서 인스턴스별 store에 접근',
    ],
    peer: ['react ^19', 'react-dom ^19'],
  },
  {
    name: '@trama/projector-embed',
    role: '정적 읽기 전용 임베드',
    description:
      'JSON을 받아 인터랙션 없이 그래프를 그려주는 가벼운 임베드. 블로그·문서 사이트·PDF 출력에 적합.',
    exports: ['TramaEmbed — 정적 SVG 렌더러'],
    peer: ['react ^19'],
  },
  {
    name: '@trama/host-tiptap',
    role: 'Tiptap 노드 확장',
    description:
      'tramaBlock 펜스를 Tiptap NodeView로 마운트. 내부 React 트리는 호스트와 분리되어 ProseMirror 트랜잭션과 round-trip된다.',
    exports: [
      'TramaExtension — Tiptap Node.create 산출',
      'TRAMA_NODE_NAME, TRAMA_FENCE_LANG, TRAMA_FENCE_RE',
      'renderTramaFenceHTML / tramaNodeToMarkdown — 마크다운 round-trip',
      'mountTramaEditor — NodeView 안에서 호출하는 React 마운트 헬퍼',
      'bootstrapTrama — projector-web 스코프 CSS 1회 주입',
    ],
    peer: [
      '@tiptap/core ^3.22.5',
      '@tiptap/pm ^3.22.5',
      'react ^19',
      'react-dom ^19',
    ],
  },
  {
    name: '@trama/host-tiptap-bundle',
    role: '외부 호스트용 단일 ESM 번들',
    description:
      'host-tiptap + projector-web + core + fizzex를 Rollup으로 단일 파일에 인라인. 외부 호스트가 file: tarball 하나로 통합할 수 있게 만든 배포 산출물.',
    exports: ['(host-tiptap의 모든 공개 API와 동일한 표면)'],
    peer: [
      '@tiptap/core ^3.22.5',
      '@tiptap/pm ^3.22.5',
      'react ^19',
      'react-dom ^19',
    ],
  },
];

export default function ApiReference(): JSX.Element {
  return (
    <article className="trama-api">
      <header className="trama-api-header">
        <h1>API 레퍼런스</h1>
        <p>
          워크스페이스 패키지의 공개 표면 개요. 각 패키지의 자세한 시그니처는 GitHub의 소스(또는 빌드 후
          <code> *.d.ts</code>)를 참고.
        </p>
      </header>

      <div className="trama-api-list">
        {packages.map((pkg) => (
          <section key={pkg.name} className="trama-api-card">
            <header>
              <h2>
                <code>{pkg.name}</code>
              </h2>
              <span className="trama-api-role">{pkg.role}</span>
            </header>
            <p>{pkg.description}</p>
            <h3>주요 export</h3>
            <ul>
              {pkg.exports.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            {pkg.peer && pkg.peer.length > 0 && (
              <>
                <h3>peer 의존성</h3>
                <ul>
                  {pkg.peer.map((p, i) => (
                    <li key={i}>
                      <code>{p}</code>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ))}
      </div>

      <style>{`
        .trama-api {
          max-width: 960px;
          margin: 0 auto;
          padding: 4rem 1.5rem 6rem;
        }
        .trama-api-header h1 {
          font-size: 2.25rem;
          margin: 0 0 0.75rem;
          letter-spacing: -0.015em;
        }
        .trama-api-header p {
          color: var(--trama-fg-soft);
          margin: 0 0 2.5rem;
        }
        .trama-api-header code {
          background: var(--trama-bg-soft);
          padding: 0.0625rem 0.375rem;
          border-radius: 4px;
          font-size: 0.875em;
        }
        .trama-api-list { display: grid; gap: 1.25rem; }
        .trama-api-card {
          background: var(--trama-bg);
          border: 1px solid var(--trama-border);
          border-radius: var(--trama-radius);
          padding: 1.5rem 1.75rem;
        }
        .trama-api-card header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 0.5rem;
        }
        .trama-api-card h2 {
          margin: 0;
          font-size: 1.0625rem;
        }
        .trama-api-card h2 code {
          font-family: var(--trama-font-mono);
          background: transparent;
          padding: 0;
        }
        .trama-api-role {
          font-size: 0.8125rem;
          color: var(--trama-fg-muted);
        }
        .trama-api-card > p {
          color: var(--trama-fg-soft);
          margin: 0 0 1rem;
          font-size: 0.9375rem;
        }
        .trama-api-card h3 {
          margin: 1rem 0 0.5rem;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--trama-fg-muted);
        }
        .trama-api-card ul {
          margin: 0;
          padding-left: 1.25rem;
          color: var(--trama-fg-soft);
          font-size: 0.9375rem;
        }
        .trama-api-card ul li { margin-bottom: 0.25rem; }
        .trama-api-card code {
          font-family: var(--trama-font-mono);
          font-size: 0.875em;
          background: var(--trama-bg-soft);
          padding: 0.0625rem 0.375rem;
          border-radius: 4px;
        }
      `}</style>
    </article>
  );
}
