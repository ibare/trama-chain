/**
 * trama block fence 규격.
 *
 * 호스트 마크다운 변환기(예: 메티의 buildFenceNode)에 추가할 분기에서 쓰는
 * 상수·유틸. 정의는 단순하다 — fence lang `trama` 안에 결정적 JSON 문자열 그대로.
 *
 * ```trama
 * { "id": "mdl-…", "nodes": [...], "edges": [...] }
 * ```
 */

export const TRAMA_FENCE_LANG = 'trama';

/**
 * 마크다운 본문에서 첫 번째 ```trama 펜스를 찾는 정규식.
 * @trama-chain/core의 extractAndParseTramaFromMarkdown과 동일.
 */
export const TRAMA_FENCE_RE = /```trama\s*\n([\s\S]*?)\n```/m;

/**
 * 펜스 안의 JSON 텍스트로 trama 노드의 HTML 표현을 만든다 — parseHTML이
 * 다시 받아갈 모양. `<pre data-trama="true"><code>JSON</code></pre>`.
 */
export function renderTramaFenceHTML(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<pre data-trama="true"><code>${escaped}</code></pre>`;
}

/**
 * Tiptap tramaBlock 노드의 textContent(=JSON)를 마크다운 fence 문자열로.
 * @trama-chain/core의 serializeTramaMarkdown은 TramaDocument를 받지만, 호스트가
 * 이미 노드의 textContent로 JSON을 들고 있다면 굳이 역파싱할 필요 없이
 * 이걸로 fence만 씌우면 round-trip 안전.
 */
export function tramaNodeToMarkdown(jsonText: string): string {
  return '```' + TRAMA_FENCE_LANG + '\n' + jsonText + '\n```\n';
}
