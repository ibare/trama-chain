/**
 * @trama-chain/tiptap — self-contained ESM 번들.
 *
 * 호스트 앱(예: 메티)이 file: tarball 하나로 trama를 통합할 수 있도록
 * @trama-chain/host-tiptap + projector-web + core + fizzex 의존을 모두 Rollup으로
 * 인라인. peer는 @tiptap/core·@tiptap/pm·react·react-dom 넷.
 *
 * 부수효과: bundle import 시점에 projector-web의 styles.css가 head에 1회 주입.
 * trama-* 셀렉터 prefix가 모두 깔려 있어 호스트 전역 CSS와 충돌 위험 낮음.
 */
export {
  TramaExtension,
  TRAMA_NODE_NAME,
  createTramaNodeView,
  mountTramaEditor,
  bootstrapTrama,
  TRAMA_FENCE_LANG,
  TRAMA_FENCE_RE,
  renderTramaFenceHTML,
  renderTramaFenceMeta,
  parseTramaFenceMeta,
  tramaNodeToMarkdown,
} from '@trama-chain/host-tiptap';

export type {
  TramaMountOptions,
  TramaMountHandle,
  TramaFenceMeta,
} from '@trama-chain/host-tiptap';
