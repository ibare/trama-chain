/**
 * @trama/projector-static — 스냅샷 기반 zero-compute 정적 렌더러.
 *
 * 시뮬레이션을 돌리지 않고 NodeSnapshot 한 시점을 SVG 로 그린다. PDF·이미지
 * 출력처럼 시간이 흐르지 않는 정적 컨텍스트가 주된 용도. 입력은 TramaDocument 의
 * `snapshot` 필드(저장 시점에 미리 박제된 [[captureSnapshot]] 결과); 없으면
 * propagateOneStep + captureSnapshot 으로 fallback.
 *
 * 다른 projector 와의 분리:
 *   - projector-web: 풀 편집기. 시뮬레이션 진행 + 드래그·연결 인터랙션.
 *   - projector-embed: 호스트 문서 안에 끼워넣는 인터랙티브 미리보기.
 *   - projector-static: 정적 출력 한 장. 시뮬레이션 없음·인터랙션 없음.
 */

export { TramaStaticView } from './TramaStaticView.js';
export { defaultStaticRenderers } from './renderers.js';
export { renderStaticNode } from './render.js';
export type {
  StaticNodeRenderer,
  StaticNodeRendererMap,
  StaticNodeRendererProps,
  NodeKind,
} from './registry.js';
export {
  buildSlotIndex,
  getCapturedBoolean,
  getCapturedNumeric,
  isSlotPending,
  isSlotValid,
  slotKey,
  type SlotIndex,
} from './snapshot.js';
export {
  computeBounds,
  staticEdgePath,
  type Point,
} from './geometry.js';
export { formatNodeValue, type FormattedValue } from './format.js';
