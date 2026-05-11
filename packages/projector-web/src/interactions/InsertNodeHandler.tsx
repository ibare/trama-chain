import { useEffect } from 'react';
import { useModelStore, useUIStore } from '../store/index.js';

/**
 * insertNodeIntent가 활성화되면:
 *   1. 원래 엣지를 제거
 *   2. 같은 lag으로 from → 새 노드, 새 노드 → to 엣지 두 개 추가
 *   3. 새 노드를 이름 편집 모드로 진입
 *
 * v3-스타일 "벌어지며 등장" 애니메이션은 시각 디테일 단계(§19)에서 보강.
 */
export function InsertNodeHandler(): null {
  const intent = useUIStore((s) => s.insertNodeIntent);
  const clear = useUIStore((s) => s.clearInsertNodeIntent);
  const setEditing = useUIStore((s) => s.setEditingNode);
  const addNode = useModelStore((s) => s.addNode);
  const addEdge = useModelStore((s) => s.addEdge);
  const removeEdge = useModelStore((s) => s.removeEdge);
  const model = useModelStore((s) => s.model);

  useEffect(() => {
    if (!intent) return;
    const original = model.edges[intent.edgeId];
    if (!original) {
      clear();
      return;
    }
    const node = addNode({
      label: '새 변수',
      unit: { kind: 'scale', min: 0, max: 1 },
      initialValue: 0.5,
      position: intent.position,
    });
    addEdge({
      from: original.from,
      to: node.id,
      shape: original.shape,
      inverted: original.inverted,
      lag: original.lag,
    });
    addEdge({
      from: node.id,
      to: original.to,
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      inverted: false,
      lag: original.lag,
    });
    removeEdge(intent.edgeId);
    setEditing(node.id);
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  return null;
}
