# @trama-chain/host-tiptap-bundle

Trama 편집기를 Tiptap NodeView 로 호스트 에디터에 꽂는 단일 ESM 번들.

`projector-web` (편집기) + `core` (모델/실행) + `layout` + `tokens` 가 모두 인라인되어 있어 호스트는 이 한 패키지만 의존하면 된다.

## 설치

```bash
pnpm add @trama-chain/host-tiptap-bundle
```

### peer 의존

호스트 앱이 다음 패키지의 단일 인스턴스를 제공해야 한다:

- `@tiptap/core` ^3.22.5
- `@tiptap/pm` ^3.22.5
- `react` ^19.0.0
- `react-dom` ^19.0.0
- `fizzex` ^0.1.0

## 사용

```ts
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  TramaExtension,
  createTramaNodeView,
  mountTramaEditor,
} from '@trama-chain/host-tiptap-bundle'

const editor = new Editor({
  extensions: [
    StarterKit,
    TramaExtension.extend({
      addNodeView: () => createTramaNodeView({ mount: mountTramaEditor }),
    }),
  ],
})
```

`import` 시점에 번들의 CSS (`trama-*` prefix 스코프) 가 `<style>` 태그로 1회 주입된다.

## API

- `TramaExtension` — Tiptap Extension
- `createTramaNodeView(opts)` — NodeView 팩토리
- `mountTramaEditor(el, opts): TramaMountHandle` — DOM 마운트 어댑터
- `bootstrapTrama()` — 초기화 헬퍼
- `TRAMA_NODE_NAME` — 노드 이름 상수
- 마크다운: `TRAMA_FENCE_LANG`, `TRAMA_FENCE_RE`, `renderTramaFenceHTML`, `tramaNodeToMarkdown`

## 라이선스

MIT
