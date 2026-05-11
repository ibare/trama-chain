import { describe, expect, it } from 'vitest';
import { addNode, createEmptyModel, updateNode } from '../src/model/index.js';
import { OperationLog } from '../src/history/index.js';

describe('OperationLog', () => {
  it('records and undos/redos', () => {
    const log = new OperationLog();
    const m0 = createEmptyModel(0);
    const m1 = addNode(m0, {
      id: 'a',
      label: 'A',
      unitId: 'free',
      initialValue: 0,
    });
    log.record({ kind: 'add-node', label: '노드 추가', before: m0, after: m1 });
    expect(log.canUndo()).toBe(true);
    expect(log.canRedo()).toBe(false);
    expect(log.undo()).toBe(m0);
    expect(log.canRedo()).toBe(true);
    expect(log.redo()).toBe(m1);
  });

  it('coalesces consecutive scrub on same node', () => {
    const log = new OperationLog();
    let m = createEmptyModel(0);
    const m0 = m;
    m = addNode(m, { id: 'a', label: 'A', unitId: 'free', initialValue: 0 });
    const m1 = m;
    log.record({ kind: 'add-node', label: 'add', before: m0, after: m1 });

    const m2 = updateNode(m1, 'a', { initialValue: 0.5 });
    log.coalesceWithLast({
      kind: 'scrub-value',
      label: 'scrub',
      before: m1,
      after: m2,
      meta: { nodeId: 'a' },
    });
    // 직전 add-node와는 kind가 다르므로 coalesce 실패 → record로 폴백 필요
    // (실제 coalesceWithLast는 boolean을 반환하므로 호출부가 결정)
    expect(log.depth().undo).toBe(1); // coalesce가 add-node와 안 됨

    // 명시 record
    log.record({
      kind: 'scrub-value',
      label: 'scrub',
      before: m1,
      after: m2,
      meta: { nodeId: 'a' },
    });
    expect(log.depth().undo).toBe(2);

    const m3 = updateNode(m2, 'a', { initialValue: 0.8 });
    const ok = log.coalesceWithLast({
      kind: 'scrub-value',
      label: 'scrub',
      before: m2,
      after: m3,
      meta: { nodeId: 'a' },
    });
    expect(ok).toBe(true);
    expect(log.depth().undo).toBe(2); // 깊이 그대로
    // undo는 이전 scrub의 before로 돌아가야 함
    expect(log.undo()).toBe(m1);
  });

  it('record clears redo stack', () => {
    const log = new OperationLog();
    const m0 = createEmptyModel(0);
    const m1 = addNode(m0, { id: 'a', label: 'A', unitId: 'free', initialValue: 0 });
    log.record({ kind: 'add-node', label: 'add', before: m0, after: m1 });
    log.undo();
    expect(log.canRedo()).toBe(true);
    log.record({ kind: 'add-node', label: 'add2', before: m0, after: m1 });
    expect(log.canRedo()).toBe(false);
  });
});
