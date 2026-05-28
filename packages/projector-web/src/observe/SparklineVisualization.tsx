import { memo, useMemo } from 'react';
import { curveMonotoneX, line as d3Line } from 'd3-shape';
import type { SequenceSample, Value } from '@trama-chain/core';
import type { ObserveVisualizationRenderProps } from './types.js';

/**
 * Sparkline — 누적 버퍼를 시간 축 따라 선/계단 그래프로 그린다.
 *
 * - numeric: min/max 정규화 후 선 그래프. 마지막 점은 작은 dot으로 강조.
 * - boolean: 디지털 신호기 — 참=상단, 거짓=하단. 값이 바뀌는 순간 수직 전이.
 *
 * x 축은 sample.t (simulation time) 기반. windowed capacity 면 도메인을
 * `[latestT - windowMs, latestT]` 로 고정해 시간 진행에 따라 우→좌 sliding,
 * unbounded 면 `[firstT, latestT]` 로 전체 fit. 인덱스 등간격 매핑이 아니라
 * 실제 시간 비례라 push 가 일부 step 에서 스킵돼도 정확한 시점에 점이 찍힌다.
 *
 * 두 ValueKind를 섞은 누적은 시각이 깨지지만 ObserveNode는 단일 source에서만
 * 값을 받는 1:1 구조라 한 버퍼 안에서는 ValueKind가 한 종류로 고정된다 — 첫
 * sample의 kind로 분기한다.
 */

const PAD_X = 12;
const PAD_Y = 12;
const PAD_X_COMPACT = 4;
const PAD_Y_COMPACT = 3;

function pickValueKind(
  samples: readonly SequenceSample[],
  current: Value | null,
): 'numeric' | 'boolean' | null {
  for (const s of samples) return s.value.kind;
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

function sameValue(a: Value, b: Value): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'numeric' && b.kind === 'numeric') return a.n === b.n;
  if (a.kind === 'boolean' && b.kind === 'boolean') return a.b === b.b;
  return false;
}

/**
 * 시간 도메인 폭당 dense peek 개수. width 비례라기보단 sin 한 주기에 32 점 이상
 * 떨어지는 정도면 monotoneX 보간으로 충분히 매끄럽다. 너무 크면 매 step rerender
 * 비용만 늘고 시각 차이는 미미하다.
 */
const FUNCTION_DENSE_SAMPLES = 96;

