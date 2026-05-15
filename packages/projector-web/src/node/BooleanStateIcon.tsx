interface Props {
  cx: number;
  cy: number;
  on: boolean;
}

/**
 * boolean 결과 시각 — 참=✓ / 거짓=✗ 글리프.
 *
 * boolean 값 노드와 논리 게이트, 비교 노드 등이 "이 노드의 현재 결과가 참인가
 * 거짓인가"를 같은 모양으로 보여주기 위한 단일 컴포넌트. 색은 `is-on`/`is-off`
 * 클래스로 분기되어 styles.css에서 결정한다(focal vs low).
 *
 * y 좌표는 텍스트 baseline 기준이라 시각 중앙과 정렬하려면 `+ 10` 정도의
 * 오프셋이 필요하지만, 호출자가 `cy`로 지정한 위치에서 정확히 시각 중앙이
 * 오도록 내부에서 자동 보정한다 — 호출자는 "여기에 둬"만 신경 쓰면 된다.
 */
export function BooleanStateIcon({ cx, cy, on }: Props): JSX.Element {
  const cls = on
    ? 'trama-boolean-state-icon is-on'
    : 'trama-boolean-state-icon is-off';
  return (
    <text className={cls} x={cx} y={cy + 10} textAnchor="middle" pointerEvents="none">
      {on ? '✓' : '✗'}
    </text>
  );
}
