/**
 * 캔버스 뷰포트(panX, panY, zoom)를 인스턴스별로 보관·구독한다.
 *
 * Canvas 컴포넌트가 진실의 출처(useState)이지만, 캔버스 밖에 떠 있는 패널
 * (UnitInspectorLayer 등)이 노드 위치를 화면 좌표로 변환해야 해서 외부에서도
 * 읽고 구독할 수 있어야 한다. zustand store에 올리지 않고 가벼운 컨테이너로
 * 둔 이유는 노드 드래그가 클라이언트 dx/dy를 zoom으로 나누는 정도의 가벼운
 * 읽기에서 React 구독을 거치지 않게 하기 위함.
 */
export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface ViewportContainer {
  get(): Viewport;
  set(next: Viewport): void;
  subscribe(cb: () => void): () => void;
  getCurrentZoom(): number;
}

export function createViewportContainer(): ViewportContainer {
  let viewport: Viewport = { panX: 0, panY: 0, zoom: 1 };
  const listeners = new Set<() => void>();

  return {
    get(): Viewport {
      return viewport;
    },
    set(next: Viewport): void {
      if (
        next.panX === viewport.panX &&
        next.panY === viewport.panY &&
        next.zoom === viewport.zoom
      ) {
        return;
      }
      viewport = next;
      listeners.forEach((l) => l());
    },
    subscribe(cb: () => void): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getCurrentZoom(): number {
      return viewport.zoom;
    },
  };
}

/**
 * 호환 shim — 호출부 마이그레이션이 끝나면 제거된다 (Stage B 후반).
 * 새 코드는 useTrama().viewport 사용.
 */
const defaultContainer = createViewportContainer();

export function getViewport(): Viewport {
  return defaultContainer.get();
}

export function setViewport(next: Viewport): void {
  defaultContainer.set(next);
}

export function subscribeViewport(cb: () => void): () => void {
  return defaultContainer.subscribe(cb);
}

export function getCurrentZoom(): number {
  return defaultContainer.getCurrentZoom();
}
