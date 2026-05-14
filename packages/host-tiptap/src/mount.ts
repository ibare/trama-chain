import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TramaEditor } from '@trama/projector-web';

export interface TramaMountOptions {
  /** 최초 마운트 시점의 JSON 문자열 (Tiptap 노드의 textContent). */
  initialJson: string;
  /**
   * trama 측 변경 사항을 호스트로 흘려보낼 콜백 — 디바운스된 새 JSON.
   * NodeView가 이걸 받아 ProseMirror 트랜잭션으로 textContent를 치환.
   */
  onChange?: (json: string) => void;
  /** 호스트 로케일 (현재는 패스스루, 향후 i18n provider 와이어업용). */
  locale?: string;
  /** 호스트 테마 힌트 (현재는 패스스루). */
  theme?: 'light' | 'dark';
  /**
   * 편집 가능 여부. false면 TramaEditor가 readOnly 모드로 마운트되어
   * 드래그·소켓·메뉴·편집 진입 등 모든 mutator가 잠긴다.
   */
  editable?: boolean;
}

export interface TramaMountHandle {
  /** 외부에서 호스트가 JSON을 갱신해야 할 때 (예: 외부 동기화). */
  setJson(json: string): void;
  /** 호스트가 editable 토글을 변경했을 때. */
  setEditable(editable: boolean): void;
  /** React root unmount + 자원 해제. */
  destroy(): void;
}

/**
 * 호스트(Tiptap 등)의 DOM 노드에 TramaEditor를 React root로 마운트하는 어댑터.
 *
 * 동일 어댑터가 편집/읽기 전용 두 모드를 모두 다룬다 — `editable` 옵션이 곧
 * TramaEditor `readOnly` prop의 부정. 별도 정적 뷰어로 분기하지 않는다.
 *
 * 라이프사이클: NodeView가 mount(설치) → setJson(외부 변경) /
 * setEditable(편집 권한 변경) → destroy(해체) 순으로 호출.
 */
export function mountTramaEditor(
  el: HTMLElement,
  opts: TramaMountOptions,
): TramaMountHandle {
  let currentJson = opts.initialJson;
  let editable = opts.editable ?? true;
  let destroyed = false;

  const root: Root = createRoot(el);

  const render = (): void => {
    if (destroyed) return;
    root.render(
      createElement(TramaEditor, {
        value: currentJson,
        onChange: opts.onChange,
        readOnly: !editable,
      }),
    );
  };

  render();

  return {
    setJson(json) {
      if (destroyed) return;
      if (json === currentJson) return;
      currentJson = json;
      render();
    },
    setEditable(next) {
      if (destroyed) return;
      if (next === editable) return;
      editable = next;
      render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      // React 18: unmount는 동기. 부모 렌더 중 호출되면 경고가 나올 수 있어
      // microtask로 한 틱 미룬다.
      queueMicrotask(() => {
        try {
          root.unmount();
        } catch {
          /* 이미 해제됨 */
        }
      });
    },
  };
}
