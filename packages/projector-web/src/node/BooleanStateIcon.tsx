import { PhosphorGlyph } from '../icon/phosphor.js';

interface Props {
  cx: number;
  cy: number;
  on: boolean;
  size?: number;
}

/**
 * boolean 결과 시각 — 참=check / 거짓=x phosphor 글리프.
 *
 * boolean 값 노드와 논리 게이트, 비교 노드 등이 "이 노드의 현재 결과가 참인가
 * 거짓인가"를 같은 모양으로 보여주기 위한 단일 컴포넌트. 색은 `is-on`/`is-off`
 * 클래스로 분기되어 styles.css에서 결정한다(focal vs low).
 *
 * `cy`는 시각 중앙 좌표. phosphor SVG는 viewport 정중앙이 글리프 중앙이므로
 * baseline 보정 없이 그대로 둔다.
 */
export function BooleanStateIcon({
  cx,
  cy,
  on,
  size = 28,
}: Props): JSX.Element {
  const cls = on
    ? 'trama-boolean-state-icon is-on'
    : 'trama-boolean-state-icon is-off';
  return (
    <PhosphorGlyph
      name={on ? 'check' : 'x'}
      cx={cx}
      cy={cy}
      size={size}
      className={cls}
    />
  );
}
