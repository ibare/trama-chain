import { memo, useMemo } from 'react';
import type { Value } from '@trama/core';
import type { ObserveVisualizationRenderProps } from './types.js';

/**
 * 마지막 값 보기 — 가장 최근 값을 큰 글자로 보여주고, 직전 2~3개 값을 점점
 * 작고 흐리게 옆에 배치한다. 한 눈에 "지금 값"과 "직전 흐름"을 동시에 본다.
 */

const RECENT_HALO = 3; // 최근 값 외에 추가로 표시할 직전 값 수.

function formatValue(v: Value): string {
  if (v.kind === 'boolean') return v.b ? '참' : '거짓';
  const n = v.n;
  if (!Number.isFinite(n)) return '·';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return n.toExponential(2);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function LastValueImpl({
  samples,
  current,
}: ObserveVisualizationRenderProps): JSX.Element {
  // 누적 버퍼가 propagate 단계에서 이미 최신값을 push해뒀다면 samples 마지막이 곧 latest.
  // 펄스 hot-path 등으로 current가 버퍼와 어긋날 수 있어 안전하게 합쳐서 단일 timeline 구성.
  const timeline: Value[] = useMemo(() => {
    const tail = samples[samples.length - 1];
    if (!current) return samples;
    if (!tail) return [current];
    const same =
      (tail.kind === 'numeric' && current.kind === 'numeric' && tail.n === current.n) ||
      (tail.kind === 'boolean' && current.kind === 'boolean' && tail.b === current.b);
    return same ? samples : [...samples, current];
  }, [samples, current]);

  const latest = timeline[timeline.length - 1] ?? null;
  // 최신을 제외한 직전 N개를 *최근부터* 정렬. timeline[length-2]가 halo[0].
  const halo: Value[] = [];
  for (let i = timeline.length - 2; i >= 0 && halo.length < RECENT_HALO; i--) {
    halo.push(timeline[i]!);
  }

  return (
    <g className="trama-observe-vis-last-value">
      {latest ? (
        <text
          className="trama-observe-last-value"
          x={12}
          y={0}
          textAnchor="start"
          dominantBaseline="middle"
        >
          {formatValue(latest)}
        </text>
      ) : (
        <text
          className="trama-observe-last-value is-empty"
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          ·
        </text>
      )}
      {halo.map((v, idx) => {
        // 흐름은 왼쪽→오른쪽: 오래된 값이 왼쪽, 최근일수록 latest에 가까운 오른쪽.
        // halo[0]가 latest 직전이므로 latest 바로 왼쪽. tier가 클수록 더 왼쪽·작음·흐림.
        const tier = idx;
        const dx = -4 - tier * 28;
        const scale = 0.58 - tier * 0.1;
        const opacity = 0.55 - tier * 0.15;
        return (
          <text
            key={`halo-${idx}`}
            className="trama-observe-halo-value"
            x={dx}
            y={0}
            textAnchor="end"
            dominantBaseline="middle"
            style={{ fontSize: `${scale}em`, opacity }}
          >
            {formatValue(v)}
          </text>
        );
      })}
    </g>
  );
}

export const LastValueVisualization = memo(LastValueImpl);
