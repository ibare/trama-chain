import { memo, useCallback, type ChangeEvent, type KeyboardEvent } from 'react';
import * as Form from '@radix-ui/react-form';

interface Props {
  name: string;
  value: string;
  onChange: (next: string) => void;
  /** Enter 키·blur 시 호출. Escape는 onCancel로 분기. */
  onCommit: () => void;
  onCancel: () => void;
  autoFocus?: boolean;
  type?: 'text' | 'number';
  step?: string;
  placeholder?: string;
  className?: string;
  /**
   * Enter 키로 커밋할지 여부. false면 Enter는 무시되고 blur·외부 트리거에만 의존.
   * (사용자 정의 수치처럼 Enter로 즉시 다음 input으로 넘어가는 패턴이 아니라
   *  라벨만 단독 편집할 때 등.)
   */
  commitOnEnter?: boolean;
}

/**
 * SVG `<foreignObject>` 안에 떠 있는 인라인 input의 공통 동작을 캡슐화한다.
 *
 * 모든 노드 위 인라인 편집기는 다음을 동일하게 보장해야 한다:
 *  - pointerdown stopPropagation (NodeFrame outer `<g>`의 드래그 차단)
 *  - Enter → commit, Escape → cancel
 *  - blur → commit (placeholder/잘못된 값 입력 시도 cancel로 갈리지 않도록 통일)
 *
 * 자체 구현하면 노드별로 어느 키가 어디로 가는지 일관성이 깨지기 쉬워, 이 래퍼
 * 안에서 강제. Radix Form.Control을 안에 두고 Form.Field 안에서만 사용 가정.
 */
function InlineSvgInputImpl({
  name,
  value,
  onChange,
  onCommit,
  onCancel,
  autoFocus = false,
  type = 'text',
  step,
  placeholder,
  className,
  commitOnEnter = true,
}: Props): JSX.Element {
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && commitOnEnter) onCommit();
      if (e.key === 'Escape') onCancel();
    },
    [commitOnEnter, onCancel, onCommit],
  );

  const onChangeImpl = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChange(e.currentTarget.value),
    [onChange],
  );

  return (
    <Form.Field name={name}>
      <Form.Control
        className={className}
        value={value}
        autoFocus={autoFocus}
        type={type}
        step={step}
        placeholder={placeholder}
        onChange={onChangeImpl}
        onKeyDown={onKeyDown}
        onBlur={onCommit}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </Form.Field>
  );
}

export const InlineSvgInput = memo(InlineSvgInputImpl);
