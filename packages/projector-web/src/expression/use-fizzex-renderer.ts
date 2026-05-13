import { useCallback, useEffect, useRef } from 'react';
import { DOMRendererView } from 'fizzex';

type FizzexConfig = NonNullable<ConstructorParameters<typeof DOMRendererView>[1]>;

export interface FizzexMeasure {
  width: number;
  height: number;
}

/**
 * fizzex DOMRendererView 인스턴스를 호스트 div의 마운트 라이프타임에 묶는 훅.
 *
 * 반환된 callback ref를 `<div ref={hostRef}>`에 바인딩하면:
 *   - div가 마운트될 때마다 새 DOMRendererView가 부착되고 현재 latex을 렌더
 *   - div가 언마운트될 때 view.destroy()로 자원 해제
 *   - latex 변경 시 현재 인스턴스에 view.render()만 호출 (재생성 없음)
 *
 * 왜 callback ref인가:
 *   식 노드는 편집/뷰 모드 토글로 host div가 서로 다른 foreignObject에 재마운트된다.
 *   `useRef + useEffect([])` 조합은 첫 마운트의 view 인스턴스만 살려두기 때문에,
 *   토글 후 새로 마운트된 div와 분리되어 detached DOM에 그리게 된다. callback ref는
 *   React 재조정자가 attach/detach 시점을 직접 호출해주므로 stale 인스턴스가
 *   원천적으로 불가능하다.
 *
 * 왜 latexRef·configRef인가:
 *   `useCallback([], ...)`로 콜백 정체성을 고정해야 React가 매 렌더마다 detach/reattach
 *   하지 않는다. 그 결과 콜백 클로저 안의 latex·config는 첫 렌더 값에 박힌다. 최신 값을
 *   ref로 들고 가서 mount 시점에 읽으면 된다. latex 후속 변경은 별도 effect가 담당.
 */
export function useFizzexRenderer(
  latex: string,
  config: FizzexConfig,
  onMeasure?: (size: FizzexMeasure) => void,
): (el: HTMLDivElement | null) => void {
  const viewRef = useRef<DOMRendererView | null>(null);
  const latexRef = useRef(latex);
  const configRef = useRef(config);
  const onMeasureRef = useRef(onMeasure);
  latexRef.current = latex;
  configRef.current = config;
  onMeasureRef.current = onMeasure;

  const reportMeasure = (view: DOMRendererView): void => {
    const cb = onMeasureRef.current;
    if (!cb) return;
    const s = view.getSize();
    cb({ width: s.width, height: s.height });
  };

  const hostRef = useCallback((el: HTMLDivElement | null) => {
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }
    if (!el) return;
    const view = new DOMRendererView(el, configRef.current);
    view.render(latexRef.current || ' ');
    viewRef.current = view;
    reportMeasure(view);
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.render(latex || ' ');
    reportMeasure(view);
  }, [latex]);

  return hostRef;
}
