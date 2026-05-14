import type { NodeViewRenderer, NodeViewRendererProps } from '@tiptap/core';
import { mountTramaEditor, type TramaMountHandle } from './mount.js';

/**
 * Tiptap NodeView 생성기 — DOM 컨테이너 안에 React root로 TramaEditor를 마운트.
 *
 * 디자인 결정:
 *   - **DOM 기반** NodeView. Tiptap의 ReactNodeViewRenderer를 사용하지 않는다.
 *     번들에 React-Tiptap glue를 끌고 들어가지 않기 위해, 그리고 호스트의
 *     React 트리와 trama 내부 React 트리를 명확히 분리하기 위해. 호스트 React
 *     인스턴스는 peerDep 단일.
 *   - **JSON은 node.textContent로 보관**. attrs 사용하지 않음 — Oon block 패턴.
 *     멀티라인 JSON을 HTML attr에 박지 않고 펜스 본문에 그대로 둔다.
 *   - **라이프사이클 토큰**으로 비동기 setJson 도중 노드 교체 레이스 차단.
 *   - **stopEvent: false** — 내부 TramaEditor의 pointer handler가 자기 영역
 *     이벤트를 흡수하므로 ProseMirror가 자체 selection을 시도하지 않는다.
 *     단, 외부 키보드 단축키(예: Tiptap 자체 Cmd+B)는 차단하지 않는다.
 *   - **ignoreMutation: true** — 내부 DOM 변경(React 렌더)을 ProseMirror가
 *     입력으로 잘못 해석하지 않도록.
 */
export function createTramaNodeView(): NodeViewRenderer {
  return ({ node, editor, getPos }: NodeViewRendererProps) => {
    const dom = document.createElement('pre');
    dom.setAttribute('data-trama', 'true');
    dom.className = 'trama-tiptap-node';
    // ProseMirror가 내부 텍스트 편집을 시도하지 않도록 contentEditable 끔.
    // 내부 React 트리(TramaEditor)는 자체 입력 요소를 갖고 있고 그쪽이 살아 있음.
    dom.setAttribute('contenteditable', 'false');

    const mount = document.createElement('div');
    mount.className = 'trama-tiptap-mount';
    dom.appendChild(mount);

    let currentJson = node.textContent || '';
    let handle: TramaMountHandle | null = null;
    let destroyed = false;
    /**
     * 자기 자신이 dispatch한 트랜잭션 → update 콜백 루프를 끊기 위한 플래그.
     * writeBack 직후 한 번의 update는 같은 JSON이라 자연스레 무시되지만,
     * 추가 안전망.
     */
    let suppressNextUpdate = false;

    const writeBack = (json: string): void => {
      if (destroyed) return;
      if (json === currentJson) return;
      const pos = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof pos !== 'number') return;
      const view = editor.view;
      const $node = view.state.doc.nodeAt(pos);
      if (!$node) return;
      currentJson = json;
      suppressNextUpdate = true;
      const from = pos + 1;
      const to = pos + 1 + $node.content.size;
      const tr = json
        ? view.state.tr.replaceWith(from, to, view.state.schema.text(json))
        : view.state.tr.delete(from, to);
      view.dispatch(tr);
    };

    handle = mountTramaEditor(mount, {
      initialJson: currentJson,
      onChange: writeBack,
      editable: editor.options.editable,
    });

    return {
      dom,
      update(updatedNode) {
        if (updatedNode.type.name !== node.type.name) return false;
        const newJson = updatedNode.textContent || '';
        if (suppressNextUpdate) {
          suppressNextUpdate = false;
          currentJson = newJson;
          // editable 만 따라간다.
          handle?.setEditable(editor.options.editable);
          return true;
        }
        if (newJson !== currentJson) {
          currentJson = newJson;
          handle?.setJson(newJson);
        }
        handle?.setEditable(editor.options.editable);
        return true;
      },
      destroy() {
        destroyed = true;
        if (handle) {
          handle.destroy();
          handle = null;
        }
      },
      ignoreMutation() {
        return true;
      },
      stopEvent() {
        return false;
      },
    };
  };
}
