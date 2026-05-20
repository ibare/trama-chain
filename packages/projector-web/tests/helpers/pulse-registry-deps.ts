import { vi } from 'vitest';

/**
 * performance.now() 와 setTimeout/clearTimeout 까지 통제하는 timeline helper.
 * pulse-registry 가 직접 performance.now() 를 호출하므로, 펄스 progress·startTime
 * 보정의 결정론적 검증에 사용한다.
 *
 * happy-dom 의 performance 객체는 vi.useFakeTimers 의 toFake 'performance' 로
 * 덮어써지지 않는다 — performance.now 를 직접 monkey-patch 해 fake 시간축에
 * 결속한다.
 *
 * 사용법:
 *   const tl = createFakeTimeline(1000);
 *   ... pulse 도착 시점 시뮬레이션 ...
 *   tl.advance(500);            // 500ms 가상 진행 — performance.now() 증가
 *   tl.restore();               // 테스트 종료 시 (또는 afterEach) 복원
 */
export interface FakeTimeline {
  now(): number;
  advance(ms: number): void;
  restore(): void;
}

export function createFakeTimeline(startMs: number = 0): FakeTimeline {
  let virtualNow = startMs;
  const originalNow = performance.now.bind(performance);
  performance.now = () => virtualNow;
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  return {
    now: () => virtualNow,
    advance: (ms) => {
      virtualNow += ms;
      vi.advanceTimersByTime(ms);
    },
    restore: () => {
      performance.now = originalNow;
      vi.useRealTimers();
    },
  };
}
