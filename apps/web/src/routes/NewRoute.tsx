import { useNavigate } from 'react-router-dom';
import { EmptyStatePrompt } from '../empty-state/EmptyStatePrompt.js';
import { newModel, saveModel } from '../storage.js';
import { addNode } from '@trama/core';

export function NewRoute(): JSX.Element {
  const navigate = useNavigate();

  const onSubmit = (question: string) => {
    let m = newModel(question);
    // 질문의 *주어*를 추정하기보단, 사용자가 직접 노드 이름을 정하도록 첫 노드는
    // 빈 라벨로 두고 이름 편집 모드로 들어가는 게 자연스럽다.
    // 단순화를 위해 v1엔 placeholder "변수 1"로.
    m = addNode(m, {
      label: '변수 1',
      unit: { kind: 'scale', min: 0, max: 1 },
      initialValue: 0.5,
      position: { x: 540, y: 320 },
      isFocal: true,
    });
    saveModel(m);
    navigate(`/m/${m.id}`);
  };

  return <EmptyStatePrompt onSubmit={onSubmit} />;
}
