/**
 * trama block fence 규격.
 *
 * 호스트 마크다운 변환기(예: 메티의 buildFenceNode)에 추가할 분기에서 쓰는
 * 상수·유틸. 정의는 단순하다 — fence lang `trama` 안에 결정적 JSON 문자열 그대로.
 *
 * 임베드 메타(높이 등)는 fence info-string 에 Pandoc 스타일로 적는다 — 표준
 * 마크다운 도구(markdown-it-attrs, remark-attr, Hugo/Goldmark) 와 호환:
 *
 * ```trama {height=500}
 * { "id": "mdl-…", "nodes": [...], "edges": [...] }
 * ```
 *
 * trama JSON 본문은 메타에 의존하지 않으며, 호스트가 메타 없이 사용해도 동작한다.
 */

export const TRAMA_FENCE_LANG = 'trama';

/**
 * 마크다운 본문에서 첫 번째 ```trama 펜스를 찾는 정규식.
 *
 * info-string 안에 `{height=500}` 같은 메타가 와도 lang 토큰 `trama` 만 검사한다.
 * 캡처 그룹 1 = info-string 의 lang 이후 잔여 텍스트(메타). 캡처 그룹 2 = 본문 JSON.
 *
 * @trama-chain/core 의 extractAndParseTramaFromMarkdown 도 같은 fence 를 본다.
 */
export const TRAMA_FENCE_RE = /```trama([^\n]*)\n([\s\S]*?)\n```/m;

/** 펜스 메타 옵션 — 호스트 표현 결정. trama JSON 본문에는 영향 없음. */
export interface TramaFenceMeta {
  /** 캔버스 높이(px). */
  height?: number;
}

/**
 * fence info-string 의 메타 영역을 Pandoc 스타일로 직렬화. height 미지정이면
 * 빈 문자열 — `\`\`\`trama` 그대로 사용.
 *
 * 향후 메타 키 확장 시 같은 자리에 `key=value` 를 공백 구분으로 추가.
 */
export function renderTramaFenceMeta(meta?: TramaFenceMeta): string {
  if (!meta || meta.height == null) return '';
  return ` {height=${meta.height}}`;
}

/**
 * fence info-string 의 메타 영역(`{height=500}` 같은 Pandoc 스타일) 파싱.
 * lang `trama` 이후 잔여 텍스트를 그대로 넘기면 된다.
 *
 * - 입력이 빈 문자열이거나 메타 미존재면 빈 객체 반환.
 * - 알 수 없는 키는 무시 — 표면 확장에 강건.
 */
export function parseTramaFenceMeta(info: string): TramaFenceMeta {
  if (!info) return {};
  const braced = /\{([^}]*)\}/.exec(info);
  const body = braced ? braced[1]! : info;
  const out: TramaFenceMeta = {};
  for (const part of body.split(/[\s,]+/)) {
    if (!part) continue;
    const m = /^([a-zA-Z_-][a-zA-Z0-9_-]*)\s*=\s*(.+)$/.exec(part);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue!.replace(/^["']|["']$/g, '');
    if (key === 'height') {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) out.height = n;
    }
  }
  return out;
}

/**
 * 펜스 안의 JSON 텍스트로 trama 노드의 HTML 표현을 만든다 — parseHTML 이
 * 다시 받아갈 모양. height 가 오면 `data-height` attr 도 같이 넣어 NodeView
 * 초기화 시 적용. `<pre data-trama="true" data-height="500"><code>JSON</code></pre>`.
 */
export function renderTramaFenceHTML(json: string, meta?: TramaFenceMeta): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const heightAttr =
    meta && typeof meta.height === 'number' ? ` data-height="${meta.height}"` : '';
  return `<pre data-trama="true"${heightAttr}><code>${escaped}</code></pre>`;
}

/**
 * Tiptap tramaBlock 노드의 textContent(=JSON)를 마크다운 fence 문자열로.
 * @trama-chain/core 의 serializeTramaMarkdown 은 TramaDocument 를 받지만, 호스트가
 * 이미 노드의 textContent 로 JSON 을 들고 있다면 굳이 역파싱할 필요 없이 이걸로
 * fence 만 씌우면 round-trip 안전. meta 가 있으면 info-string 에 Pandoc 메타를 동봉.
 */
export function tramaNodeToMarkdown(jsonText: string, meta?: TramaFenceMeta): string {
  return '```' + TRAMA_FENCE_LANG + renderTramaFenceMeta(meta) + '\n' + jsonText + '\n```\n';
}
