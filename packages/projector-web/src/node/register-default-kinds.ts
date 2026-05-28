// 스킨 등록 사이드이펙트 — NodeView dispatcher 단일 진입점에서 1회 평가.
// (numeric ValueNodeView 와 boolean BooleanValueNodeView 가 갈라지므로, 어느
// 한쪽에 두면 다른 쪽 노드만 있는 페이지에서 등록이 누락될 수 있다.)
import '../skin/register-default-skins.js';
import { booleanValue, numericValue } from '@trama-chain/core';
import type { LogicGateOperator } from '@trama-chain/core';
import { constantRegistry } from '../store/registries.js';
import { ValueNodeView } from './ValueNodeView.js';
import { ConstantNodeView } from './ConstantNodeView.js';
import { ConditionNodeView } from './ConditionNodeView.js';
import { LogicGateNodeView } from './LogicGateNodeView.js';
import { ExpressionNodeView } from './ExpressionNodeView.js';
import { GeneratorNodeView } from './GeneratorNodeView.js';
import { ObserveNodeView } from './ObserveNodeView.js';
import { AverageNodeView } from './AverageNodeView.js';
import { StockNodeView } from './StockNodeView.js';
import { fizzexExpressionEvaluator } from '../expression/fizzex-evaluator.js';
import { registerNodeKindUI } from './kind-catalog.js';

/**
 * 기본 노드 종류(value·constant·condition·expression) UI 디스크립터 등록.
 *
 * Side-effect import: NodeView·NodePicker가 카탈로그를 조회하기 전에
 * 등록이 끝나도록, 모듈 최상위에서 즉시 register 호출.
 *
 * buildMenuItems은 호출 시점에 `TramaInstance`를 인자로 받아 그 인스턴스의
 * store만 만지도록 한다 — 모듈 최상위 register는 디스크립터 형상만 정의하고
 * 실제 노드 생성은 NodePicker가 "추가"로 확정하는 순간 인스턴스를 캡처해 실행된다.
 *
 * createNode는 생성된 노드의 id를 반환해야 한다 — 엣지-분할 같은 후속 단계가
 * 새 노드 id를 받아 같은 트랜잭션처럼 마무리할 수 있도록.
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
      icon: { kind: 'phosphor', name: 'seal' },
      createNode: (canvasPos) => {
        const addNode = instance.modelStore.getState().addNode;
        const setEditingNode = instance.uiStore.getState().setEditingNode;
        const node = addNode({
          label: '새 변수',
          unitId: 'rating-10',
          initialNumber: 5,
          position: canvasPos,
        });
        if (!node) return null;
        setEditingNode(node.id);
        return node.id;
      },
    },
    {
      key: 'value-boolean',
      label: '참/거짓 값 노드',
      icon: { kind: 'phosphor', name: 'toggle-right' },
      createNode: (canvasPos) => {
        const addNode = instance.modelStore.getState().addNode;
        const setEditingNode = instance.uiStore.getState().setEditingNode;
        const node = addNode({
          label: '플래그',
          unitId: 'free',
          initialValue: booleanValue(false),
          combiner: 'or',
          position: canvasPos,
        });
        if (!node) return null;
        setEditingNode(node.id);
        return node.id;
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
      icon: { kind: 'phosphor', name: 'git-diff' },
      createNode: (canvasPos) => {
        const addConditionNode = instance.modelStore.getState().addConditionNode;
        const node = addConditionNode({
          label: '조건',
          operator: '>',
          threshold: 0,
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
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
  latex: string;
}> = [
  { operator: 'and', label: 'AND 노드', latex: '\\wedge' },
  { operator: 'or', label: 'OR 노드', latex: '\\vee' },
  { operator: 'xor', label: 'XOR 노드', latex: '\\oplus' },
  { operator: 'not', label: 'NOT 노드', latex: '\\neg' },
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
      icon: { kind: 'latex', latex: preset.latex },
      createNode: (canvasPos) => {
        const addLogicGateNode = instance.modelStore.getState().addLogicGateNode;
        const node = addLogicGateNode({
          label: preset.operator.toUpperCase(),
          operator: preset.operator,
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
      },
    })),
});

/**
 * 생성기 메뉴 프리셋 — 데이터 생성 도메인 전문가.
 * - counter: 1,2,3... 등차수열
 * - uniform: [min,max] 균등분포 (모든 값이 동등 확률)
 * - normal: 평균 μ, 표준편차 σ의 정규분포 (종 모양)
 * - sine: y = A·sin(ω·t + φ) + D 결정론 진동
 * - step: t < startMs는 출력 없음, t ≥ startMs면 value 지속
 * - pulse: periodMs마다 value를 한 tick 출력
 * - schedule: (tMs, value) 짝 timeline 재생 (선택적 loop)
 */
