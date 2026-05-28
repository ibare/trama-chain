import { describe, expect, it } from 'vitest';
import type { ExecutionState } from '@trama-chain/core';
import { numericValue } from '@trama-chain/core';
import { commitExecutionState } from '../src/store/execution-commit.js';

/**
 * `commitExecutionState` 의 핵심 invariant — partial 갱신은 명시되지 않은 필드를
 * prev 에서 그대로 이어받는다. 이 보존 보장이 깨지면 model-store 의 11 자리
 * setState 호출이 누적 상태(observeBuffers, generatorRuntime, stockRuntime,
 * simulationTimeMs 등) 를 리셋하는 사고로 이어진다.
 *
 * ExecutionState 에 새 필드가 추가될 때 호출자가 한 군데라도 명시를 빼먹으면,
 * 그 자리만 silent reset 이 발생하던 패턴 (감사 §6.2 (e)) 의 회귀 방지망.
 */
function makeFullState(): ExecutionState {
  return {
    values: { n1: numericValue(1) },
    sequenceOutputs: { 'n1:1': { kind: 'sequence', samples: [] } },
    validOutputs: new Set(['n1:0']),
    pendingOutputs: new Set(['n2:0']),
    invalidReasons: {},
    observeBuffers: {},
    observeExtractionRuntime: { n1: { lastEmitTimeMs: 42 } },
    generatorRuntime: {},
    stockRuntime: {},
    simulationTimeMs: 1000,
  };
}

describe('commitExecutionState', () => {
  it('빈 partial — prev 의 모든 필드를 그대로 반환', () => {
    const prev = makeFullState();
    const next = commitExecutionState(prev, {});
    expect(next.values).toBe(prev.values);
    expect(next.sequenceOutputs).toBe(prev.sequenceOutputs);
    expect(next.validOutputs).toBe(prev.validOutputs);
    expect(next.pendingOutputs).toBe(prev.pendingOutputs);
    expect(next.invalidReasons).toBe(prev.invalidReasons);
    expect(next.observeBuffers).toBe(prev.observeBuffers);
    expect(next.observeExtractionRuntime).toBe(prev.observeExtractionRuntime);
    expect(next.generatorRuntime).toBe(prev.generatorRuntime);
    expect(next.stockRuntime).toBe(prev.stockRuntime);
    expect(next.simulationTimeMs).toBe(prev.simulationTimeMs);
  });

  it('partial 명시 필드만 교체, 그 외는 prev 와 동일 참조', () => {
    const prev = makeFullState();
    const newValues = { n1: numericValue(2) };
    const next = commitExecutionState(prev, { values: newValues });
    expect(next.values).toBe(newValues);
    // 나머지 9 필드는 prev 참조 그대로
    expect(next.sequenceOutputs).toBe(prev.sequenceOutputs);
    expect(next.validOutputs).toBe(prev.validOutputs);
    expect(next.pendingOutputs).toBe(prev.pendingOutputs);
    expect(next.invalidReasons).toBe(prev.invalidReasons);
    expect(next.observeBuffers).toBe(prev.observeBuffers);
    expect(next.observeExtractionRuntime).toBe(prev.observeExtractionRuntime);
    expect(next.generatorRuntime).toBe(prev.generatorRuntime);
    expect(next.stockRuntime).toBe(prev.stockRuntime);
    expect(next.simulationTimeMs).toBe(prev.simulationTimeMs);
  });

  it('10 필드 각각 단독 갱신 — 명시된 필드만 교체, 나머지 보존', () => {
    const prev = makeFullState();
    const updates: Array<{ key: keyof ExecutionState; value: unknown }> = [
      { key: 'values', value: { x: numericValue(9) } },
      { key: 'sequenceOutputs', value: {} },
      { key: 'validOutputs', value: new Set<string>() },
      { key: 'pendingOutputs', value: new Set(['z:0']) },
      { key: 'invalidReasons', value: {} },
      { key: 'observeBuffers', value: {} },
      { key: 'observeExtractionRuntime', value: {} },
      { key: 'generatorRuntime', value: {} },
      { key: 'stockRuntime', value: {} },
      { key: 'simulationTimeMs', value: 9999 },
    ];
    for (const { key, value } of updates) {
      const next = commitExecutionState(prev, {
        [key]: value,
      } as Partial<ExecutionState>);
      expect(next[key]).toBe(value);
      for (const otherKey of Object.keys(prev) as Array<keyof ExecutionState>) {
        if (otherKey === key) continue;
        expect(next[otherKey]).toBe(prev[otherKey]);
      }
    }
  });

  it('prev 객체는 mutate 되지 않는다 — 새 객체 반환', () => {
    const prev = makeFullState();
    const snapshot = { ...prev };
    const next = commitExecutionState(prev, { simulationTimeMs: 5 });
    expect(next).not.toBe(prev);
    // prev 의 모든 키가 snapshot 시점 값과 같음
    for (const k of Object.keys(snapshot) as Array<keyof ExecutionState>) {
      expect(prev[k]).toBe(snapshot[k]);
    }
  });
});
