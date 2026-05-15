import { booleanValue, numericValue } from '@trama/core';
import type { LogicGateOperator } from '@trama/core';
import { constantRegistry } from '../store/registries.js';
import { ValueNodeView } from './ValueNodeView.js';
import { ConstantNodeView } from './ConstantNodeView.js';
import { ConditionNodeView } from './ConditionNodeView.js';
import { ComparisonNodeView } from './ComparisonNodeView.js';
import { LogicGateNodeView } from './LogicGateNodeView.js';
import { ExpressionNodeView } from './ExpressionNodeView.js';
import { ObserveNodeView } from './ObserveNodeView.js';
import { fizzexExpressionEvaluator } from '../expression/fizzex-evaluator.js';
import { registerNodeKindUI } from './kind-catalog.js';

/**
 * 기본 노드 종류(value·constant·condition·expression) UI 디스크립터 등록.
 *
 * Side-effect import: NodeView·CanvasContextMenu가 카탈로그를 조회하기 전에
 * 등록이 끝나도록, 모듈 최상위에서 즉시 register 호출.
 *
 * buildMenuItems은 호출 시점에 `TramaInstance`를 인자로 받아 그 인스턴스의
 * store만 만지도록 한다 — 모듈 최상위 register는 디스크립터 형상만 정의하고
 * 실제 액션은 메뉴 클릭 시 인스턴스를 캡처해 실행된다.
 */

registerNodeKindUI({
  kind: 'value',
  menuSectionLabel: '노드',
  menuSectionOrder: 10,
  View: ValueNodeView,
  buildMenuItems: (instance) => [
    {
      key: 'value',
      label: '값 노드',
      onSelect: (canvasPos) => {
        const addNode = instance.modelStore.getState().addNode;
        const setEditingNode = instance.uiStore.getState().setEditingNode;
        const node = addNode({
          label: '새 변수',
          unitId: 'rating-10',
          initialNumber: 5,
          position: canvasPos,
        });
        setEditingNode(node.id);
      },
    },
    {
      key: 'value-boolean',
      label: '참/거짓 값 노드',
      symbol: '⊤',
      onSelect: (canvasPos) => {
        const addNode = instance.modelStore.getState().addNode;
        const setEditingNode = instance.uiStore.getState().setEditingNode;
        const node = addNode({
          label: '플래그',
          unitId: 'free',
          initialValue: booleanValue(false),
          combiner: 'or',
          position: canvasPos,
        });
        setEditingNode(node.id);
      },
    },
  ],
});

registerNodeKindUI({
  kind: 'condition',
  menuSectionLabel: '노드',
  menuSectionOrder: 11,
  View: ConditionNodeView,
  buildMenuItems: (instance) => [
    {
      key: 'condition',
      label: '조건 노드',
      symbol: 'If',
      onSelect: (canvasPos) => {
        const addConditionNode = instance.modelStore.getState().addConditionNode;
        addConditionNode({
          label: '조건',
          operator: '>',
          threshold: 0,
          position: canvasPos,
        });
      },
    },
  ],
});

registerNodeKindUI({
  kind: 'comparison',
  menuSectionLabel: '노드',
  menuSectionOrder: 12,
  View: ComparisonNodeView,
  buildMenuItems: (instance) => [
    {
      key: 'comparison',
      label: '비교 노드',
      symbol: '⊤?',
      onSelect: (canvasPos) => {
        const addComparisonNode =
          instance.modelStore.getState().addComparisonNode;
        addComparisonNode({
          label: '비교',
          operator: '>',
          threshold: 0,
          position: canvasPos,
        });
      },
    },
  ],
});

/**
 * 논리 게이트 메뉴 프리셋 — 각 항목이 operator만 다른 LogicGateNode를 생성한다.
 */
const LOGIC_GATE_PRESETS: Array<{
  operator: LogicGateOperator;
  label: string;
  symbol: string;
}> = [
  { operator: 'and', label: 'AND 노드', symbol: '⋀' },
  { operator: 'or', label: 'OR 노드', symbol: '⋁' },
  { operator: 'xor', label: 'XOR 노드', symbol: '⊕' },
];

