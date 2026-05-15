import type { EdgeId, NodeId, Value } from '@trama/core';
import { tokens } from '@trama/tokens';
import type { AnimationLoop } from '../canvas/animation-loop.js';
import type { PulseSettingsStore } from '../store/pulse-settings.js';
import type { TimeSettingsStore } from '../store/time-settings.js';

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
  sourceValue: Value;
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
  sourceValue: Value;
}

export type ArrivalHandler = (pulse: Pulse) => void;
type Listener = () => void;

export interface PulseRegistry {
  setArrivalHandler(h: ArrivalHandler | null): void;
  spawn(args: PulseSpawnArgs): Pulse;
  pulseProgress(p: Pulse, now?: number): number;
  getActive(): readonly Pulse[];
  subscribeList(listener: Listener): () => void;
  subscribeTick(listener: Listener): () => void;
  clearAll(): void;
  dispose(): void;
}

export interface PulseRegistryDeps {
  animationLoop: AnimationLoop;
  pulseSettingsStore: PulseSettingsStore;
  timeSettingsStore: TimeSettingsStore;
}

const EMPTY_SNAPSHOT: readonly Pulse[] = Object.freeze([]);

export function createPulseRegistry({
  animationLoop,
  pulseSettingsStore,
  timeSettingsStore,
}: PulseRegistryDeps): PulseRegistry {
  const pulses = new Map<string, Pulse>();
  const listSubscribers = new Set<Listener>();
  const tickSubscribers = new Set<Listener>();
  let arrivalHandler: ArrivalHandler | null = null;
  let unregisterTicker: (() => void) | null = null;
  let nextPulseSerial = 1;
  let cachedSnapshot: readonly Pulse[] = EMPTY_SNAPSHOT;
  // paused 동안 시간 흐름을 통째로 멈춘다. unpause 시점에 각 활성 pulse의
  // startTime을 paused 지속시간만큼 += 보정해 freeze된 그 자리에서 이어 진행한다.
  let pausedAt: number | null = timeSettingsStore.getState().paused
    ? performance.now()
    : null;
  const unsubscribeTimeSettings = timeSettingsStore.subscribe((state, prev) => {
    if (state.paused === prev.paused) return;
    const now = performance.now();
    if (state.paused) {
      pausedAt = now;
    } else if (pausedAt !== null) {
      const delta = now - pausedAt;
      pausedAt = null;
      for (const p of pulses.values()) {
        (p as { startTime: number }).startTime += delta;
      }
    }
  });

  function invalidateSnapshot(): void {
    cachedSnapshot =
      pulses.size === 0 ? EMPTY_SNAPSHOT : Object.freeze(Array.from(pulses.values()));
  }

  function ensureTicker(): void {
    if (unregisterTicker !== null) return;
    unregisterTicker = animationLoop.register(advance);
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
    // paused면 도착 검사·notifyTick까지 모두 skip — PulseLayer가 subscribeTick에
    // 묶여 있어 DOM 위치 갱신이 자동으로 freeze되고, 도착 chain도 차단된다.
    if (pausedAt !== null) return;
    const now = performance.now();
    const arrived: Pulse[] = [];
    for (const p of pulses.values()) {
      if (now - p.startTime >= p.travelDurationMs) arrived.push(p);
    }

    if (arrived.length > 0) {
      for (const p of arrived) pulses.delete(p.id);
      if (arrivalHandler) {
        for (const p of arrived) arrivalHandler(p);
      }
      invalidateSnapshot();
      notifyList();
      maybeStopTicker();
    }

    notifyTick();
  }

  return {
    setArrivalHandler(h): void {
      arrivalHandler = h;
    },
    spawn(args): Pulse {
      const multiplier = pulseSettingsStore.getState().travelSpeedMultiplier;
      // paused 중 spawn된 펄스는 pausedAt 시점부터 시작해 freeze 상태로 0 progress.
      // unpause 시 startTime이 += delta로 보정되며 그제야 진행을 시작한다.
      const startTime = pausedAt !== null ? pausedAt : performance.now();
      const pulse: Pulse = {
        id: `p-${nextPulseSerial++}`,
        edgeId: args.edgeId,
        sourceNodeId: args.sourceNodeId,
        sourceSlotIndex: args.sourceSlotIndex,
        targetNodeId: args.targetNodeId,
        sourceValue: args.sourceValue,
        startTime,
        travelDurationMs: BASE_TRAVEL_MS * multiplier,
      };
      pulses.set(pulse.id, pulse);
      invalidateSnapshot();
      ensureTicker();
      notifyList();
      return pulse;
    },
    pulseProgress(p, now = performance.now()): number {
      const t = (now - p.startTime) / p.travelDurationMs;
      if (!Number.isFinite(t) || t < 0) return 0;
      if (t > 1) return 1;
      return t;
    },
    getActive(): readonly Pulse[] {
      return cachedSnapshot;
    },
    subscribeList(listener): () => void {
      listSubscribers.add(listener);
      return () => {
        listSubscribers.delete(listener);
      };
    },
    subscribeTick(listener): () => void {
      tickSubscribers.add(listener);
      return () => {
        tickSubscribers.delete(listener);
      };
    },
    clearAll(): void {
      if (pulses.size === 0) return;
      pulses.clear();
      invalidateSnapshot();
      notifyList();
      maybeStopTicker();
    },
    dispose(): void {
      if (unregisterTicker !== null) {
        unregisterTicker();
        unregisterTicker = null;
      }
      unsubscribeTimeSettings();
      pulses.clear();
      cachedSnapshot = EMPTY_SNAPSHOT;
      listSubscribers.clear();
      tickSubscribers.clear();
      arrivalHandler = null;
    },
  };
}

