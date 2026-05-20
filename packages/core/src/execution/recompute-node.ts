import type { CombinerRegistry } from '../combiners/index.js';
import type { ShapeRegistry } from '../functions/index.js';
import type { Rng } from '../functions/types.js';
import {
  defaultGeneratorRegistry,
  type GeneratorRegistry,
} from '../generators/index.js';
import type { Model, NodeId } from '../model/index.js';
import { defaultUnitCatalog, type UnitCatalog } from '../units/index.js';
import type { ExecValue, SequenceValue } from './exec-value.js';
import { cloneObserveBuffer, type ObserveBuffer } from './observe-buffer.js';
import {
  defaultNodeKindRegistry,
  type NodeKindRegistry,
  type ObserveExtractionRuntime,
  type PropagateContext,
} from './kinds/index.js';
import {
  noopExpressionEvaluator,
  type ExpressionEvaluator,
} from './expression-evaluator.js';
import { defaultRng } from './rng.js';
import { outputKey, type ExecutionState } from './state.js';
import { buildTopology, type InstantaneousTopology } from './topology.js';

export interface RecomputeNodeOptions {
  shapeRegistry: ShapeRegistry;
  combinerRegistry: CombinerRegistry;
  nodeKindRegistry?: NodeKindRegistry;
  unitCatalog?: UnitCatalog;
  rng?: Rng;
  /** LaTeX 식 평가자. 미지정이면 noop (식 노드 결과는 항상 undefined). */
  expressionEvaluator?: ExpressionEvaluator;
  /** Generator paradigm registry. 미지정 시 기본. */
  generatorRegistry?: GeneratorRegistry;
  topology?: InstantaneousTopology;
  /**
   * 펄스가 운반한 source 출력 snapshot. recompute 동안 해당 source 의 해당
   * 슬롯 출력만 이 값으로 간주하고 valid 로 켠다. 다른 입력은 현재 state
   * 그대로 사용. ExecValue — WrappedValue 메타까지 그대로 전달된다.
   *
   * 슬롯 정보가 핵심: Condition 같은 다출력 source 는 펄스가 어느 슬롯에서
   * 왔는지로 valid 슬롯이 결정된다. 슬롯 0 을 가정해 강제로 켜면 반대
   * 슬롯의 stale valid 가 다운스트림에 누설된다.
   */
  sourceOverride?: {
    sourceNodeId: NodeId;
    sourceSlotIndex: number;
    value: ExecValue;
  };
  /**
   * ObserveNode 누적 버퍼의 시작 상태. 미지정이면 빈 버퍼로 시작해 hot-path
   * 단발 호출에서 누적을 버릴 수 있다. 펄스 도착 시 누적이 *유지*되어야 하면
   * 호출자가 현재 `state.observeBuffers`를 전달하고 결과의 `newObserveBuffers`
   * 를 다시 state에 반영한다.
   */
  observeBuffers?: Readonly<Record<NodeId, ObserveBuffer>>;
  /**
   * ObserveNode 추출 throttle 런타임 시작 상태. 미지정이면 빈 객체 — 단발 호출은
   * 보통 본체 passthrough 가 목적이라 추출 발사 여부와 무관하지만, propagate 가
   * runtime 을 읽으므로 일관성을 위해 전달 가능.
   */
  observeExtractionRuntime?: Readonly<Record<NodeId, ObserveExtractionRuntime>>;
  /**
   * 직전 step 의 sequence 채널 출력. 미지정이면 빈 객체로 시작 — 단발 호출이라도
   * AverageNode 등 시퀀스 소비 디스크립터는 ctx.sequenceNext 에서만 읽으므로,
   * 펄스 도착 시 ObserveNode 추출 슬롯의 마지막 스냅샷을 이어보려면 호출자가
   * 현재 `state.sequenceOutputs` 를 전달해야 한다.
   */
  sequenceOutputs?: Readonly<Record<string, SequenceValue>>;
  /**
   * 현재 simulation time(ms). ObserveNode 누적 sample 의 t 값과 throttle 비교
   * 기준으로 쓰인다. 미지정이면 0 — wall-clock 과 무관한 모델 시간.
   */
  simulationTimeMs?: number;
}

