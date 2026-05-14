import { useEffect, useState, type MouseEvent } from 'react';
import * as Form from '@radix-ui/react-form';
import { InlineSvgInput } from './InlineSvgInput.js';

interface Props {
  /** 현재 라벨 텍스트. 표시·편집 진입 시 draft 초기값. */
  text: string;
  /** 텍스트 기준 위치 (SVG 좌표계, 노드 중심 기준). */
  x: number;
  y: number;
  /** 편집 모드에서 foreignObject·hit-rect의 폭. 본문 inner width를 넘기는 게 일반. */
  width: number;
  textAnchor?: 'start' | 'middle' | 'end';
  /** true면 input 렌더, false면 text 렌더. 편집 상태는 호출 측이 관리. */
  isEditing: boolean;
  /**
   * 트림된 새 라벨 텍스트로 호출. 동일 값이거나 빈 문자열인 경우 caller가 자체 분기.
   * 호출 측에서 setEditingNode(null) 같은 종료 처리를 같이 수행해야 한다.
   */
  onCommit: (text: string) => void;
  /** Escape 또는 빈 입력 — 편집 취소. caller가 종료 처리. */
  onCancel: () => void;
  /**
   * 라벨 영역 위에 별도 dblclick 트리거를 두고 싶을 때.
   * 본문 dblclick이 다른 의미를 가지는 노드(예: 식 노드 = 식 편집)에서 라벨 편집을
   * 진입시키기 위한 장치. transparent hit-rect가 깔리고 dblclick 시 호출된다.
   * pointerdown은 부착하지 않아 outer `<g>` 드래그가 그대로 통과 — 값 노드 라벨
   * 동작과의 시각/인터랙션 일관성을 강제.
   */
  onIsolatedDoubleClick?: (e: MouseEvent<SVGRectElement>) => void;
}

const INPUT_HEIGHT = 26;
const TRIGGER_HEIGHT = 22;
const TRIGGER_X_INSET = 4;
const TEXT_BASELINE_TO_TOP = 14;

/**
 * 노드 라벨 + 인라인 편집 단일 진실.
 *
 * 모든 노드 뷰의 라벨 편집은 이 컴포넌트를 통해 일관: draft 상태·foreignObject 위치·
 * Enter/Escape/blur 커밋·input에서 outer 드래그 차단(stopPropagation)·진입 시 draft
 * 동기화. 호출 측이 자유 구현하면 매번 다른 패턴이 생기므로, 라벨 편집은 반드시
 * 이 컴포넌트로 통일.
 */
export function NodeLabel({
  text,
  x,
  y,
  width,
  textAnchor = 'start',
  isEditing,
  onCommit,
  onCancel,
  onIsolatedDoubleClick,
}: Props): JSX.Element {
  const [draft, setDraft] = useState(text);
  useEffect(() => {
    if (isEditing) setDraft(text);
  }, [isEditing, text]);

  const commit = (): void => {
    const v = draft.trim();
    if (v) onCommit(v);
    else onCancel();
  };

  // text의 anchor 기준점(x)을 foreignObject·hit-rect의 좌상단 기준으로 변환.
  // text는 textAnchor에 따라 x가 시작/중앙/끝을 의미하지만, foreignObject는
  // 항상 좌상단이라 보정하지 않으면 'middle'/'end'에서 노드 밖으로 새어 나간다.
  const boxX =
    textAnchor === 'middle' ? x - width / 2 :
    textAnchor === 'end' ? x - width :
    x;

  if (isEditing) {
    return (
      <foreignObject x={boxX} y={y - TEXT_BASELINE_TO_TOP} width={width} height={INPUT_HEIGHT}>
        <Form.Root onSubmit={(e) => e.preventDefault()}>
          <InlineSvgInput
            name="label"
            className="trama-node-name-input"
            value={draft}
            autoFocus
            onChange={setDraft}
            onCommit={commit}
            onCancel={onCancel}
          />
        </Form.Root>
      </foreignObject>
    );
  }

  return (
    <>
      <text className="trama-node-label" x={x} y={y} textAnchor={textAnchor}>
        {text}
      </text>
      {onIsolatedDoubleClick && (
        <rect
          className="trama-node-label-hit"
          x={boxX - TRIGGER_X_INSET}
          y={y - TEXT_BASELINE_TO_TOP}
          width={width}
          height={TRIGGER_HEIGHT}
          fill="transparent"
          onDoubleClick={onIsolatedDoubleClick}
        />
      )}
    </>
  );
}
