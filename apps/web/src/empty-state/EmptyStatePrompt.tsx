import { useState } from 'react';

interface Props {
  onSubmit: (question: string) => void;
}

const placeholderRotation = [
  '예: 왜 내 체중이 늘지?',
  '예: 이 기능을 출시하면 사용자가 어떻게 반응할까?',
  '예: 가격을 5% 올리면 매출이 어떻게 될까?',
];

export function EmptyStatePrompt({ onSubmit }: Props): JSX.Element {
  const [value, setValue] = useState('');
  const placeholder = placeholderRotation[Math.floor(Date.now() / 8000) % placeholderRotation.length]!;

  return (
    <div data-trama-root style={{ width: '100vw', height: '100vh' }}>
      <div className="trama-empty-prompt">
        <h2>무엇을 생각해보고 싶나요?</h2>
        <input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              onSubmit(value.trim());
            }
          }}
        />
        <div className="trama-empty-hint">
          질문을 적고 엔터를 누르면, 그 질문에서 가장 중요한 변수 하나가 생깁니다.
        </div>
      </div>
    </div>
  );
}
