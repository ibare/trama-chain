import { useModelStore, useUIStore } from '../store/index.js';
import { functionRegistry } from '../store/registries.js';
import { ValueNodeView } from './ValueNodeView.js';
import { FunctionNodeView } from './FunctionNodeView.js';
import { registerNodeKindUI } from './kind-catalog.js';

/**
 * 기본 노드 종류(value·function) UI 디스크립터 등록.
 * Phase 5에서 ConstantNode가 더해지면 이 파일에 한 줄을 추가하면 된다.
 *
 * Side-effect import: NodeView·CanvasContextMenu가 카탈로그를 조회하기 전에
 * 등록이 끝나도록, 모듈 최상위에서 즉시 register 호출.
 */

registerNodeKindUI({
  kind: 'value',
  menuSectionLabel: '변수',
  menuSectionOrder: 10,
  View: ValueNodeView,
  buildMenuItems: () => [
    {
      key: 'value',
      label: '값 노드',
      onSelect: (canvasPos) => {
        const addNode = useModelStore.getState().addNode;
        const setEditingNode = useUIStore.getState().setEditingNode;
        const node = addNode({
          label: '새 변수',
          unitId: 'rating-10',
          initialValue: 5,
          position: canvasPos,
        });
        setEditingNode(node.id);
      },
    },
  ],
});

registerNodeKindUI({
  kind: 'function',
  menuSectionLabel: '함수',
  menuSectionOrder: 20,
  View: FunctionNodeView,
  buildMenuItems: () =>
    functionRegistry.list().map((def) => ({
      key: `fn-${def.key}`,
      label: def.labels.ko,
      symbol: def.symbol,
      onSelect: (canvasPos) => {
        const addFunctionNode = useModelStore.getState().addFunctionNode;
        addFunctionNode({
          label: def.labels.ko,
          functionKey: def.key,
          position: canvasPos,
        });
      },
    })),
});
