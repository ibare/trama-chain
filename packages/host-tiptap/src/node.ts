import { Node, mergeAttributes } from '@tiptap/core';
import { createTramaNodeView } from './node-view.js';

export const TRAMA_NODE_NAME = 'tramaBlock';

/**
 * trama block fence Tiptap 확장.
 *
 * 마크다운 round-trip: ```trama\n<json>\n``` ↔ `<pre data-trama="true"><code>JSON</code></pre>`.
 * 호스트의 마크다운 변환기가 fence lang `trama`를 감지해 노드로 변환하고,
 * 직렬화 때도 같은 fence로 되돌리면 된다. JSON은 attrs가 아닌 `textContent`로
 * 보관 — 멀티라인이 자연스럽고 HTML attribute 인코딩을 피한다.
 *
 * 형질:
 *   - group `block`: 인라인 흐름 밖, 독립 줄
 *   - content `text*`: JSON 텍스트를 노드 컨텐츠로 직접 보관
 *   - code: 코드블록 의미 (마크다운 fence와 자연스럽게 짝)
 *   - defining + isolating: 분할/병합 등에서 텍스트가 다른 노드와 섞이지 않음
 *   - marks `''`: 굵게·기울임 같은 인라인 마크 적용 불가
 */
export const TramaExtension = Node.create({
  name: TRAMA_NODE_NAME,
  group: 'block',
  content: 'text*',
  code: true,
  defining: true,
  isolating: true,
  marks: '',
  selectable: true,
  draggable: false,

  /**
   * 캔버스 높이(px) attr — 호스트 책임의 영속 표면.
   *
   * default: null — 한 번도 리사이즈 안 한 fence 는 attr 없이 유지된다. parseHTML
   * 도 data-height 미존재면 null. NodeView 는 null 일 때 자체 fallback(=480)을
   * 쓰고, 핸들 드래그로 setNodeAttribute 가 호출되는 시점부터 attr 이 number 가
   * 되어 renderHTML / 마크다운 직렬화에 메타가 발사된다. 즉 "사용자가 명시적으로
   * 정한 fence 만 메타를 들고 다닌다" — 기본 마크다운을 메타 없이 깔끔하게 유지.
   */
  addAttributes() {
    return {
      height: {
        default: null as number | null,
        parseHTML: (el) => {
          const raw = (el as HTMLElement).getAttribute('data-height');
          if (raw == null) return null;
          const n = Number(raw);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attrs) => {
          const h = attrs.height;
          if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) return {};
          return { 'data-height': String(h) };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'pre[data-trama]',
        preserveWhitespace: 'full',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes({ 'data-trama': 'true' }, HTMLAttributes),
      ['code', 0],
    ];
  },

  addNodeView() {
    return createTramaNodeView();
  },
});
