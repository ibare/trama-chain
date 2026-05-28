/**
 * @trama/projector-static-bundle — self-contained ESM 번들.
 *
 * 호스트 앱(예: 메티)이 PDF·썸네일·정적 미리보기 같은 zero-compute
 * 시나리오에서 단일 의존으로 trama 정적 뷰어를 소비할 수 있도록
 * @trama/projector-static + core + layout + tokens 의존을 모두 Rollup으로
 * 인라인. peer는 react 하나.
 *
 * 부수효과: bundle import 시점에 projector-static의 styles.css가 head에 1회 주입.
 * trama-* 셀렉터 prefix가 모두 깔려 있어 호스트 전역 CSS와 충돌 위험 낮음.
 */
export {
  TramaStaticView,
  defaultStaticRenderers,
  renderStaticNode,
  buildSlotIndex,
  getCapturedBoolean,
  getCapturedNumeric,
  isSlotPending,
  isSlotValid,
  slotKey,
  computeBounds,
  staticEdgePath,
  formatNodeValue,
} from '@trama/projector-static';

export type {
  StaticNodeRenderer,
  StaticNodeRendererMap,
  StaticNodeRendererProps,
  NodeKind,
  SlotIndex,
  Point,
  FormattedValue,
} from '@trama/projector-static';
