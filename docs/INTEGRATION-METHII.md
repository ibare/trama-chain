# 메티 ↔ trama 통합 요청서

**대상**: 메티(Methii) 측 호스트 작업자  
**작성**: trama 측 (@trama-chain/host-tiptap-bundle 0.1.0 산출 직후)  
**산출물**: `packages/host-tiptap-bundle/trama-host-tiptap-bundle-0.1.0.tgz` (2.1MB, sourcemap 포함)  
**SHA256**: `2f7cf87b72832d64d194defac47c243ea7fcb495e2ddfc5eedeccd4fb1b7e66d`

> 이 문서가 정의하는 작업은 **메티 저장소에서 메티 팀이 수행**한다. trama 측은
> 패키지 산출과 본 요청서까지만 책임진다.

---

## 1. 무엇이 들어 있나

`@trama-chain/host-tiptap-bundle`은 다음을 단일 ESM 파일로 인라인한 Tiptap 확장 번들이다.

- `@trama-chain/host-tiptap` — Tiptap NodeView 어댑터, 마크다운 펜스 유틸
- `@trama-chain/projector-web` — TramaEditor (React, 캔버스, 노드, 사이드패널 일체)
- `@trama-chain/core` — 모델/직렬화
- `@trama-chain/tokens` — CSS 변수 (postcss로 styles.css에 인라인됨)
- `fizzex` — 식 평가 엔진

번들 import 시점에 projector-web의 `styles.css`(트라마 디자인 토큰 포함)가
`<style>` 1회 자동 주입된다. 셀렉터 전부 `.trama-*` / `[data-trama-*]` 프리픽스로
스코프되어 있어 메티 전역 CSS와 충돌하지 않는다.

### 파일 구성

```
package/
├─ package.json
└─ dist/
   ├─ host-tiptap-bundle.js          # entry, 약 0.5 KB (re-export)
   ├─ host-tiptap-bundle.js.map
   ├─ host-tiptap-bundle.d.ts        # 타입 단일 파일
   └─ chunks/
      ├─ fizzex-*.js                 # 3.5 MB (식 평가)
      ├─ projector-web-*.js          # 0.5 MB
      ├─ trama-core-*.js             # 0.2 MB
      └─ runtime-*.js                # 5 KB (host-tiptap)
```

크기는 압축 전 raw 기준. 메티 빌드 시 esbuild/rollup의 production 모드에서 dead-code
제거 + gzip 통과하면 fizzex가 절반 이하로 떨어진다.

---

## 2. peer 의존성 (메티 측에서 만족해야 함)

```json
"@tiptap/core": "^2.6.0 || ^3.0.0",
"@tiptap/pm":   "^2.6.0 || ^3.0.0",
"react":        "^18.3.0 || ^19.0.0",
"react-dom":    "^18.3.0 || ^19.0.0"
```

메티 호스트의 React/Tiptap 인스턴스를 **단일** 공유한다 (별도 인스턴스를 끌어들이지
않음). 따라서 메티 측 버전이 위 범위 안에 있는지만 확인하면 된다.

---

## 3. 설치 — `apps/web/package.json`

기존 FACET·Oon·aperi21과 동일한 file: tarball 프로토콜.

```jsonc
{
  "dependencies": {
    "@trama-chain/host-tiptap-bundle": "file:../../vendor/trama-host-tiptap-bundle-0.1.0.tgz"
  }
}
```

작업 순서:

1. trama가 보낸 `trama-host-tiptap-bundle-0.1.0.tgz`를 메티 저장소의 `vendor/` 디렉토리에
   복사
2. `apps/web/package.json` 의 dependencies에 위 라인 추가
3. `pnpm install`

---

## 4. Tiptap 확장 와이어업

본 번들의 공개 API:

