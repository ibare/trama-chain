import type { SequenceSample } from './exec-value.js';
import type { ObserveCapacity } from '../model/index.js';

/**
 * ObserveNode 누적 자료구조 — capacity 정책별로 두 가지 모양.
 *
 * - windowed: 시뮬레이션 시간 기준 최근 `windowMs` ms 안의 sample만 유지한다.
 *   push 시 가장 최신 sample.t에서 windowMs 이전의 항목들을 앞에서 shift로 evict.
 *   sample.t는 단조 비감소이므로 앞에서부터 검사 하나로 충분하다. tick rate에
 *   무관하게 "최근 N초" 가 그대로 의미를 가진다.
 * - unbounded: growable array. push만 일어나며 잘리지 않는다.
 *
 * 외부에 노출할 때는 [[observeBufferToArray]]로 ordered SequenceSample[]을 만든다.
 * 다운스트림 SequenceValue는 매 emit step마다 새 snapshot을 받으므로(결정성·시간
 * 여행 친화), snapshot은 fresh array다. 누적 자체는 in-place mutate.
 *
 * **수명**: ExecutionState 안에 노드별로 보관. propagate 진입 시 working state로
 * [[cloneObserveBuffer]]된 인스턴스가 도착해 in-place 누적 → state 회수 — 원본
 * (prior state)은 변경되지 않는다.
 */
export type ObserveBuffer =
  | { kind: 'windowed'; windowMs: number; data: SequenceSample[] }
  | { kind: 'unbounded'; data: SequenceSample[] };

/** capacity 정책으로 빈 버퍼 생성. */
export function createObserveBuffer(capacity: ObserveCapacity): ObserveBuffer {
  switch (capacity.kind) {
    case 'windowed':
      return { kind: 'windowed', windowMs: capacity.windowMs, data: [] };
    case 'unbounded':
      return { kind: 'unbounded', data: [] };
  }
}

/**
 * sample을 누적한다 (in-place mutate). windowed는 push 후 cutoff(가장 최신 t -
 * windowMs)보다 t가 작은 앞쪽 항목을 evict — sample.t는 단조 비감소라 앞에서부터
 * 검사하면 된다.
 */
export function pushSample(buf: ObserveBuffer, sample: SequenceSample): void {
  switch (buf.kind) {
    case 'windowed': {
      buf.data.push(sample);
      const cutoff = sample.t - buf.windowMs;
      let evictCount = 0;
      while (evictCount < buf.data.length && buf.data[evictCount]!.t < cutoff) {
        evictCount++;
      }
      if (evictCount > 0) buf.data.splice(0, evictCount);
      return;
    }
    case 'unbounded':
      buf.data.push(sample);
      return;
  }
}

/**
 * 시간순으로 정렬된 sample 배열을 새로 만든다. SequenceValue.samples 로 흘려보낼
 * snapshot. data는 이미 시간순이므로 단순 slice.
 */
export function observeBufferToArray(buf: ObserveBuffer): SequenceSample[] {
  return buf.data.slice();
}

/**
 * 독립 인스턴스로 얕은 복제. data 배열은 새로 만들지만 sample 객체는 공유 —
 * SequenceSample은 immutable 값이라 공유해도 안전하다. working state ↔ prior state
 * 분리를 위해 propagate 진입 시 1회 호출.
 */
export function cloneObserveBuffer(buf: ObserveBuffer): ObserveBuffer {
  switch (buf.kind) {
    case 'windowed':
      return { kind: 'windowed', windowMs: buf.windowMs, data: buf.data.slice() };
    case 'unbounded':
      return { kind: 'unbounded', data: buf.data.slice() };
  }
}

/** 누적 sample 개수. */
export function observeBufferLength(buf: ObserveBuffer): number {
  return buf.data.length;
}
