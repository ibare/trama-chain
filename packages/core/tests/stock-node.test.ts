import { describe, expect, it } from 'vitest';
import {
  addConstantNode,
  addEdge,
  addStockNode,
  createDefaultCombinerRegistry,
  createEmptyModel,
  documentToModel,
  initializeFromInitialValues,
  isStockNode,
  modelToDocument,
  outputKey,
  propagateOneStep,
  TramaDocumentSchema,
} from '../src/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';
import type { ExecutionState } from '../src/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

const FIXED_DT_MS = 1000 / 60;

function step(
  state: ExecutionState,
  model: Parameters<typeof propagateOneStep>[1],
  stepIntervalMs = FIXED_DT_MS,
) {
  return propagateOneStep(state, model, {
    shapeRegistry: shapes,
    combinerRegistry: combiners,
    stepIntervalMs,
    paused: false,
  });
}

function getLevel(state: ExecutionState, id: string): number | undefined {
  const v = state.values[id];
  return v && v.kind === 'numeric' ? v.n : undefined;
}

describe('StockNode — 모델·스키마', () => {
  it('addStockNode 는 kind=stock 기본 capacity={null,null}, initialLevel=0', () => {
    let m = createEmptyModel(0);
    m = addStockNode(m, { id: 's', label: '탱크' }, 0);
    const n = m.nodes['s']!;
    expect(isStockNode(n)).toBe(true);
    if (isStockNode(n)) {
      expect(n.initialLevel).toBe(0);
      expect(n.capacity).toEqual({ min: null, max: null });
      expect(n.unitId).toBe('free');
    }
  });

  it('round-trip: modelToDocument → schema parse → documentToModel 동일성 보존', () => {
    let m = createEmptyModel(0);
    m = addStockNode(
      m,
      {
        id: 's',
        label: '저수조',
        unitId: 'free',
        initialLevel: 5,
        capacity: { min: 0, max: 10 },
      },
      0,
    );
    const doc = modelToDocument(m);
    const parsed = TramaDocumentSchema.parse(doc);
    const round = documentToModel(parsed);
    const n = round.nodes['s']!;
    expect(isStockNode(n)).toBe(true);
    if (isStockNode(n)) {
      expect(n.initialLevel).toBe(5);
      expect(n.capacity).toEqual({ min: 0, max: 10 });
    }
  });
});

describe('StockNode — propagate 시맨틱 (no-op preserve)', () => {
  it('펄스 없이 propagateOneStep 호출 — level 이 initialLevel 로 유지', () => {
    let m = createEmptyModel(0);
    m = addStockNode(m, { id: 's', label: '탱크', initialLevel: 7 }, 0);
    let st = initializeFromInitialValues(m);
    for (let i = 0; i < 5; i++) st = step(st, m);
    expect(getLevel(st, 's')).toBeCloseTo(7, 10);
    expect(st.validOutputs.has(outputKey('s', 0))).toBe(true);
  });

  it('inflow source 가 valid 여도 propagate 만으로는 누적되지 않는다', () => {
    // 누적은 handlePulseArrival 에서만 일어난다. ConstantNode 를 슬롯 0 에 물려도
    // propagateOneStep 단독으로는 펄스가 도착하지 않아 level 은 prev 를 유지.
    let m = createEmptyModel(0);
    m = addConstantNode(m, { id: 'k', label: 'k', value: 1000 }, 0);
    m = addStockNode(
      m,
      {
        id: 's',
        label: '탱크',
        initialLevel: 3,
        capacity: { min: null, max: null },
      },
      0,
    );
    m = addEdge(
      m,
      {
        from: 'k',
        to: 's',
        shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
        slotIndex: 0,
      },
      0,
    );
    let st = initializeFromInitialValues(m);
    for (let i = 0; i < 5; i++) st = step(st, m);
    expect(getLevel(st, 's')).toBeCloseTo(3, 10);
  });

  it('overflow / rate 슬롯은 propagate 경로에서 항상 invalid (펄스 도착 사건 전용)', () => {
    let m = createEmptyModel(0);
    m = addStockNode(m, { id: 's', label: '탱크', initialLevel: 0 }, 0);
    let st = initializeFromInitialValues(m);
    for (let i = 0; i < 3; i++) st = step(st, m);
    expect(st.validOutputs.has(outputKey('s', 0))).toBe(true);
    expect(st.validOutputs.has(outputKey('s', 1))).toBe(false);
    expect(st.validOutputs.has(outputKey('s', 2))).toBe(false);
  });
});
