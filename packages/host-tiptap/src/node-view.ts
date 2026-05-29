import type { NodeViewRenderer, NodeViewRendererProps } from '@tiptap/core';
import { mountTramaEditor, type TramaMountHandle } from './mount.js';

/**
 * data-height 가 비어 있을 때 NodeView 가 mount 에 넘기는 기본 높이(px).
 * 호스트별 정책에 의존하지 않는 안전 기본값. 사용자가 핸들로 한 번이라도 조절하면
 * 그 시점에 attrs.height 가 number 가 되어 이 값은 무시된다.
 */
const DEFAULT_HEIGHT = 480;

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
 *   - **height 는 attrs 로 보관** — Oon block 의 attrs 회피 결정은 *JSON 본문을
 *     attr 에 박지 마라* 의 의미. 메타데이터(높이 같은 임베드 표현 결정)는 attrs
 *     가 자연스러운 자리.
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

    const initialAttrHeight =
      typeof node.attrs.height === 'number' ? node.attrs.height : null;

    let currentJson = node.textContent || '';
    /**
     * NodeView 가 알고 있는 마지막 height. attrs.height 가 null 이면 mount 에는
     * DEFAULT_HEIGHT 가 들어가지만, currentHeight 는 null 로 둔다 — 다음 update
     * 에서 attrs.height 가 여전히 null 이면 setHeight 호출을 건너뛴다.
     */
    let currentHeight: number | null = initialAttrHeight;
    let handle: TramaMountHandle | null = null;
    let destroyed = false;
    /**
     * 자기 자신이 dispatch한 트랜잭션 → update 콜백 루프를 끊기 위한 플래그.
     * writeBackJson 직후 한 번의 update 는 같은 JSON 이라 자연스레 무시되지만,
     * 추가 안전망.
     */
    let suppressNextUpdate = false;

    const writeBackJson = (json: string): void => {
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

    const writeBackHeight = (height: number): void => {
      if (destroyed) return;
      if (height === currentHeight) return;
      const pos = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof pos !== 'number') return;
      const view = editor.view;
      const $node = view.state.doc.nodeAt(pos);
      if (!$node) return;
      currentHeight = height;
      // mount 의 내부 currentHeight 도 같이 갱신해야 TramaEditor 의 `height` prop
      // 이 새 값으로 re-render 되어 root 인라인 style 까지 반영된다. update 콜백은
      // currentHeight 비교 가드로 자기 dispatch 의 echo 를 skip 하므로 이쪽에서
      // 명시적으로 push 하지 않으면 mount 가 영원히 초기값에 머문다.
      handle?.setHeight(height);
      // attrs 갱신은 textContent 와 다른 트랜잭션 — JSON 의 suppressNextUpdate 와
      // 섞이지 않는다. update 콜백 안의 currentHeight 비교 가드로 echo 차단.
      const tr = view.state.tr.setNodeMarkup(pos, undefined, {
        ...$node.attrs,
        height,
      });
      view.dispatch(tr);
    };

    handle = mountTramaEditor(mount, {
      initialJson: currentJson,
      initialHeight: initialAttrHeight ?? DEFAULT_HEIGHT,
      onChange: writeBackJson,
      onHeightChange: writeBackHeight,
      editable: editor.options.editable,
    });

    return {
      dom,
      update(updatedNode) {
        if (updatedNode.type.name !== node.type.name) return false;
        const newJson = updatedNode.textContent || '';
        const rawHeight = updatedNode.attrs.height;
        const newAttrHeight: number | null =
          typeof rawHeight === 'number' && Number.isFinite(rawHeight) && rawHeight > 0
            ? rawHeight
            : null;

        // height 외부 변경 → mount 에 push. 자기 트랜잭션이면 currentHeight 가
        // 이미 같아서 분기 통과 안 함.
        if (newAttrHeight !== currentHeight) {
          currentHeight = newAttrHeight;
          handle?.setHeight(newAttrHeight ?? DEFAULT_HEIGHT);
        }

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
      /**
       * trama 영역의 마우스/포인터 이벤트는 모두 자체 핸들러로 흡수한다.
       *
       * 특히 `dblclick` / `contextmenu` 를 PM 에 넘기면, PM 이 contenteditable=false
       * 노드 위의 이 이벤트들을 NodeSelection 설정으로 처리하면서 *view rebuild*
       * (현 NodeView destroy → 새 NodeView 생성) 가 일어난다 — React root 가 폐기되어
       * 안에 열려있던 NodePicker 등 UI 상태가 한 tick 만에 증발한다.
       *
       * pointerdown / pointerup / pointermove / click 도 모두 trama 의 pan·드래그·
       * 선택 핸들러가 자체 처리하므로 동일하게 흡수. 키보드 / wheel 은 호스트로
       * 통과시킨다 (Tiptap 단축키 · 호스트 페이지 스크롤 정상 동작 필요).
       */
      stopEvent(event) {
        const type = event.type;
        return (
          type === 'mousedown' ||
          type === 'mouseup' ||
          type === 'click' ||
          type === 'dblclick' ||
          type === 'contextmenu' ||
          type === 'pointerdown' ||
          type === 'pointerup' ||
          type === 'pointermove' ||
          type === 'pointercancel'
        );
      },
    };
  };
}
