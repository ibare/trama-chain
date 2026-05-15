import { memo, useMemo } from 'react';
import { curveMonotoneX, line as d3Line } from 'd3-shape';
import type { Value } from '@trama/core';
import type { ObserveVisualizationRenderProps } from './types.js';

/**
 * Sparkline — 누적 버퍼를 시간 축 따라 선/계단 그래프로 그린다.
 *
 * - numeric: min/max 정규화 후 선 그래프. 마지막 점은 작은 dot으로 강조.
 * - boolean: 디지털 신호기 — 참=상단, 거짓=하단. 값이 바뀌는 순간 수직 전이.
 *
 * 두 ValueKind를 섞은 누적은 시각이 깨지지만 ObserveNode는 단일 source에서만
 * 값을 받는 1:1 구조라 한 버퍼 안에서는 ValueKind가 한 종류로 고정된다 — 첫
 * sample의 kind로 분기한다.
 */

const PAD_X = 12;
const PAD_Y = 12;

function pickValueKind(samples: Value[], current: Value | null): 'numeric' | 'boolean' | null {
  for (const v of samples) {
    return v.kind;
  }
  if (current) return current.kind;
  return null;
}

interface NumericRange {
  min: number;
  max: number;
}

/**
 * d3-shape의 monotone-X 보간 — 데이터 진폭을 넘는 가짜 oscillation을 만들지 않아
 * sparkline에 적합하다. line generator는 stateless하므로 모듈 스코프에서 1회 생성.
 */
const sparkLineGen = d3Line<{ x: number; y: number }>()
  .x((d) => d.x)
  .y((d) => d.y)
  .curve(curveMonotoneX);

function numericRange(values: number[]): NumericRange {
  if (values.length === 0) return { min: 0, max: 1 };
  let min = values[0]!;
  let max = values[0]!;
  for (const n of values) {
    if (n < min) min = n;
    if (n > max) max = n;
  }
  if (min === max) {
    // flat 라인일 때 가운데를 잡으려면 +1 여유.
    return { min: min - 1, max: max + 1 };
  }
  return { min, max };
}

function SparklineImpl({
  samples,
  current,
  halfW,
  halfH,
}: ObserveVisualizationRenderProps): JSX.Element {
  const kind = pickValueKind(samples, current);

  const innerW = halfW * 2 - PAD_X * 2;
  const innerH = halfH * 2 - PAD_Y * 2;
  const x0 = -halfW + PAD_X;
  const y0 = -halfH + PAD_Y;

  // 현재 값을 같이 보여주기 위해 marker 점만 별도 처리 — 버퍼에는 아직 안 들어간
  // 가장 최근 출력값을 표시 (descriptor가 push하기 전 hot-path에서도 보이도록).
  const combined: Value[] = useMemo(() => {
    if (!current) return samples;
    const tail = samples[samples.length - 1];
    if (tail && tail.kind === current.kind) {
      if (tail.kind === 'numeric' && current.kind === 'numeric' && tail.n === current.n) {
        return samples;
      }
      if (tail.kind === 'boolean' && current.kind === 'boolean' && tail.b === current.b) {
        return samples;
      }
    }
    return [...samples, current];
  }, [samples, current]);

  if (!kind || combined.length === 0) {
    return (
      <g className="trama-observe-vis-sparkline is-empty">
        <text
          className="trama-observe-empty-label"
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          누적 없음
        </text>
      </g>
    );
  }

  if (kind === 'numeric') {
    const nums: number[] = [];
    for (const v of combined) {
      if (v.kind === 'numeric' && Number.isFinite(v.n)) nums.push(v.n);
    }
    if (nums.length === 0) {
      return <g className="trama-observe-vis-sparkline is-empty" />;
    }
    const { min, max } = numericRange(nums);
    const span = max - min;
    const stepX = nums.length > 1 ? innerW / (nums.length - 1) : 0;
    const points = nums.map((n, i) => {
      const x = x0 + i * stepX;
      // y는 위가 -, 아래가 + — 큰 값이 위로 가도록 반전.
      const y = y0 + innerH - ((n - min) / span) * innerH;
      return { x, y };
    });
    const path = sparkLineGen(points) ?? '';
    const last = points[points.length - 1]!;
    return (
      <g className="trama-observe-vis-sparkline is-numeric">
        <path d={path} fill="none" className="trama-observe-sparkline-line" />
        <circle
          cx={last.x}
          cy={last.y}
          r={3}
          className="trama-observe-sparkline-marker"
        />
      </g>
    );
  }

  // boolean: 디지털 신호기. 참=상단 line, 거짓=하단 line. 값 변경 시 수직 전이.
  const bools: boolean[] = [];
  for (const v of combined) {
    if (v.kind === 'boolean') bools.push(v.b);
  }
  if (bools.length === 0) {
    return <g className="trama-observe-vis-sparkline is-empty" />;
  }
  const yHigh = y0 + innerH * 0.2;
  const yLow = y0 + innerH * 0.8;
  const stepX = bools.length > 1 ? innerW / (bools.length - 1) : 0;
  const segs: string[] = [];
  bools.forEach((b, i) => {
    const x = x0 + i * stepX;
    const y = b ? yHigh : yLow;
    if (i === 0) {
      segs.push(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
      return;
    }
    const prevB = bools[i - 1]!;
    if (prevB !== b) {
      const prevY = prevB ? yHigh : yLow;
      segs.push(`L ${x.toFixed(2)} ${prevY.toFixed(2)}`);
      segs.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
    } else {
      segs.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
  });
  return (
    <g className="trama-observe-vis-sparkline is-boolean">
      <line
        x1={x0}
        x2={x0 + innerW}
        y1={yHigh}
        y2={yHigh}
        className="trama-observe-sparkline-rail"
      />
      <line
        x1={x0}
        x2={x0 + innerW}
        y1={yLow}
        y2={yLow}
        className="trama-observe-sparkline-rail"
      />
      <path
        d={segs.join(' ')}
        fill="none"
        className="trama-observe-sparkline-line"
      />
    </g>
  );
}

export const SparklineVisualization = memo(SparklineImpl);
