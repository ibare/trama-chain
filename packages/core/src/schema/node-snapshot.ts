import { z } from 'zod';
import {
  BooleanValueSchema,
  NumericValueSchema,
  ValueSchema,
} from './primitives.js';

/**
 * 직렬화 가능한 ExecValue. 런타임 ExecValue 의 네 갈래 중 FunctionHandle 은
 * capture 시점에 resolveScalar 로 Value 까지 환원되어 사라지고, WrappedValue 의
 * value 자리도 같은 환원을 거쳐 Value 만 남는다. 결과 형태는 numeric / boolean /
 * wrapped(scalar) / sequence 네 갈래로 닫힌다.
 */
export const SequenceSampleSchema = z.object({
  value: ValueSchema,
  t: z.number(),
});

export const WrappedScalarSchema = z.object({
  kind: z.literal('wrapped'),
  value: ValueSchema,
  meta: ValueSchema,
});

export const SequenceCapturedSchema = z.object({
  kind: z.literal('sequence'),
  samples: z.array(SequenceSampleSchema),
});

export const CapturedExecValueSchema = z.discriminatedUnion('kind', [
  NumericValueSchema,
  BooleanValueSchema,
  WrappedScalarSchema,
  SequenceCapturedSchema,
]);

/**
 * Stock 노드의 rate 슬라이딩 윈도우 직렬화 형태. window 항목 한 개는 (t, delta).
 * 시각화가 rate 슬롯 다운스트림 값과 본문 게이지를 함께 계산할 수 있도록
 * snapshot 시점의 윈도우를 그대로 박제한다.
 */
export const StockWindowEntrySchema = z.object({
  t: z.number(),
  delta: z.number(),
});

export const StockWindowSchema = z.object({
  window: z.array(StockWindowEntrySchema),
});

/**
 * Snapshot 안의 시계열·집계 부속들. ObserveNode 의 누적 시퀀스는 runtime 의
 * ObserveBuffer 가 sample 배열로 평탄화된 형태로 들어온다.
 */
export const NodeSnapshotSchema = z.object({
  /** 캡처 시각 (ms). simulationTimeMs 와 같은 시계. */
  simulationTimeMs: z.number(),
  /** 노드별 현재 값. */
  values: z.record(CapturedExecValueSchema),
  /** valid 인 출력 슬롯들. 키 포맷 `${nodeId}:${slot}`. Set → array 직렬화. */
  validSlots: z.array(z.string()),
  /** pending(토폴로지 정상·첫 신호 미도착) 슬롯들. */
  pendingSlots: z.array(z.string()),
  /** ObserveNode 누적 sample 시계열. 키는 nodeId. */
  observeSeries: z.record(z.array(SequenceSampleSchema)),
  /** StockNode rate 윈도우. */
  stockWindows: z.record(StockWindowSchema),
});

export type CapturedExecValue = z.infer<typeof CapturedExecValueSchema>;
export type CapturedSequenceSample = z.infer<typeof SequenceSampleSchema>;
export type CapturedWrappedScalar = z.infer<typeof WrappedScalarSchema>;
export type CapturedSequence = z.infer<typeof SequenceCapturedSchema>;
export type CapturedStockWindow = z.infer<typeof StockWindowSchema>;
export type NodeSnapshot = z.infer<typeof NodeSnapshotSchema>;
