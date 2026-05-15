---
version: 1
last_verified: 2026-05-15
---

# ExpressionNode + fizzex (S-expression)

## When to Apply
- `packages/projector-web/src/expression/**/*.ts` 추가·수정 시
- `ExpressionNodeView.tsx` 또는 식 평가/렌더 관련 코드 작성 시
- `packages/core/src/execution/expression-evaluator.ts` 시그니처 변경 시

## MUST
- 식 평가는 fizzex를 단일 엔진으로 사용한다 (`parseLatex`/`evaluateSync`/`evaluate`/`analyzeBindings`/`analyzeEvaluability`).
- 같은 LaTeX 문자열은 컴파일 1회만 — `compile()` 캐시(`Map<string, CompiledExpression>`)에 보관하고 evaluate/diagnose/analyze가 공유한다.
- 식 노드의 *상수*(π·e·g 같은 LaTeX 상수)도 LaTeX 안에서 자동으로 값을 받지 않는다. **반드시 `ConstantNode`에서 엣지로 들어와야 한다.** 식 본문 안의 `\pi` 같은 토큰은 변수처럼 다뤄 ConstantNode 엣지로 바인딩한다.
- 식 노드 안의 fizzex EditorView는 캔버스 줌·노드 드래그와 충돌하지 않도록 격리 호스트(`EditorHost`)로 감싼다 — 휠은 native 단계에서 stopPropagation, pointerdown은 React 합성 이벤트 단계에서 차단.

## MUST NOT
- 식 노드 안에서 `Math.PI`/`Math.E` 같은 호스트 상수를 자동 바인딩하지 않는다. 상수는 [[project_expression_constants|ConstantNode 엣지]]로만.
- 같은 LaTeX에 대해 매 evaluate마다 `parseLatex`를 다시 호출하지 않는다 (캐시 우회 금지).
- 식 평가기 시그니처(`ExpressionEvaluator`)를 fizzex에 직접 결합하지 않는다 — core가 정의한 인터페이스를 projector-web이 fizzex로 구현한다.
- 식 노드 안에 캔버스 native 'wheel' 핸들러를 그대로 흘려보내지 않는다 (확대/축소가 식 편집을 가로챔).

## PREFER
- LaTeX 본문이 비거나 오류면 `EMPTY_COMPILED` 같은 안전한 기본 핸들로 fall back.
- 컴파일 캐시는 모듈 스코프 `Map` 단일 인스턴스로 유지. 호스트 인스턴스마다 새로 만들 필요 없음.
- AST가 필요한 사용처(렌더·바인딩)는 캐시된 compiled handle을 통해 받는다.

[[C1-projector-separation]]
[[C3-descriptor-registry]]