function SparklineImpl({
  node,
  samples,
  current,
  currentT,
  functionSource,
  frozen,
  halfW,
  halfH,
  compact,
}: ObserveVisualizationRenderProps): JSX.Element {
  const kind = pickValueKind(samples, current);

  const padX = compact ? PAD_X_COMPACT : PAD_X;
  const padY = compact ? PAD_Y_COMPACT : PAD_Y;
  const markerR = compact ? 2 : 3;
  const innerW = halfW * 2 - padX * 2;
  const innerH = halfH * 2 - padY * 2;
  const x0 = -halfW + padX;
  const y0 = -halfH + padY;

  // 현재값을 같이 보여주기 위해 sample 처럼 t 와 함께 붙인다. 버퍼에는 아직
  // 안 들어간 가장 최근 출력값을 표시 (descriptor 가 push 하기 전 hot-path 에서도
  // 보이도록). 마지막 sample 과 t 가 같거나 값이 같으면 중복 추가 안 함 —
  // monotoneX 가 단조 x 를 가정하므로.
  const combined: readonly SequenceSample[] = useMemo(() => {
    if (!current) return samples;
    const tail = samples[samples.length - 1];
    if (tail && tail.t >= currentT) return samples;
    if (tail && sameValue(tail.value, current)) return samples;
    return [...samples, { value: current, t: currentT }];
  }, [samples, current, currentT]);

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

  // x 도메인 — capacity 정책에 따라 분기.
  //  - windowed: [max(latestT - windowMs, firstT), latestT]. 시뮬레이션 시작 직후
  //    windowMs 미충분 영역까지 미래·과거로 도메인이 확장되지 않게 firstT 으로
  //    클램프. 누적이 windowMs 보다 길어진 이후엔 firstT 이 자동으로 evict 따라
  //    움직여 정상 sliding 으로 수렴.
  //  - unbounded: [firstT, latestT] 전체 fit. 길수록 x 가 압축되지만 시간 비례 보존.
  //
  // 이 클램프는 FunctionHandle dense peek 의 시각 의미와도 직결된다 — 시뮬레이션
  // 이 도달한 적 없는 음수 t 영역까지 sin 모양으로 채워지지 않도록.
  const tLatest = combined[combined.length - 1]?.t ?? currentT;
  const tFirst = combined[0]?.t ?? tLatest;
  const tMin =
    node.capacity.kind === 'windowed'
      ? Math.max(tLatest - node.capacity.windowMs, tFirst)
      : tFirst;
  const tMax = tLatest;
  const tSpan = Math.max(tMax - tMin, 1e-9);
  const scaleX = (t: number): number => x0 + ((t - tMin) / tSpan) * innerW;

  if (kind === 'numeric') {
    // FunctionHandle source 면 windowed 도메인을 dense peek 으로 매끄럽게 그린다.
    // 누적 sample 의 띄엄띄엄함을 함수의 실제 모양으로 보강 — sin 처럼 step 보다
    // 빠른 신호도 깨지지 않는다. range 계산은 누적 sample 과 dense sample 을 합쳐
    // y 축이 함수 진폭 전체를 담도록.
    if (functionSource) {
      const denseSamples: { t: number; n: number }[] = [];
      for (let i = 0; i < FUNCTION_DENSE_SAMPLES; i++) {
        const t = tMin + (tSpan * i) / (FUNCTION_DENSE_SAMPLES - 1);
        const v = functionSource.peek(t);
        if (v.kind === 'numeric' && Number.isFinite(v.n)) {
          denseSamples.push({ t, n: v.n });
        }
      }
      if (denseSamples.length === 0) {
        return <g className="trama-observe-vis-sparkline is-empty" />;
      }
      const { min, max } = numericRange(denseSamples.map((s) => s.n));
      const span = max - min;
      const points = denseSamples.map((s) => ({
        x: scaleX(s.t),
        y: y0 + innerH - ((s.n - min) / span) * innerH,
      }));
      const path = sparkLineGen(points) ?? '';
      const last = points[points.length - 1]!;
      return (
        <g className={`trama-observe-vis-sparkline is-numeric is-function${frozen ? ' is-frozen' : ''}`}>
          <path d={path} fill="none" className="trama-observe-sparkline-line" />
          <circle
            cx={last.x}
            cy={last.y}
            r={markerR}
            className="trama-observe-sparkline-marker"
          />
          {frozen ? (
            <circle
              cx={last.x}
              cy={last.y}
              r={markerR}
              className="trama-observe-sparkline-ring"
            />
          ) : null}
        </g>
      );
    }
    const finiteSamples = combined.filter(
      (s): s is SequenceSample & { value: Extract<Value, { kind: 'numeric' }> } =>
        s.value.kind === 'numeric' && Number.isFinite(s.value.n),
    );
    if (finiteSamples.length === 0) {
      return <g className="trama-observe-vis-sparkline is-empty" />;
    }
    const { min, max } = numericRange(finiteSamples.map((s) => s.value.n));
    const span = max - min;
    const points = finiteSamples.map((s) => ({
      x: scaleX(s.t),
      // y 는 위가 -, 아래가 + — 큰 값이 위로 가도록 반전.
      y: y0 + innerH - ((s.value.n - min) / span) * innerH,
    }));
    const path = sparkLineGen(points) ?? '';
    const last = points[points.length - 1]!;
    return (
      <g className={`trama-observe-vis-sparkline is-numeric${frozen ? ' is-frozen' : ''}`}>
        <path d={path} fill="none" className="trama-observe-sparkline-line" />
        <circle
          cx={last.x}
          cy={last.y}
          r={markerR}
          className="trama-observe-sparkline-marker"
        />
        {frozen ? (
          <circle
            cx={last.x}
            cy={last.y}
            r={markerR}
            className="trama-observe-sparkline-ring"
          />
        ) : null}
      </g>
    );
  }

  // boolean: 디지털 신호기. 참=상단 line, 거짓=하단 line. 값 변경 시 수직 전이.
  const boolSamples = combined.filter(
    (s): s is SequenceSample & { value: Extract<Value, { kind: 'boolean' }> } =>
      s.value.kind === 'boolean',
  );
  if (boolSamples.length === 0) {
    return <g className="trama-observe-vis-sparkline is-empty" />;
  }
  const yHigh = y0 + innerH * 0.2;
  const yLow = y0 + innerH * 0.8;
  const segs: string[] = [];
  boolSamples.forEach((s, i) => {
    const x = scaleX(s.t);
    const y = s.value.b ? yHigh : yLow;
    if (i === 0) {
      segs.push(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
      return;
    }
    const prev = boolSamples[i - 1]!;
    if (prev.value.b !== s.value.b) {
      const prevY = prev.value.b ? yHigh : yLow;
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
