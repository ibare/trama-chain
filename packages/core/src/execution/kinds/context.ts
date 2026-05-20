import type { CombinerRegistry } from '../../combiners/index.js';
import type { ShapeRegistry } from '../../functions/index.js';
import type { Rng } from '../../functions/types.js';
import type { Edge, Model, NodeId } from '../../model/index.js';
import type {
  GeneratorRegistry,
  GeneratorRuntime,
} from '../../generators/index.js';
import type { ResolvedUnit, UnitCatalog } from '../../units/index.js';
import type {
  ExecValue,
  SequenceValue,
} from '../exec-value.js';
import type {
  EvalDiagnosis,
  ExpressionEvaluator,
} from '../expression-evaluator.js';
import type { ObserveBuffer } from '../observe-buffer.js';
import type { NodeKindRegistry } from './index.js';

/**
 * ObserveNode 의 누적 추출 슬롯 런타임 상태. throttle 정책의 마지막 emit 시각을
 * 박제해 다음 propagate 가 발사 여부를 결정한다. realtime 모드에서는 사실상
 * 사용되지 않지만 일관된 형태로 유지.
 *
 * `state.ts` 의 ExecutionState 가 이 타입을 참조하지만, kinds → state 의
 * 단방향 import 를 유지하기 위해 이 자리에 정의.
 */
export interface ObserveExtractionRuntime {
  lastEmitTimeMs: number;
}

/**
 * 단위가 명시되지 않은 raw 출력 노드(상수·조건 게이트·식)의 폴백.
 * 값은 raw로 흐르고, 시각화 단계에서 자동 단위 추론이 동작한다.
 */
export const FREE_FALLBACK: ResolvedUnit = {
  id: 'free',
  kind: 'free',
  suffix: '',
  labels: [],
  min: 0,
  max: 1,
  step: 0.01,
};

/**
 * 한 노드의 lag=0 전파 단계에서 디스크립터가 사용하는 컨텍스트.
 * next/validOutputs는 의도적으로 가변(mutate) — 한 step 내에서 디스크립터가
 * 직접 갱신해 다음 노드로 흘러간다.
 */
