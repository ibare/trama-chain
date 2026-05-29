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
  /**
   * Canvas 가 mount 시 자기 SVG element 를 등록한다. 캔버스 밖의 UI(예: MiniPlayer)
   * 가 화면 좌표 ↔ 캔버스 좌표 변환을 요청할 때 SVG 의 boundingClientRect 가 필요해서.
   */
  setSvgElement(el: SVGSVGElement | null): void;
  /**
   * 현재 SVG 가 화면에서 차지하는 영역의 중심을 캔버스 좌표로 반환.
   * SVG 가 부착되지 않았거나 0×0 이면 null.
   */
  getCanvasViewportCenter(): { x: number; y: number } | null;
  /**
   * Canvas 가 등록하는 fit-to-content 콜백. 캔버스 밖의 UI(예: MiniPlayer 의
   * fit 버튼) 가 viewport state 에 직접 접근하지 않고 트리거할 수 있게 한다.
   * viewport state 는 Canvas useState 에 있으므로 콜백 패턴으로만 외부 노출.
   */
  setFitHandler(handler: (() => void) | null): void;
  /** 외부 트리거 — 등록된 fit 핸들러를 호출. 핸들러가 없으면 no-op. */
  requestFit(): void;
}

export function createViewportContainer(): ViewportContainer {
  let viewport: Viewport = { panX: 0, panY: 0, zoom: 1 };
  const listeners = new Set<() => void>();
  let svgEl: SVGSVGElement | null = null;
  let fitHandler: (() => void) | null = null;

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
    setSvgElement(el: SVGSVGElement | null): void {
      svgEl = el;
    },
    getCanvasViewportCenter(): { x: number; y: number } | null {
      if (!svgEl) return null;
      const rect = svgEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      // Canvas.toCanvasCoords 와 동일한 변환식 — clientX/Y 자리에 rect 중심을 대입.
      // (clientX - rect.left - panX) / zoom 에서 clientX = rect.left + rect.width/2.
      return {
        x: (rect.width / 2 - viewport.panX) / viewport.zoom,
        y: (rect.height / 2 - viewport.panY) / viewport.zoom,
      };
    },
    setFitHandler(handler: (() => void) | null): void {
      fitHandler = handler;
    },
    requestFit(): void {
      fitHandler?.();
    },
  };
}

