# @trama-chain/static-projector

Trama 의 시뮬레이션 없는 정적 SVG 뷰어. PDF·썸네일·미리보기 같은 zero-compute 출력 시나리오 전용.

`projector-static` + `core` + `layout` + `tokens` 가 모두 인라인되어 있다.

## 설치

```bash
pnpm add @trama-chain/static-projector
```

### peer 의존

- `react` ^19.0.0

## 사용

```tsx
import {
  TramaStaticView,
  defaultStaticRenderers,
} from '@trama-chain/static-projector'

<TramaStaticView
  json={docJson}
  registries={{ shapes, combiners }}
  height={400}
/>
```

`import` 시점에 번들의 CSS (`trama-*` prefix 스코프) 가 `<style>` 태그로 1회 주입된다.

## API

- `TramaStaticView` — React 컴포넌트 (`json` / `doc` / `model+snapshot` 3가지 입력)
- `defaultStaticRenderers`, `renderStaticNode` — 노드 kind 별 커스텀 분기
- snapshot 유틸: `buildSlotIndex`, `getCapturedNumeric`, `slotKey`, `isSlotPending`, `isSlotValid`
- geometry: `computeBounds`, `staticEdgePath`
- format: `formatNodeValue`

## projector-web vs projector-static

| | @trama-chain/tiptap | @trama-chain/static-projector |
|---|---|---|
| 시뮬레이션 | 진행 | 없음 |
| 인터랙션 | 풀 (드래그·연결·메뉴) | 없음 |
| 입력 | 편집 가능한 TramaDocument | 박제된 NodeSnapshot |
| 용도 | 라이브 편집기 | PDF·썸네일·정적 출력 |

## 라이선스

MIT
