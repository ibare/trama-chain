import { describe, expect, it } from 'vitest';
import {
  addEdge,
  addValueNode,
  createEmptyModel,
  setExecution,
  setQuestion,
} from '../src/model/index.js';
import { createDefaultCombinerRegistry } from '../src/combiners/index.js';
import { createDefaultShapeRegistry } from '../src/functions/index.js';
import {
  TramaParseError,
  documentToModel,
  extractAndParseTramaFromMarkdown,
  modelToDocument,
  parseTrama,
  serializeTrama,
  serializeTramaMarkdown,
} from '../src/schema/index.js';

const shapes = createDefaultShapeRegistry();
const combiners = createDefaultCombinerRegistry();

function buildModel() {
  let m = createEmptyModel(1731234567890);
  m = { ...m, id: 'mdl-test', createdAt: 1731234567890, updatedAt: 1731234567890 };
  m = setQuestion(m, '왜 내 체중이 늘지?', 1731234567890);
  m = addValueNode(m, {
    id: 'n-weight',
    label: '체중',
    unitId: 'kg',
    unitOverride: { min: 40, max: 110 },
    initialValue: 70,
    position: { x: 540, y: 170 },
    combiner: 'sum',
    isFocal: true,
  });
  m = addValueNode(m, {
    id: 'n-intake',
    label: '섭취량',
    unitId: 'count',
    unitOverride: { min: 0, max: 4000, suffix: 'kcal' },
    initialValue: 2200,
    position: { x: 200, y: 170 },
  });
  m = addEdge(m, {
    id: 'e-1',
    from: 'n-intake',
    to: 'n-weight',
    shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
  });
  return m;
}

describe('serialize / parse round-trip', () => {
  it('round-trips simple model deterministically', () => {
    const m = buildModel();
    const doc1 = modelToDocument(m);
    const json1 = serializeTrama(doc1);
    const doc2 = parseTrama(json1);
    const json2 = serializeTrama(doc2);
    expect(json1).toBe(json2);

    // 모델로 되돌려도 동등
    const m2 = documentToModel(doc2);
    const json3 = serializeTrama(modelToDocument(m2));
    expect(json3).toBe(json1);
  });

  it('deterministic key ordering', () => {
    const m = buildModel();
    const json = serializeTrama(modelToDocument(m));
    // 최상위 첫 키는 'trama', 마지막은 'edges'
    const firstKeyMatch = /^{\s*"([^"]+)":/.exec(json);
    expect(firstKeyMatch?.[1]).toBe('trama');
    // 노드 첫 키는 'kind' (discriminator 우선)
    const nodeKeyMatch = /"nodes":\s*\[\s*\{\s*"([^"]+)":/.exec(json);
    expect(nodeKeyMatch?.[1]).toBe('kind');
  });

  it('rejects malformed JSON', () => {
    expect(() => parseTrama('{not json}')).toThrow(TramaParseError);
  });

  it('rejects wrong trama version', () => {
    expect(() =>
      parseTrama(
        JSON.stringify({
          trama: '2',
          id: 'x',
          question: null,
          createdAt: 0,
          updatedAt: 0,
          execution: { steps: 1, stepUnit: null },
          nodes: [],
          edges: [],
        }),
      ),
    ).toThrow(TramaParseError);
  });

  it('rejects unregistered shape with registry', () => {
    const doc = modelToDocument(buildModel());
    doc.edges[0]!.shape.kind = 'nope';
    expect(() => parseTrama(serializeTrama(doc), { shapeRegistry: shapes })).toThrow(
      /not registered/,
    );
  });

  it('rejects unregistered combiner with registry', () => {
    const doc = modelToDocument(buildModel());
    const n0 = doc.nodes[0]!;
    if (n0.kind === 'value') n0.combiner = 'nope';
    expect(() =>
      parseTrama(serializeTrama(doc), { combinerRegistry: combiners }),
    ).toThrow(/combiner.*not registered/);
  });

  it('rejects invalid shape params', () => {
    const doc = modelToDocument(buildModel());
    doc.edges[0]!.shape.params = { slope: 'not a number' };
    expect(() => parseTrama(serializeTrama(doc), { shapeRegistry: shapes })).toThrow(
      /invalid params/,
    );
  });

  it('rejects instantaneous (lag=0) cycle', () => {
    const doc = modelToDocument(buildModel());
    doc.edges.push({
      id: 'e-cycle',
      from: 'n-weight',
      to: 'n-intake',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      inverted: false,
      lag: 0,
      description: null,
    });
    expect(() => parseTrama(serializeTrama(doc))).toThrow(/cycle/);
  });

  it('allows feedback (lag=1) cycle', () => {
    const doc = modelToDocument(buildModel());
    doc.edges.push({
      id: 'e-feedback',
      from: 'n-weight',
      to: 'n-intake',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      inverted: false,
      lag: 1,
      description: null,
    });
    expect(() => parseTrama(serializeTrama(doc))).not.toThrow();
  });

  it('extracts from markdown fence', () => {
    const m = buildModel();
    const md = `# 어떤 메모\n\n앞 문단.\n\n${serializeTramaMarkdown(modelToDocument(m))}\n뒷 문단.`;
    const doc = extractAndParseTramaFromMarkdown(md);
    expect(doc.id).toBe('mdl-test');
  });

  it('rejects markdown without trama fence', () => {
    expect(() => extractAndParseTramaFromMarkdown('# 그냥 메모')).toThrow(/no .*fence/);
  });

  it('round-trips slot machine example with feedback + iteration', () => {
    let m = createEmptyModel(1731234567890);
    m = { ...m, id: 'mdl-slot', createdAt: 1731234567890, updatedAt: 1731234567890 };
    m = setQuestion(m, '천만원으로 슬롯머신 200번 돌리면 얼마 남을까?', 1731234567890);
    m = setExecution(m, { steps: 200, stepUnit: '회' });
    m = addValueNode(m, {
      id: 'n-balance',
      label: '잔액',
      unitId: 'krw',
      unitOverride: { min: 0, max: 30000000 },
      initialValue: 10000000,
      position: { x: 400, y: 170 },
      combiner: 'sum',
      isFocal: true,
    });
    m = addValueNode(m, {
      id: 'n-outcome',
      label: '회당 결과',
      unitId: 'krw',
      unitOverride: { min: -1000000, max: 5000000 },
      initialValue: 0,
      position: { x: 250, y: 170 },
    });
    m = addEdge(m, {
      id: 'e-outcome-balance',
      from: 'n-outcome',
      to: 'n-balance',
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
      lag: 1,
    });
    const json = serializeTrama(modelToDocument(m));
    const doc = parseTrama(json);
    expect(serializeTrama(doc)).toBe(json);
    expect(doc.execution.steps).toBe(200);
    expect(doc.execution.stepUnit).toBe('회');
    expect(doc.edges[0]!.lag).toBe(1);
  });
});
