import type { NodeId } from '../model/index.js';
import type {
  CapturedExecValue,
  CapturedSequenceSample,
  CapturedStockWindow,
  NodeSnapshot,
} from '../schema/node-snapshot.js';
import type { ExecValue } from './exec-value.js';
import { isSequence, isFunctionHandle, resolveScalar } from './exec-value.js';
import { observeBufferToArray } from './observe-buffer.js';
import type { ExecutionState } from './state.js';

/**
 * captureSnapshot 옵션.
 *
 * `maxSamplesPerSeries`: SequenceValue 및 ObserveBuffer 의 sample 배열 길이 상한.
 * 초과하면 균등 stride 다운샘플을 적용한다 — 첫 sample 과 마지막 sample 을
 * 반드시 보존해 시계열의 시작·끝점이 유지된다. 미지정·0 이하·무한대 시
 * 다운샘플 미적용 (원본 그대로).
 */
export interface CaptureSnapshotOptions {
  maxSamplesPerSeries?: number;
}

/**
 * 한 시점의 ExecutionState 를 NodeSnapshot 으로 박제한다.
 *
 * 런타임 envelope 중 직렬화 불가한 자리(FunctionHandle) 는 동일
 * simulationTimeMs 로 환원해 Value 로 닫는다 — 결정성이 paradigm 의 계약이므로
 * 같은 시각이면 다시 시뮬레이션해도 동일한 값이 나온다.
 *
 * 본 함수는 ExecutionState 를 변경하지 않는다 (read-only).
 */
export function captureSnapshot(
  state: ExecutionState,
  options: CaptureSnapshotOptions = {},
): NodeSnapshot {
  const { maxSamplesPerSeries } = options;
  const t = state.simulationTimeMs;

  const values: Record<NodeId, CapturedExecValue> = {};
  for (const [nid, ev] of Object.entries(state.values)) {
    values[nid] = captureExecValue(ev, t, maxSamplesPerSeries);
  }

  const observeSeries: Record<NodeId, CapturedSequenceSample[]> = {};
  for (const [nid, buf] of Object.entries(state.observeBuffers)) {
    observeSeries[nid] = downsample(observeBufferToArray(buf), maxSamplesPerSeries);
  }

  const stockWindows: Record<NodeId, CapturedStockWindow> = {};
  for (const [nid, rt] of Object.entries(state.stockRuntime)) {
    stockWindows[nid] = {
      window: rt.window.map((entry) => ({ t: entry.ts, delta: entry.delta })),
    };
  }

  return {
    simulationTimeMs: t,
    values,
    validSlots: Array.from(state.validOutputs).sort(),
    pendingSlots: Array.from(state.pendingOutputs).sort(),
    observeSeries,
    stockWindows,
  };
}

function captureExecValue(
  ev: ExecValue,
  simulationTimeMs: number,
  maxSamplesPerSeries: number | undefined,
): CapturedExecValue {
  if (isSequence(ev)) {
    return {
      kind: 'sequence',
      samples: downsample(ev.samples, maxSamplesPerSeries),
    };
  }
  if (isFunctionHandle(ev)) {
    return ev.peek(simulationTimeMs);
  }
  const resolved = resolveScalar(ev, simulationTimeMs);
  if (resolved.kind === 'wrapped') {
    return { kind: 'wrapped', value: resolved.value, meta: resolved.meta };
  }
  return resolved;
}

/**
 * 균등 stride 다운샘플. 첫·마지막 sample 은 반드시 보존하고 사이를 등간격으로
 * 솎아낸다. 입력의 단조 비감소 t 순서가 유지된다.
 */
function downsample<T>(
  samples: readonly T[],
  maxSamplesPerSeries: number | undefined,
): T[] {
  if (
    maxSamplesPerSeries === undefined ||
    !Number.isFinite(maxSamplesPerSeries) ||
    maxSamplesPerSeries <= 0 ||
    samples.length <= maxSamplesPerSeries
  ) {
    return samples.slice();
  }
  if (maxSamplesPerSeries === 1) {
    return [samples[samples.length - 1]!];
  }
  const last = samples.length - 1;
  const out: T[] = new Array(maxSamplesPerSeries);
  for (let i = 0; i < maxSamplesPerSeries; i++) {
    const idx = Math.round((i * last) / (maxSamplesPerSeries - 1));
    out[i] = samples[idx]!;
  }
  return out;
}