export interface RecomputeNodeResult {
  /**
   * 재계산 후의 새 target 값. validOutputs에서 빠진 경우 undefined.
   * WrappedValue 메타까지 보존된 ExecValue — caller 가 다운스트림 펄스로
   * 그대로 운반해 메타 인식 노드(GeneratorNode 등)가 게이트를 읽을 수 있게 한다.
   */
  newValue: ExecValue | undefined;
  /** 노드 단위 valid — 어느 출력 슬롯이라도 valid 면 true. 다출력 노드 일반화. */
  isValid: boolean;
  /** 갱신된 validOutputs 집합 (조건 노드 등 다출력 케이스 포함). */
  validOutputs: Set<string>;
  /** 갱신된 pendingOutputs 집합. 펄스 도착으로 첫 신호가 들어왔다면 키가 삭제됨. */
  pendingOutputs: Set<string>;
  /** target의 모든 출력 슬롯 키. 호출자가 변경 비교에 쓰기 좋게 같이 반환. */
  outputSlotKeys: string[];
  /**
   * 재계산 후의 ObserveNode 누적 버퍼. 호출자가 `observeBuffers`를 넘긴 경우
   * 그 버퍼에 push된 결과가 새 reference로 반환된다 (caller의 입력은 mutate
   * 되지 않음 — 내부에서 clone 후 사용). 미입력이었으면 빈 객체.
   */
  newObserveBuffers: Record<NodeId, ObserveBuffer>;
  /**
   * 재계산 후의 ObserveNode 누적 추출 throttle 런타임. emit 결정으로 갱신될 수
   * 있다. 미입력이었으면 빈 객체.
   */
  newObserveExtractionRuntime: Record<NodeId, ObserveExtractionRuntime>;
  /**
   * 재계산 후의 sequence 채널 출력 작업 버퍼. 누적 추출 슬롯이 발사하면
   * 여기에 SequenceValue 가 기록되어 있다. 호출자가 결과를 state 에 반영할 때
   * sequenceOutputs 와 머지.
   */
  newSequenceOutputs: Record<string, SequenceValue>;
  /**
   * 재계산 후의 invalid 사유 맵. 디스크립터가 평가 실패(예: ExpressionNode 의
   * 변수 미정의) 를 ctx.invalidReasons 에 기록했거나, 평가 성공으로 직전 사유가
   * 제거됐을 수 있다. 호출자가 결과를 state.invalidReasons 에 반영하지 않으면
   * UI 의 invalid 배지가 stale 상태로 남는다.
   */
  newInvalidReasons: ExecutionState['invalidReasons'];
}

/**
 * 단일 노드의 lag=0 입력만으로 출력을 재계산.
 * 전체 그래프 propagate와 달리 위상 순회 없이 *해당 노드만* 디스크립터를 호출.
 * 펄스 도착 시점의 시각·논리적 단위 갱신용.
 *
 * sourceOverride 가 주어지면 그 펄스 source 노드의 *지정 슬롯* 출력만 override
 * 값으로 간주된다. 펄스가 운반한 snapshot 을 그 펄스의 source 슬롯에만 적용.
 */