```ts
import {
  TramaExtension,          // Tiptap Node 확장
  TRAMA_NODE_NAME,         // 'tramaBlock'
  TRAMA_FENCE_LANG,        // 'trama'
  TRAMA_FENCE_RE,          // 마크다운에서 ```trama 펜스를 찾는 정규식
  renderTramaFenceHTML,    // JSON 문자열 → <pre data-trama="true"><code>...</code></pre>
  tramaNodeToMarkdown,     // JSON 문자열 → ```trama\n…\n``` 펜스
} from '@trama-chain/host-tiptap-bundle';
```

메티의 Tiptap extension-registry에 `TramaExtension`을 다른 블록 확장(예: depix,
math-block, code-project)과 같은 레벨로 등록한다. 추가 옵션 없음 — `.configure({...})`
파라미터를 받지 않는다.

```ts
// 예시 — 메티 측 extensions 배열
const extensions = [
  StarterKit.configure({ codeBlock: false }),  // ※ 주의: 아래 5절 참고
  // ...메티 기존 확장들
  TramaExtension,
];
```

---

## 5. 마크다운 펜스 직렬화 — **양방향 두 군데** 필요

trama 노드는 다음 마크다운 fence로 round-trip 한다.

````md
```trama
{ "id": "mdl-…", "nodes": [...], "edges": [...] }
```
````

JSON은 노드의 **`textContent`** 에 저장한다 (HTML attr 아님). 멀티라인 JSON을
이스케이프 없이 보관하기 위함. depix·math-block 등 메티의 다른 블록 펜스와 같은
패턴이다.

### 5.1 마크다운 → ProseMirror (입력)

메티의 `packages/methii-markdown` 입력 파이프라인에서 fence lang `trama`를
`tramaBlock` 노드로 변환해야 한다.

확인된 위치(2026-05-14 기준 trama 측 조사):

> `packages/methii-markdown/src/core/tokenizer/block/code-block.ts:71-91`의
> `buildFenceNode()` 함수가 `shell`, `depix`, `math-block`, `code-project`를
> 하드코딩 분기. 여기에 `'trama'` 분기를 추가하는 형태가 가장 자연스럽다.

추가 분기 가이드:

```ts
// buildFenceNode 안, 기존 분기들과 같은 레벨
if (lang === 'trama') {
  return schema.nodes.tramaBlock.create(
    null,
    content ? [schema.text(content)] : [],
  );
}
```

`content`는 fence 본문(JSON 문자열). 빈 문자열일 수 있으므로 가드.

### 5.2 ProseMirror → 마크다운 (출력)

역방향. 메티가 ProseMirror 도큐먼트를 마크다운으로 직렬화할 때 `tramaBlock` 노드를
` ```trama ... ``` ` 펜스로 되돌린다. 본 번들이 제공하는 `tramaNodeToMarkdown(jsonText)`을
그대로 호출하면 된다.

```ts
import { TRAMA_NODE_NAME, tramaNodeToMarkdown } from '@trama-chain/host-tiptap-bundle';

// 메티의 prose-to-markdown 직렬화기 안
if (node.type.name === TRAMA_NODE_NAME) {
  return tramaNodeToMarkdown(node.textContent);
}
```

직렬화 위치는 메티 팀이 가장 잘 알지만, 입력 파이프라인의 `buildFenceNode`와 대응되는
출력 직렬화기를 찾아 매핑하면 된다.

### 5.3 StarterKit `codeBlock` 비활성화 권장

`TramaExtension`의 `parseHTML`은 `pre[data-trama]`를 잡는다. StarterKit의 기본
`codeBlock`도 `pre`를 잡으므로 우선순위 분쟁 회피 차원에서 `codeBlock: false`를
권장한다. 이미 비활성화되어 있다면 무시.

---

## 6. NodeView 동작 요약 (참고용 — 손댈 필요 없음)

`TramaExtension.addNodeView`는 다음 DOM을 만든다.

```html
<pre data-trama="true" class="trama-tiptap-node" contenteditable="false">
  <div class="trama-tiptap-mount">
    <!-- React root: TramaEditor 마운트 -->
  </div>
