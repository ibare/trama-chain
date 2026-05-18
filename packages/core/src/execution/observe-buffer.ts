import type { SequenceSample } from './exec-value.js';
import type { ObserveCapacity } from '../model/index.js';

/**
 * ObserveNode 누적 자료구조 — capacity 정책별로 두 가지 모양.
 *
 * - bounded: 고정 크기 ring buffer. `head`는 다음 write 인덱스(0..capacity), `length`는
 *   populated count. capacity에 도달한 뒤로는 head가 overwrite를 돌며 가장 오래된
 *   sample을 자연스럽게 evict — `shift()`의 O(n)을 피한다.
 * - unbounded: growable array. push만 일어나며 잘리지 않는다.
 *
 * 외부에 노출할 때는 [[observeBufferToArray]]로 ordered SequenceSample[]을 만든다.
 * 다운스트림 SequenceValue는 매 emit step마다 새 snapshot을 받으므로(결정성·시간
 * 여행 친화), snapshot은 fresh array다. 누적 자체는 in-place mutate로 O(1) push.
 *
 * **수명**: ExecutionState 안에 노드별로 보관. propagate 진입 시 working state로
 * [[cloneObserveBuffer]]된 인스턴스가 도착해 in-place 누적 → state 회수 — 원본
 * (prior state)은 변경되지 않는다.
 */
export type ObserveBuffer =
  | {
      kind: 'bounded';
      capacity: number;
      ring: SequenceSample[];
      head: number;
      length: number;
    }
  | { kind: 'unbounded'; data: SequenceSample[] };

/** capacity 정책으로 빈 버퍼 생성. */
export function createObserveBuffer(capacity: ObserveCapacity): ObserveBuffer {
  switch (capacity.kind) {
    case 'bounded':
      return {
        kind: 'bounded',
        capacity: capacity.size,
        ring: [],
        head: 0,
        length: 0,
      };
    case 'unbounded':
      return { kind: 'unbounded', data: [] };
  }
}

/**
 * sample을 누적한다 (in-place mutate). bounded는 ring write — capacity에 도달한
 * 뒤로는 head가 돌며 가장 오래된 sample을 덮어쓴다.
 */
export function pushSample(buf: ObserveBuffer, sample: SequenceSample): void {
  switch (buf.kind) {
    case 'bounded': {
      buf.ring[buf.head] = sample;
      buf.head = (buf.head + 1) % buf.capacity;
      if (buf.length < buf.capacity) buf.length++;
      return;
    }
    case 'unbounded':
      buf.data.push(sample);
      return;
  }
}

/**
 * 시간순으로 정렬된 sample 배열을 새로 만든다. SequenceValue.samples 로 흘려보낼
 * snapshot. bounded는 ring을 head 기준으로 펼친다 — length < capacity 동안에는
 * ring 앞부분만, capacity 도달 후에는 head 위치가 가장 오래된 sample.
 */
export function observeBufferToArray(buf: ObserveBuffer): SequenceSample[] {
  switch (buf.kind) {
    case 'bounded': {
      if (buf.length < buf.capacity) {
        // ring 앞쪽만 채워진 상태 — 0..length가 자연스러운 시간순.
        return buf.ring.slice(0, buf.length);
      }
      // 가득 찬 ring — head가 가장 오래된 sample을 가리킨다.
      const out: SequenceSample[] = new Array(buf.capacity);
      for (let i = 0; i < buf.capacity; i++) {
        out[i] = buf.ring[(buf.head + i) % buf.capacity]!;
      }
      return out;
    }
    case 'unbounded':
      return buf.data.slice();
  }
}

/**
 * 독립 인스턴스로 얕은 복제. ring/data 배열은 새로 만들지만 sample 객체는 공유 —
 * SequenceSample은 immutable 값이라 공유해도 안전하다. working state ↔ prior state
 * 분리를 위해 propagate 진입 시 1회 호출.
 */
export function cloneObserveBuffer(buf: ObserveBuffer): ObserveBuffer {
  switch (buf.kind) {
    case 'bounded':
      return {
        kind: 'bounded',
        capacity: buf.capacity,
        ring: buf.ring.slice(),
        head: buf.head,
        length: buf.length,
      };
    case 'unbounded':
      return { kind: 'unbounded', data: buf.data.slice() };
  }
}

/** 누적 sample 개수. */
export function observeBufferLength(buf: ObserveBuffer): number {
  switch (buf.kind) {
    case 'bounded':
      return buf.length;
    case 'unbounded':
      return buf.data.length;
  }
}
