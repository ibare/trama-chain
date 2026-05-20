import { afterEach, describe, expect, it } from 'vitest';
import { createFakeTimeline, type FakeTimeline } from './helpers/pulse-registry-deps.js';
import { createTestModelStore, type TestModelStore } from './helpers/test-model-store.js';

/**
 * 단기 (P1~P5) + 중기 (P6~P10) fix 의 통합 회귀 (T20).
 * model-store 부트스트랩 헬퍼 위에서 시뮬레이션 전 사이클을 한 번에 거쳐
 * 핵심 결합 동작이 깨지지 않는지를 본다.
 */
describe('단기+중기 통합 회귀 (T20)', () => {
  let env: TestModelStore | null = null;
  let timeline: FakeTimeline | null = null;
  afterEach(() => {
    env?.dispose();
    env = null;
    timeline?.restore();
    timeline = null;
  });

  it('paused→unpause 시 시드 펄스의 startTime 이 pausedAt 보정 후 값 (P10 phase 순서 + 단기 P3 일관 commit)', () => {
    // 시간 축 mock 을 먼저 박아야 createPulseRegistry 가 pausedAt 을 1000 으로 잡음.
    timeline = createFakeTimeline(1000);
    env = createTestModelStore({ paused: true });

    // ValueNode A, B 추가. A→B linear edge — A 가 unpause 시 시드 spawn 대상.
    env.modelStore.getState().addNode({
      label: 'A',
      unitId: 'count',
      unitOverride: { min: 0, max: 10 },
      initialNumber: 5,
    });
    env.modelStore.getState().addNode({
      label: 'B',
      unitId: 'count',
      unitOverride: { min: 0, max: 10 },
      initialNumber: 0,
    });
    const order = env.modelStore.getState().model.nodeOrder;
    const [a, b] = [order[0]!, order[1]!];
    env.modelStore.getState().addEdge({
      from: a,
      to: b,
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    });

    expect(env.pulseRegistry.getActive()).toEqual([]);

    // paused 인 채로 500ms 가상 진행. pulse-registry pausedAt 은 여전히 1000.
    timeline.advance(500);

    // unpause — orchestrator 가 time-axis(pausedAt=null 보정) → effects(spawn) 순서로 호출.
    env.timeSettingsStore.getState().setPaused(false);

    const active = env.pulseRegistry.getActive();
    expect(active.length).toBeGreaterThan(0);
    // pausedAt 이 null 로 봉합된 후에 spawn 이 일어나야 startTime 이 보정된 현재
    // 시각(1500) 으로 박힌다. phase 순서가 뒤집히면 startTime === 1000 으로 박혀
    // travelDuration 동안 이미 지나간 시간으로 잡혀 즉시 도착으로 오작동한다.
    expect(active[0]!.startTime).toBe(1500);
  });

  it('모델 편집 후 executionState.simulationTimeMs 가 0 유지 — UI isInitial sentinel 호환 (P9 옵션 A 회귀 보호)', () => {
    // P9 의 ExecuteOptions.stepIntervalMs 옵션 자체는 core 의 execute-time-axis.test.ts
    // 가 검증. 여기는 model-store 의 호출자 정책 — 모델 편집(fresh 재구성) 은
    // 시간이 흐르지 않는 정적 재계산이므로 simulationTimeMs 가 0 유지되어야
    // ValueNodeView/BooleanValueNodeView 의 `simulationTimeMs === 0` isInitial
    // sentinel 과 첫 ▶ 시드 분기 sentinel 이 깨지지 않는다.
    env = createTestModelStore({ paused: true });
    env.modelStore.getState().addNode({
      label: 'A',
      unitId: 'count',
      unitOverride: { min: 0, max: 10 },
      initialNumber: 5,
    });
    env.modelStore.getState().setExecution({ steps: 3 });

    expect(env.modelStore.getState().executionState.simulationTimeMs).toBe(0);
    // trajectory 도 모든 step 0 유지 — 실 시간 누적은 RAF stepTicker 단독 책임.
    for (const s of env.modelStore.getState().trajectory) {
      expect(s.simulationTimeMs).toBe(0);
    }
  });

  it('실행 중 scrubInitialValue 는 모델 무변경 + executionState.values 만 박제 (사용자 매뉴얼 송출)', () => {
    // paused 상태에서 노드를 만들고 (assertEditable 우회), 실행으로 전환한 뒤
    // scrubInitialValue 의 실행 중 분기를 검증.
    env = createTestModelStore({ paused: true });
    env.modelStore.getState().addNode({
      label: 'A',
      unitId: 'count',
      unitOverride: { min: 0, max: 10 },
      initialNumber: 3,
    });
    const a = env.modelStore.getState().model.nodeOrder[0]!;
    env.timeSettingsStore.getState().setPaused(false);

    const before = env.modelStore.getState();
    const aNodeBefore = before.model.nodes[a]!;

    env.modelStore.getState().scrubInitialValue(a, 7);

    const after = env.modelStore.getState();
    // 실행 중에는 모델 mutation 금지 — assertEditable 단언과 충돌 없이 통과.
    expect(after.model.nodes[a]).toBe(aNodeBefore);
    // executionState.values 는 박제됨 — 사용자 슬라이더 → 즉시 표시 + 다음
    // 펄스 송출 시 새 값이 흘러간다.
    const v = after.executionState.values[a];
    expect(v && v.kind === 'numeric' ? v.n : null).toBe(7);
  });

  it('paused 중 scrubInitialValue 는 노드 값만 박제, 다운스트림 ValueNode 는 즉시 변하지 않음 (단기 P5)', () => {
    env = createTestModelStore({ paused: true });
    env.modelStore.getState().addNode({
      label: 'A',
      unitId: 'count',
      unitOverride: { min: 0, max: 10 },
      initialNumber: 3,
    });
    env.modelStore.getState().addNode({
      label: 'B',
      unitId: 'count',
      unitOverride: { min: 0, max: 10 },
      initialNumber: 0,
    });
    const order = env.modelStore.getState().model.nodeOrder;
    const [a, b] = [order[0]!, order[1]!];
    env.modelStore.getState().addEdge({
      from: a,
      to: b,
      shape: { kind: 'linear', params: { slope: 1, offset: 0 } },
    });

    const stateBefore = env.modelStore.getState();
    const aValueBefore = stateBefore.model.nodes[a]!;
    const bValueBefore = stateBefore.executionState.values[b];

    env.modelStore.getState().scrubInitialValue(a, 8);

    const stateAfter = env.modelStore.getState();
    const aNodeAfter = stateAfter.model.nodes[a]! as typeof aValueBefore;
    // ValueNode A 의 initialValue 는 박제되어야.
    expect(aNodeAfter).not.toBe(aValueBefore);
    // 그러나 다운스트림 B 의 executionState 는 변하지 않음 — paused 가드가
    // ValueNode propagate 의 source 흡수를 차단했기 때문 (effect 는 펄스 도착에서만).
    expect(stateAfter.executionState.values[b]).toBe(bValueBefore);
  });
});
