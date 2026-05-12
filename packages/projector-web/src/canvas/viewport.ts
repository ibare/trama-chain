/**
 * 캔버스 뷰포트의 현재 zoom 배율을 imperative하게 노출한다.
 * 노드 드래그가 클라이언트 픽셀 단위의 dx/dy를 받는데, 콘텐츠 g가 scale(zoom)이면
 * 캔버스 단위 이동량은 dx/zoom이 된다. 노드 드래그가 React로 zoom을 구독하면
 * zoom 변경마다 노드들이 리렌더되므로, 드래그 시작 시점에 한 번 읽기만 하면 되는
 * 이 패턴이 가장 가볍다.
 */
let currentZoom = 1;

export function getCurrentZoom(): number {
  return currentZoom;
}

export function setCurrentZoom(z: number): void {
  currentZoom = z;
}