export interface PropagateContext {
  model: Model;
  incoming: ReadonlyArray<Edge>;
  /**
   * 노드별 출력값(작업 버퍼). 타입은 [[ExecValue]] — Value 또는 WrappedValue.
   * 디스크립터가 알맹이만 보고 싶다면 `unwrap(ctx.next[id])` 또는 헬퍼
   * `getNumericNext`/`getBooleanNext`/`getAnyNext` 를 통해 자동 unwrap 된 값을 사용.
   * 메타까지 보고 분기하는 디스크립터(예: Generator gate)는 raw 그대로 읽는다.
   */
  next: Record<NodeId, ExecValue>;
  validOutputs: Set<string>;
  /**
   * "토폴로지 정상, 첫 신호 미도착" 슬롯 집합. ValueNode 처럼 incoming 엣지가
   * 있어 stored state(initialValue) 권위를 잃은 노드가 아직 어떤 펄스도
   * 받지 못한 상태를 표시한다. 디스크립터가 성공적으로 갱신하면 키를
   * 삭제한다. valid 와 상호 배타.
   */
  pendingOutputs: Set<string>;
  /**
   * 노드별 마지막 실패 사유 (UI invalid 배지/툴팁 노출용).
   * 디스크립터가 평가에 실패하면 여기에 기록하고, 성공하면 키를 삭제한다.
   */
  invalidReasons: Record<NodeId, EvalDiagnosis & { ok: false }>;
  catalog: UnitCatalog;
  shapeRegistry: ShapeRegistry;
  combinerRegistry: CombinerRegistry;
  nodeKindRegistry: NodeKindRegistry;
  expressionEvaluator: ExpressionEvaluator;
  rng: Rng;
  /**
   * ObserveNode 가 통과한 값을 시간순으로 누적해 두는 sample 버퍼.
   * 각 sample 은 (value, t) — t 는 누적 당시 simulation time(ms).
   * 디스크립터가 mutate하며, propagateOneStep 이 결과를 ExecutionState 로 회수한다.
   * runtime-only — 직렬화되지 않는다.
   */
  observeBuffers: Record<NodeId, ObserveBuffer>;
  /**
   * ObserveNode 추출 슬롯 throttle 런타임. 마지막 emit 시각(simulation time)을
   * 박제해 다음 propagate 가 발사 여부를 결정. runtime-only.
   */
  observeExtractionRuntime: Record<NodeId, ObserveExtractionRuntime>;
  /**
   * GeneratorNode의 cursor·gate 캐시. propagate가 emit할 때 mutate한다.
   * runtime-only — 직렬화되지 않는다.
   */
  generatorRuntime: Record<NodeId, GeneratorRuntime>;
  /** 등록된 패러다임 모음. emit 라우팅에 사용. */
  generatorRegistry: GeneratorRegistry;
  /**
   * Sequence 채널 출력 작업 버퍼. 키: outputKey(nodeId, slot). 누적 추출 등
   * sequence PortSpec slot 의 SequenceValue 스냅샷을 디스크립터가 여기 기록한다.
   * 스칼라 [[next]] 와 분리된 채널.
   */
  sequenceNext: Record<string, SequenceValue>;
  /** 현재 simulation time(ms). 이 step 내 누적·emit 시각의 기준. */
  simulationTimeMs: number;
  /**
   * 이번 step 의 시뮬레이션 시간 증분(ms). 시간 적분이 필요한 노드(Stock 등)가
   * `dt = stepIntervalMs / 1000` 로 환산해 사용. 0 이면 시간이 흐르지 않은 step
   * (수동 recompute·노드 편집 후 재계산 등) — 시간 적분 노드는 이번 step 에서
   * 적분하지 않고 직전 상태를 보존한다.
   */
  stepIntervalMs: number;
  /**
   * 멈춤 상태. true 면 ValueNode 처럼 펄스 도착으로만 갱신되는 노드는 이번
   * 단계에서 source 변화를 흡수하지 않는다 — pending 이면 pending 유지, valid
   * 였다면 마지막 수신값 유지. 시간이 흐르는 step(!paused)에서만 contribute
   * 결합·갱신이 일어난다.
   */
  paused: boolean;
  /**
   * 슬롯을 valid 로 켜고 pending 에서 제거 — `validOutputs.add(k) +
   * pendingOutputs.delete(k)` 의 캡슐화. 디스크립터는 set 을 직접 mutate 하는
   * 대신 이 헬퍼를 통해 valid ↔ pending 상호 배타 invariant 를 자동 보장한다.
   * 직접 set 노출도 호환 유지 — 점진 교체.
   */
  setSlotValid(slotKey: string): void;
  /**
   * 슬롯의 valid 를 끈다. pending 은 호출자 정책 — invalidate 가 의도하는
   * 의미가 "토폴로지 유효, 첫 신호 미도착(pending)" 인지 "토폴로지 유효하지만
   * 평가 실패(invalid)" 인지가 다르므로 자동 pending 복귀는 하지 않는다.
   */
  setSlotInvalid(slotKey: string): void;
  /** 노드의 invalid 사유를 갱신. UI invalid 배지/툴팁이 이 맵을 읽는다. */
  setInvalidReason(nodeId: NodeId, reason: EvalDiagnosis & { ok: false }): void;
  /** 노드의 invalid 사유 제거. 평가 성공으로 사유가 더 이상 유효하지 않을 때. */
  clearInvalidReason(nodeId: NodeId): void;
}

/**
 * PortType 해석에 필요한 컨텍스트. ObserveNode처럼 입력 엣지의 source PortType을
 * 따라가는 passthrough 노드만 사용한다. 다른 노드는 인자를 무시.
 *
 * 정적 시점(메뉴 후보 계산 등)에서는 ctx 없이 호출될 수 있어 optional —
 * ctx가 없으면 디스크립터는 정적 폴백을 반환한다.
 */
export interface PortTypeContext {
  model: Model;
  registry: NodeKindRegistry;
}
