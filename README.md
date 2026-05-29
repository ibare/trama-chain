# Trama

변수 사이의 관계를 *함수의 형태*로 정의하고 값을 조작하면서 사고를 정련해가는 그래프 도구.

이름은 스페인어 `trama` — "직물의 씨실"이자 "이야기의 플롯". 이 도구로 사용자가 하는 일이 정확히 그 두 가지다. 관계를 엮어 사고의 줄거리를 만든다.

## 핵심 아이디어

다른 그래프·다이어그램 도구는 "A가 B에 영향을 준다"를 +/− 극성으로 끝낸다. Trama는 한 단계 더 들어가, 두 변수의 관계를 *어떤 모양의 함수*인지로 표현한다. 비례·역치·체감·가속·골짜기·확률 등 카테고리별 shape이 직접조작 편집기로 제공되고, 사용자가 함수의 형태를 조정하면 결과가 즉시 전파된다. 결과를 *데이터 시각화*가 아니라 *물건이 반응하는 모습*으로 보여주는 게 다음 단계의 목표.

같은 그래프가 두 종류의 엣지로 정적·동적·확률 시뮬레이션을 통합 표현한다.

- 일반 엣지 (lag=0) — 같은 timestep 내에서 source → target. 모든 일반 엣지는 instantaneous DAG.
- Feedback 엣지 (lag=1) — 다음 timestep의 target으로 전달. 시간 차원에서 사이클.

`N=1`이면 단일 정적 전파. `N>1`이고 feedback이 있으면 의미 있는 시간 진화 또는 stochastic process. Feedback이 없으면 N 컨트롤이 자동 숨겨진다.

## 다섯 가지 결정

이 다섯을 위반하는 기능은 추가하지 않는다.

1. **자동 추론 없음.** 도구는 사용자가 명시적으로 그린 것만 다룬다.
2. **함수의 형태가 핵심 인지 노동.** +/− 극성이 아니라 모양으로 표현한다.
3. **물성 시각화.** 값 변화는 데이터 시각화가 아니라 물건이 반응하는 모습이다.
4. **관점의 다양성 존중.** 같은 상황을 다르게 모델링하는 게 정상이다.
5. **시각적 아름다움은 비협상.**

명시적으로 *하지 않는* 것들: AI 자동 노드 제안, 합성 함수 자동 계산·표시, "검증된 모델/신뢰도 점수", force-directed 자동 레이아웃, 모델 자동 병합·추천, 자동 감도 분석, 한 timestep 내부의 사이클, 협업·실시간 편집(v1), 클라우드 동기화, 글로벌 CSS·Tailwind 의존.

## 모델 직렬화

UI는 모델을 만드는 한 가지 표면일 뿐이다. 모든 모델은 마크다운 코드 펜스 안의 JSON으로 표현·저장·전송된다.

````markdown
```trama
{
  "nodes": { ... },
  "edges": { ... },
  "settings": { "timestepN": 1 }
}
```
````

- 파싱: `JSON.parse` + Zod 스키마 검증
- 직렬화: stable key ordering으로 round-trip 결정성 보장
- 사용자가 손으로 편집할 일은 없지만 *읽을 수 있고 파싱 가능하고 임베드 가능*해야 함

이 형태는 형제 도구들 — `fizzex`(수식), `aperi21`(물리), `oon`(화성학), `depix`(다이어그램), `FACET`(소프트웨어 공학) — 의 마크다운 펜스 + DSL 패턴과 같은 계열에 속한다.

## Projector 패턴

도메인 로직은 React에 의존하지 않는다. 같은 JSON을 여러 표면이 각자의 방식으로 렌더링한다.

| 패키지 | 역할 |
|--------|------|
| [`@trama-chain/core`](packages/core) | 모델·함수·실행·단위·스키마. React 비의존. |
| [`@trama-chain/tokens`](packages/tokens) | JSON 토큰 → TS 상수 + 스코프 CSS (`[data-trama-root]`). 글로벌 `:root`에 절대 깔지 않음. |
| [`@trama-chain/projector-web`](packages/projector-web) | 풀 캔버스 인터랙티브 편집기. |
| [`@trama-chain/projector-static`](packages/projector-static) | 정적 읽기 전용 임베드 (NodeSnapshot 기반 zero-compute SVG). |
| [`@trama-chain/host-tiptap`](packages/host-tiptap) | Tiptap 노드 확장 — `tramaBlock` fence를 NodeView로 마운트. |
| [`@trama-chain/tiptap`](packages/host-tiptap-bundle) | 위 셋을 단일 ESM으로 묶은 파일 — 외부 호스트가 tarball로 소비. |
| [`website`](website) | 공개 소개 사이트 (GitHub Pages). |

토큰을 스코프된 CSS 변수로만 노출하는 이유: Trama가 들어가는 외부 페이지의 Tailwind·CSS와 충돌·간섭하지 않기 위함.

## 현재 단계

PoC를 통해 다섯 결정을 코드로 검증한 초기 모델이다. 17개 shape × 5개 카테고리 + 일부 shape의 직접조작 편집기 + 통합 실행 엔진이 갖춰져 있다. 본격적인 모델 작성 UX·실행 가시화·임베드 어댑터·물성 시각화 컴포넌트 등은 이제부터 붙여나간다.

## 개발

```bash
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm dev                      # http://localhost:5173/trama/
```

요구 사항: Node 20+, pnpm 10.x.

## 라이선스

MIT.