export function recomputeNode(
  nodeId: NodeId,
  state: ExecutionState,
  model: Model,
  options: RecomputeNodeOptions,
): RecomputeNodeResult {
  const node = model.nodes[nodeId];
  // 입력 버퍼는 clone — descriptor가 mutate해도 caller의 source는 건드리지 않는다.
  const seedBuffers: Record<NodeId, ObserveBuffer> = {};
  if (options.observeBuffers) {
    for (const [nid, buf] of Object.entries(options.observeBuffers)) {
      seedBuffers[nid] = cloneObserveBuffer(buf);
    }
  }
  const seedExtractionRuntime: Record<NodeId, ObserveExtractionRuntime> = {};
  if (options.observeExtractionRuntime) {
    for (const [nid, rt] of Object.entries(options.observeExtractionRuntime)) {
      seedExtractionRuntime[nid] = { ...rt };
    }
  }
  const seedSequenceOutputs: Record<string, SequenceValue> = {
    ...(options.sequenceOutputs ?? {}),
  };

  if (!node) {
    return {
      newValue: undefined,
      isValid: false,
      validOutputs: new Set(state.validOutputs),
      pendingOutputs: new Set(state.pendingOutputs),
      outputSlotKeys: [],
      newObserveBuffers: seedBuffers,
      newObserveExtractionRuntime: seedExtractionRuntime,
      newSequenceOutputs: seedSequenceOutputs,
      newInvalidReasons: { ...state.invalidReasons },
    };
  }

  const nodeKindRegistry = options.nodeKindRegistry ?? defaultNodeKindRegistry;
  const desc = nodeKindRegistry.forNode(node);
  if (!desc) {
    return {
      newValue: state.values[nodeId],
      isValid: state.validOutputs.has(outputKey(nodeId, 0)),
      validOutputs: new Set(state.validOutputs),
      pendingOutputs: new Set(state.pendingOutputs),
      outputSlotKeys: [outputKey(nodeId, 0)],
      newObserveBuffers: seedBuffers,
      newObserveExtractionRuntime: seedExtractionRuntime,
      newSequenceOutputs: seedSequenceOutputs,
      newInvalidReasons: { ...state.invalidReasons },
    };
  }

  const topology = options.topology ?? buildTopology(model);
  const incoming = topology.incomingByTarget.get(nodeId) ?? [];

  // 작업용 카피. 디스크립터가 mutate해도 caller의 state는 건드리지 않음.
  const workingValues: Record<NodeId, ExecValue> = { ...state.values };
  const workingValid = new Set(state.validOutputs);
  const workingPending = new Set(state.pendingOutputs);
  const workingInvalidReasons: ExecutionState['invalidReasons'] = {
    ...state.invalidReasons,
  };

  // 펄스 snapshot override 적용 — 펄스가 운반한 source 의 *지정 슬롯* 만 valid
  // 로 켜고 값을 박는다. 슬롯 0 을 가정해 켜면 Condition 같은 분기 source 에서
  // 반대 슬롯이 stale valid 로 commit 돼 다운스트림 케이블이 잘못 solid 로 그려진다.
  //
  // override 가 *branching 슬롯* 인 경우, 같은 source 의 다른 branching 슬롯들의
  // stale valid 를 제거 — 분기 source 는 라우팅이 런타임에 확정되므로 한 시점에
  // 한 branching 슬롯만 valid 가 시각·인과 일관성. ConditionNode 의 슬롯 0/1
  // 처럼 모두 branching 인 노드만 영향. LogicGate (슬롯 0 만 branching) 는 다른
  // branching 슬롯이 없어 동작 무변경.
  if (options.sourceOverride) {
    const { sourceNodeId, sourceSlotIndex, value } = options.sourceOverride;
    workingValues[sourceNodeId] = value;
    const sourceNode = model.nodes[sourceNodeId];
    const sourceDesc = sourceNode ? nodeKindRegistry.forNode(sourceNode) : undefined;
    if (sourceNode && sourceDesc) {
      const slots = sourceDesc.outputSlots(sourceNode, {
        model,
        registry: nodeKindRegistry,
      });
      const overrideSlot = slots.find((s) => s.index === sourceSlotIndex);
      if (overrideSlot?.branching) {
        for (const slot of slots) {
          if (slot.index !== sourceSlotIndex && slot.branching) {
            workingValid.delete(outputKey(sourceNodeId, slot.index));
          }
        }
      }
    }
    workingValid.add(outputKey(sourceNodeId, sourceSlotIndex));
  }

  const ctx: PropagateContext = {
    model,
    incoming,
    next: workingValues,
    validOutputs: workingValid,
    pendingOutputs: workingPending,
    invalidReasons: workingInvalidReasons,
    catalog: options.unitCatalog ?? defaultUnitCatalog,
    shapeRegistry: options.shapeRegistry,
    combinerRegistry: options.combinerRegistry,
    nodeKindRegistry,
    expressionEvaluator: options.expressionEvaluator ?? noopExpressionEvaluator,
    rng: options.rng ?? defaultRng,
    observeBuffers: seedBuffers,
    observeExtractionRuntime: seedExtractionRuntime,
    // recomputeNode는 단일 target만 propagate — generator는 target이 될 수 없으니
    // 빈 runtime + 기본 registry로 충분. ctx 인터페이스 만족을 위해 채워둔다.
    generatorRuntime: {},
    generatorRegistry: options.generatorRegistry ?? defaultGeneratorRegistry,
    sequenceNext: seedSequenceOutputs,
    simulationTimeMs: options.simulationTimeMs ?? 0,
    // recomputeNode는 펄스 도착 시점의 단일 노드 갱신 — 시간이 흐르고 있는 step.
    // 펄스가 실제로 운반된 시점이므로 ValueNode propagate가 source 변화를 흡수해야
    // pending 상태를 valid 로 승격시킬 수 있다.
    paused: false,
    // 펄스 도착은 시각·논리적 단위 갱신 — 시간 적분(Stock 등) 은 일어나지 않는다.
    // RAF tickStocks 가 적분의 단일 출처이므로 여기서는 dt=0 로 prev level 유지.
    stepIntervalMs: 0,
    setSlotValid(slotKey) {
      workingValid.add(slotKey);
      workingPending.delete(slotKey);
    },
    setSlotInvalid(slotKey) {
      workingValid.delete(slotKey);
    },
    setInvalidReason(nodeId, reason) {
      workingInvalidReasons[nodeId] = reason;
    },
    clearInvalidReason(nodeId) {
      delete workingInvalidReasons[nodeId];
    },
  };

  desc.propagate(node, ctx);

  // 디스크립터가 정의한 출력 슬롯을 그대로 사용 — Condition(2 슬롯)·Observe(추출
  // 슬롯 포함) 같은 다출력 노드도 일반화 경로로 다룬다. 단출력 노드는 길이 1.
  const slots = desc.outputSlots(node, { model, registry: nodeKindRegistry });
  const outputSlotKeys = slots.map((s) => outputKey(nodeId, s.index));
  // 노드 단위 valid — "어느 슬롯이라도 valid" 면 노드가 valid. caller 의
  // becameInvalid 판정(노드 valid→invalid 전이만 전체 재계산) 의 기준이 된다.
  const isValid = outputSlotKeys.some((k) => workingValid.has(k));

  return {
    newValue: workingValues[nodeId],
    isValid,
    validOutputs: workingValid,
    pendingOutputs: workingPending,
    outputSlotKeys,
    newObserveBuffers: seedBuffers,
    newObserveExtractionRuntime: seedExtractionRuntime,
    newSequenceOutputs: seedSequenceOutputs,
    newInvalidReasons: workingInvalidReasons,
  };
}