registerNodeKindUI({
  kind: 'logic-gate',
  menuSectionLabel: '노드',
  menuSectionOrder: 13,
  View: LogicGateNodeView,
  buildMenuItems: (instance) =>
    LOGIC_GATE_PRESETS.map((preset) => ({
      key: `logic-${preset.operator}`,
      label: preset.label,
      symbol: preset.symbol,
      onSelect: (canvasPos) => {
        const addLogicGateNode = instance.modelStore.getState().addLogicGateNode;
        addLogicGateNode({
          label: preset.operator.toUpperCase(),
          operator: preset.operator,
          position: canvasPos,
        });
      },
    })),
});

registerNodeKindUI({
  kind: 'observe',
  menuSectionLabel: '관찰',
  menuSectionOrder: 14,
  View: ObserveNodeView,
  buildMenuItems: (instance) => [
    {
      key: 'observe',
      label: '관찰 노드',
      symbol: '👁',
      onSelect: (canvasPos) => {
        const addObserveNode = instance.modelStore.getState().addObserveNode;
        addObserveNode({
          label: '관찰',
          position: canvasPos,
        });
      },
    },
  ],
});

registerNodeKindUI({
  kind: 'constant',
  menuSectionLabel: '상수',
  menuSectionOrder: 18,
  View: ConstantNodeView,
  buildMenuItems: (instance) =>
    constantRegistry.list().map((def) => {
      const isCustom = def.key === 'custom';
      return {
        key: `const-${def.key}`,
        label: def.labels.ko,
        symbol: def.symbol,
        onSelect: (canvasPos) => {
          const addConstantNode = instance.modelStore.getState().addConstantNode;
          const setEditingNode = instance.uiStore.getState().setEditingNode;
          const value =
            def.valueKind === 'boolean'
              ? booleanValue(def.value)
              : numericValue(def.value, 'free');
          const node = addConstantNode({
            label: isCustom ? '상수' : def.symbol,
            value,
            constantKey: def.key,
            position: canvasPos,
          });
          if (isCustom) setEditingNode(node.id);
        },
      };
    }),
});

/**
 * 식 패널의 프리셋. 곱셈·덧셈 같은 연산자도 식 노드의 포장 — `preset.key`가
 * 들어 있으면 시스템 포장이고, 사용자가 본문을 편집하는 순간 `preset`이 제거되어
 * 자유식으로 전환된다. 상수 패널의 카탈로그와 동일한 UX 결.
 *
 * 마지막 항목인 'custom'은 자유식 — 빈 본문에서 시작해 사용자가 입력.
 */
interface ExpressionPreset {
  key: string;
  label: string;
  symbol: string;
  latex: string;
}

const EXPRESSION_PRESETS: ExpressionPreset[] = [
  { key: 'multiply', label: '곱셈', symbol: '×', latex: 'a \\times b' },
  { key: 'add', label: '덧셈', symbol: '+', latex: 'a + b' },
  { key: 'subtract', label: '뺄셈', symbol: '−', latex: 'a - b' },
  { key: 'divide', label: '나눗셈', symbol: '÷', latex: '\\frac{a}{b}' },
  { key: 'min', label: '최솟값', symbol: 'min', latex: '\\min(a, b)' },
  { key: 'max', label: '최댓값', symbol: 'max', latex: '\\max(a, b)' },
  { key: 'custom', label: '사용자 자유 식', symbol: 'fx', latex: '' },
];

registerNodeKindUI({
  kind: 'expression',
  menuSectionLabel: '식',
  menuSectionOrder: 15,
  View: ExpressionNodeView,
  buildMenuItems: (instance) =>
    EXPRESSION_PRESETS.map((preset) => {
      const isCustom = preset.key === 'custom';
      return {
        key: `expr-${preset.key}`,
        label: preset.label,
        symbol: preset.symbol,
        onSelect: (canvasPos) => {
          const addExpressionNode = instance.modelStore.getState().addExpressionNode;
          const setEditingNode = instance.uiStore.getState().setEditingNode;
          const latex = isCustom ? 'a + b' : preset.latex;
          const analysis = fizzexExpressionEvaluator.analyze(latex);
          const node = addExpressionNode({
            label: preset.label,
            latex,
            variables: [...analysis.required, ...analysis.constants],
            preset: isCustom ? undefined : { key: preset.key },
            position: canvasPos,
          });
          if (isCustom) setEditingNode(node.id);
        },
      };
    }),
});