</pre>
```

- `contenteditable="false"` — ProseMirror가 내부 DOM 변경을 입력으로 해석하지
  않게 격리
- 내부 React root는 자체 인스턴스 격리. 호스트 React와 인스턴스를 공유(peer
  단일)하지만 트리는 분리
- TramaEditor의 onChange → `tr.replaceWith`로 노드 textContent를 갱신. 자기 자신이
  유발한 update 사이클은 토큰으로 무시

호스트가 외부에서 노드 textContent를 직접 갱신해도 NodeView가 React에 반영한다
(샌드박스 "외부 setJson 적용" 버튼이 이 경로를 검증함).

---

## 7. CSS

번들 import 시점에 styles.css가 `<style>` 태그로 head에 1회 주입된다. 메티 측에서
별도 import 불필요.

셀렉터 프리픽스:

- 모든 클래스: `.trama-*`
- 데이터 속성: `[data-trama-*]`
- CSS 변수: `--trama-*`

호스트 전역과 충돌 위험이 낮다. 만약 호스트의 다크모드/테마 토글이 root 클래스
방식이라면 trama 내부는 무관하다 (trama 자체 디자인 토큰을 사용).

---

## 8. 검증 체크리스트 (메티 측에서 통합 후)

- [ ] 마크다운에 `` ```trama ... ``` `` 펜스 한 블록이 있는 문서를 열어 trama
      캔버스가 마운트되는가
- [ ] 같은 문서를 저장하면 펜스가 그대로 복원되는가 (round-trip)
- [ ] 한 문서에 trama 블록을 2개 이상 넣었을 때 각자 독립 동작하는가
- [ ] 호스트가 read-only 모드일 때 trama 캔버스의 드래그/더블클릭/메뉴/식 편집
      등 모든 mutator가 잠기는가 → `editable` 옵션 false로 마운트 (Tiptap의
      `editable` 상태가 NodeView로 전파됨)
- [ ] trama 내부 편집이 호스트 onChange로 흘러나가는가 (디바운스됨)
- [ ] 브라우저 콘솔에 빨간 에러가 없는가

trama 측은 `apps/web/src/routes/TiptapSandboxRoute.tsx`에서 같은 형질을 단독
검증해두었다. 동일 동작을 메티 호스트에서 재현하면 통과.

---

## 9. 알려진 제약 / 향후

- **fizzex 청크 크기**: 3.5MB (압축 전). 식 평가 엔진. 메티의 production 빌드 gzip
  통과 후 사이즈 회귀 확인 권장. trama 측에서 `VISUALIZE=1 pnpm build`로
  treemap 분석 가능.
- **단일 호스트 React 인스턴스 가정**: peer로 잡혀 있어 메티가 React를 두 번
  번들하지 않는 한 문제 없음. 다중 인스턴스가 의심되면 `react.useId`
  warning을 확인.
- **하위호환 마이그레이션 없음**: trama는 신규 제품이라 schemaVersion 분기 없음.
  당분간 0.x 동안은 fence 안의 JSON 스키마가 깨질 수 있으니 메티 문서 마이그레이션
  필요성 발생 시 trama 팀과 동기화.

---

## 10. 패치 / 새 버전 전달 방식

trama 측에서 새 버전을 만들면:

1. `pnpm --filter @trama-chain/host-tiptap-bundle run pack`
2. `trama-host-tiptap-bundle-X.Y.Z.tgz` 산출
3. SHA256 + 변경 요약을 본 문서와 같은 형태로 메티 팀에 전달
4. 메티 측 `vendor/` 교체 + `apps/web/package.json` 버전 라인 갱신

---

## 11. 빠른 참조 — 메티 측 변경 한눈에

| # | 위치 | 변경 |
|---|------|------|
| 1 | `vendor/trama-host-tiptap-bundle-0.1.0.tgz` | 파일 배치 |
| 2 | `apps/web/package.json` dependencies | `"@trama-chain/host-tiptap-bundle": "file:../../vendor/trama-host-tiptap-bundle-0.1.0.tgz"` |
| 3 | Tiptap extension-registry | `TramaExtension` 등록 |
| 4 | `packages/methii-markdown` `buildFenceNode` | `lang === 'trama'` 분기 추가 |
| 5 | prose-to-markdown 직렬화기 | `tramaBlock` 노드 → `tramaNodeToMarkdown(node.textContent)` |
| 6 | StarterKit (있다면) | `codeBlock: false` 권장 |

문의는 trama 팀(min태)으로.
