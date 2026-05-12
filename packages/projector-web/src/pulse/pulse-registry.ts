import type { EdgeId, NodeId } from '@trama/core';
import { tokens } from '@trama/tokens';
import { registerTicker } from '../canvas/animation-loop.js';
import { getCurrentTravelSpeedMultiplier } from '../store/pulse-settings.js';

/**
 * 활성 펄스 lifecycle을 관리. spawn → 매 프레임 진행 → 도착 시 arrivalHandler 호출 → 제거.
 * 활성 펄스 0개가 되면 RAF ticker 자동 해제. 케이블 좌표 같은 시각 정보는 모르고
 * "t와 도달 여부"만 다룬다 — DOM 위치 갱신은 PulseLayer가 별도 ticker로.
 */

const BASE_TRAVEL_MS = parseFloat(tokens.motion.durationPulseTravel);

export interface Pulse {
  id: string;
  edgeId: EdgeId;
  sourceNodeId: NodeId;
  sourceSlotIndex: number;
  targetNodeId: NodeId;
  /** spawn 시점에 박제. 도착 후 target 재계산 시 이 source의 출력으로 사용. */
  sourceValue: number;
  /** performance.now() 기준 spawn 시각. */
  startTime: number;
  /** spawn 시점에 (BASE_TRAVEL_MS * multiplier)로 박제. */
  travelDurationMs: number;
}

export interface PulseSpawnArgs {
  edgeId: EdgeId;
  sourceNodeId: NodeId;
  sourceSlotIndex: number;
  targetNodeId: NodeId;
  sourceValue: number;
}

type ArrivalHandler = (pulse: Pulse) => void;
type Listener = () => void;

const pulses = new Map<string, Pulse>();
const listSubscribers = new Set<Listener>();
const tickSubscribers = new Set<Listener>();
let arrivalHandler: ArrivalHandler | null = null;
let unregisterTicker: (() => void) | null = null;
let nextPulseSerial = 1;
// useSyncExternalStore 안정성을 위해 스냅샷을 캐시. spawn/remove 시에만 무효화.
const EMPTY_SNAPSHOT: readonly Pulse[] = Object.freeze([]);
let cachedSnapshot: readonly Pulse[] = EMPTY_SNAPSHOT;

function invalidateSnapshot(): void {
  cachedSnapshot =
    pulses.size === 0 ? EMPTY_SNAPSHOT : Object.freeze(Array.from(pulses.values()));
}

function ensureTicker(): void {
  if (unregisterTicker !== null) return;
  unregisterTicker = registerTicker(advance);
}

function maybeStopTicker(): void {
  if (pulses.size === 0 && unregisterTicker !== null) {
    unregisterTicker();
    unregisterTicker = null;
  }
}

function notifyList(): void {
  for (const fn of listSubscribers) fn();
}

function notifyTick(): void {
  for (const fn of tickSubscribers) fn();
}

function advance(): void {
  const now = performance.now();
  const arrived: Pulse[] = [];
  for (const p of pulses.values()) {
    if (now - p.startTime >= p.travelDurationMs) arrived.push(p);
  }

  if (arrived.length > 0) {
    for (const p of arrived) pulses.delete(p.id);
    // arrivalHandler 호출이 spawn을 더 만들 수 있다 — 그래도 안전 (pulses Map 직접 조작).
    if (arrivalHandler) {
      for (const p of arrived) arrivalHandler(p);
    }
    invalidateSnapshot();
    notifyList();
    maybeStopTicker();
  }

  // 매 프레임 위치 갱신용 (도착 처리와 무관하게 호출).
  notifyTick();
}

export function setArrivalHandler(h: ArrivalHandler | null): void {
  arrivalHandler = h;
}

export function spawnPulse(args: PulseSpawnArgs): Pulse {
  const multiplier = getCurrentTravelSpeedMultiplier();
  const pulse: Pulse = {
    id: `p-${nextPulseSerial++}`,
    edgeId: args.edgeId,
    sourceNodeId: args.sourceNodeId,
    sourceSlotIndex: args.sourceSlotIndex,
    targetNodeId: args.targetNodeId,
    sourceValue: args.sourceValue,
    startTime: performance.now(),
    travelDurationMs: BASE_TRAVEL_MS * multiplier,
  };
  pulses.set(pulse.id, pulse);
  invalidateSnapshot();
  ensureTicker();
  notifyList();
  return pulse;
}

/** 도달 시점 진행도 t ∈ [0,1]. 펄스가 이미 제거되었거나 startTime이 미래면 0. */
export function pulseProgress(p: Pulse, now: number = performance.now()): number {
  const t = (now - p.startTime) / p.travelDurationMs;
  if (!Number.isFinite(t) || t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

/**
 * 활성 펄스 스냅샷. spawn/remove가 일어나기 전까지는 같은 배열 참조를 반환한다.
 * useSyncExternalStore가 안정적으로 비교할 수 있도록 캐싱.
 */
export function getActivePulses(): readonly Pulse[] {
  return cachedSnapshot;
}

/** 펄스 set 자체가 변할 때(spawn/remove) 호출되는 구독. */
export function subscribePulseList(listener: Listener): () => void {
  listSubscribers.add(listener);
  return () => {
    listSubscribers.delete(listener);
  };
}

/** 매 프레임 호출되는 구독 (위치 갱신용). */
export function subscribePulseTick(listener: Listener): () => void {
  tickSubscribers.add(listener);
  return () => {
    tickSubscribers.delete(listener);
  };
}

/** 테스트·정리 용도. 모든 펄스 즉시 제거 (arrival handler 호출 없음). */
export function clearAllPulses(): void {
  if (pulses.size === 0) return;
  pulses.clear();
  invalidateSnapshot();
  notifyList();
  maybeStopTicker();
}
