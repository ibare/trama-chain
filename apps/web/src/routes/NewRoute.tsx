import { useNavigate } from 'react-router-dom';
import { EmptyStatePrompt } from '../empty-state/EmptyStatePrompt.js';
import { newModel, saveModel } from '../storage.js';
import { addNode } from '@trama/core';

export function NewRoute(): JSX.Element {
  const navigate = useNavigate();

  const onSubmit = (question: string) => {
    let m = newModel(question);
    m = addNode(m, {
      label: '변수 1',
      unitId: 'rating-10',
      initialValue: 5,
      position: { x: 540, y: 320 },
      isFocal: true,
    });
    saveModel(m);
    navigate(`/m/${m.id}`);
  };

  return <EmptyStatePrompt onSubmit={onSubmit} />;
}