registerNodeKindUI({
  kind: 'generator',
  menuSectionLabel: '생성',
  menuSectionOrder: 13.5,
  View: GeneratorNodeView,
  buildMenuItems: (instance) => [
    {
      key: 'gen-counter',
      label: '카운터 생성기',
      icon: { kind: 'phosphor', name: 'list-numbers' },
      createNode: (canvasPos) => {
        const addGeneratorNode = instance.modelStore.getState().addGeneratorNode;
        const node = addGeneratorNode({
          label: '카운터',
          params: { kind: 'counter', start: 1, step: 1 },
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
      },
    },
    {
      key: 'gen-uniform',
      label: '균등 랜덤 생성기',
      icon: { kind: 'phosphor', name: 'rows' },
      createNode: (canvasPos) => {
        const addGeneratorNode = instance.modelStore.getState().addGeneratorNode;
        const node = addGeneratorNode({
          label: '균등 랜덤',
          params: {
            kind: 'uniform',
            min: 0,
            max: 1,
            integer: false,
            seed: Math.floor(Math.random() * 0xffffffff),
          },
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
      },
    },
    {
      key: 'gen-normal',
      label: '정규 랜덤 생성기',
      icon: { kind: 'phosphor', name: 'chart-line' },
      createNode: (canvasPos) => {
        const addGeneratorNode = instance.modelStore.getState().addGeneratorNode;
        const node = addGeneratorNode({
          label: '정규 랜덤',
          params: {
            kind: 'normal',
            mean: 0,
            stdev: 1,
            seed: Math.floor(Math.random() * 0xffffffff),
          },
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
      },
    },
    {
      key: 'gen-sine',
      label: '사인파 생성기',
      icon: { kind: 'phosphor', name: 'wave-sine' },
      createNode: (canvasPos) => {
        const addGeneratorNode = instance.modelStore.getState().addGeneratorNode;
        const node = addGeneratorNode({
          label: '사인파',
          params: {
            kind: 'sine',
            amplitude: 1,
            omega: (2 * Math.PI) / 5,
          },
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
      },
    },
    {
      key: 'gen-step',
      label: '스텝 생성기',
      icon: { kind: 'phosphor', name: 'stairs' },
      createNode: (canvasPos) => {
        const addGeneratorNode = instance.modelStore.getState().addGeneratorNode;
        const node = addGeneratorNode({
          label: '스텝',
          params: { kind: 'step', startMs: 1000, value: 1 },
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
      },
    },
    {
      key: 'gen-pulse',
      label: '펄스 생성기',
      icon: { kind: 'phosphor', name: 'pulse' },
      createNode: (canvasPos) => {
        const addGeneratorNode = instance.modelStore.getState().addGeneratorNode;
        const node = addGeneratorNode({
          label: '펄스',
          params: { kind: 'pulse', periodMs: 500, value: 1 },
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
      },
    },
    {
      key: 'gen-schedule',
      label: '스케줄 생성기',
      icon: { kind: 'phosphor', name: 'calendar' },
      createNode: (canvasPos) => {
        const addGeneratorNode = instance.modelStore.getState().addGeneratorNode;
        const node = addGeneratorNode({
          label: '스케줄',
          params: {
            kind: 'schedule',
            points: [
              { tMs: 0, value: 0 },
              { tMs: 1000, value: 1 },
            ],
            loop: false,
          },
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
      },
    },
  ],
});

registerNodeKindUI({
  kind: 'observe',
  menuSectionLabel: '노드',
  menuSectionOrder: 10.5,
  View: ObserveNodeView,
  buildMenuItems: (instance) => [
    {
      key: 'observe',
      label: '관찰 노드',
      icon: { kind: 'phosphor', name: 'eye' },
      createNode: (canvasPos) => {
        const addObserveNode = instance.modelStore.getState().addObserveNode;
        const node = addObserveNode({
          label: '관찰',
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
      },
    },
  ],
});

registerNodeKindUI({
  kind: 'average',
  menuSectionLabel: '집계',
  menuSectionOrder: 12,
  View: AverageNodeView,
  buildMenuItems: (instance) => [
    {
      key: 'average',
      label: '평균 노드',
      icon: { kind: 'latex', latex: '\\bar{x}' },
      createNode: (canvasPos) => {
        const addAverageNode = instance.modelStore.getState().addAverageNode;
        const node = addAverageNode({
          label: '평균',
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
      },
    },
  ],
});

registerNodeKindUI({
  kind: 'stock',
  menuSectionLabel: '상태',
  menuSectionOrder: 12.5,
  View: StockNodeView,
  buildMenuItems: (instance) => [
    {
      key: 'stock',
      label: '탱크',
      icon: { kind: 'phosphor', name: 'cylinder' },
      createNode: (canvasPos) => {
        const addStockNode = instance.modelStore.getState().addStockNode;
        const node = addStockNode({
          label: '탱크',
          initialLevel: 0,
          capacity: { min: null, max: null },
          position: canvasPos,
        });
        if (!node) return null;
        return node.id;
      },
    },
  ],
});

/**
 * ConstantDefinition.symbol 은 본문 카드용 한 글자 (π, e, ⊤, ⊥, ?).
 * NodePicker 타일에서 fizzex 로 렌더할 땐 같은 의미의 latex 명령으로 치환한다 —
 * `\pi`·`\top`·`\bot` 은 명령형 글리프, 알파벳·`?` 는 그대로.
 */
function constantSymbolToLatex(symbol: string): string {
  switch (symbol) {
    case 'π':
      return '\\pi';
    case '⊤':
      return '\\top';
    case '⊥':
      return '\\bot';
    default:
      return symbol;
  }
}

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
        icon: { kind: 'latex', latex: constantSymbolToLatex(def.symbol) },
        createNode: (canvasPos) => {
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
          if (!node) return null;
          if (isCustom) setEditingNode(node.id);
          return node.id;
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
  /** 노드 추가 패널 타일에 표시할 latex 글리프 (fizzex 렌더). */
  iconLatex: string;
  /** 식 노드 본문 latex (생성 시 초기값). */
  latex: string;
}

const EXPRESSION_PRESETS: ExpressionPreset[] = [
  { key: 'multiply', label: '곱셈', iconLatex: '\\times', latex: 'a \\times b' },
  { key: 'add', label: '덧셈', iconLatex: '+', latex: 'a + b' },
  { key: 'subtract', label: '뺄셈', iconLatex: '-', latex: 'a - b' },
  { key: 'divide', label: '나눗셈', iconLatex: '\\div', latex: '\\frac{a}{b}' },
  { key: 'min', label: '최솟값', iconLatex: '\\min', latex: '\\min(a, b)' },
  { key: 'max', label: '최댓값', iconLatex: '\\max', latex: '\\max(a, b)' },
  { key: 'custom', label: '사용자 자유 식', iconLatex: 'f(x)', latex: '' },
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
        icon: { kind: 'latex', latex: preset.iconLatex },
        createNode: (canvasPos) => {
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
          if (!node) return null;
          if (isCustom) setEditingNode(node.id);
          return node.id;
        },
      };
    }),
});
