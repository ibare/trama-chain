import { numericValue } from '../model/index.js';
import type { GeneratorParadigm } from './types.js';

/**
 * 스케줄 generator 패러다임 — (tMs, value) 짝의 timeline을 그대로 재생한다.
 *
 * points는 시각 오름차순으로 가정. emit 시점 t에 대해 "tMs ≤ t인 가장 늦은
 * point"의 value를 출력 — 계단 함수처럼 직전 keyframe을 유지한다. t가 첫
 * point.tMs 미만이면 출력이 정의되지 않은 freeze. loop=true면 마지막 point
 * 시각 + interval(첫 point의 tMs 보정)로 모듈로 — 주기적 시퀀스 재생.
 *
 * - points 빈 배열: 항상 undefined freeze.
 * - 시간의 순수 함수이므로 cursor 상태는 없다.
 * - 결정성: 동일 (params, t)면 동일 출력. params.points는 호출자가 정렬·중복
 *   해소 책임을 진다 — paradigm은 입력 그대로 선형 스캔으로 처리.
 *
 * 활용: 약물 투여 일정·교실 종 시간표·신호등 페이즈 시퀀스 등 미리 정해진
 * 시각-값 timeline 재생.
 */
export const scheduleParadigm: GeneratorParadigm<
  {
    kind: 'schedule';
    points: { tMs: number; value: number }[];
    loop: boolean;
  },
  { kind: 'schedule' }
> = {
  kind: 'schedule',
  outputInterpolation: 'discrete',
  initCursor: () => ({ kind: 'schedule' }),
  emit: (params, _cursor, simulationTimeMs) => {
    const v = sampleAt(params, simulationTimeMs);
    return {
      value: v === undefined ? undefined : numericValue(v, 'free'),
      nextCursor: { kind: 'schedule' },
    };
  },
  peek: (params, _cursor, simulationTimeMs) => {
    const v = sampleAt(params, simulationTimeMs);
    return v === undefined ? undefined : numericValue(v, 'free');
  },
  // 시간의 순수 함수 — cursor 상태 없음. freeze 동안 sim 시간이 흘러도 sampleAt(t)
  // 가 직접 결정.
  resyncCursor: (cursor) => cursor,
};

/**
 * 현재 시각의 keyframe value를 본다. loop=true면 timeline 길이로 모듈로 후 동일
 * 검색. 첫 point 이전은 undefined (시작 keyframe 도달 전엔 출력이 정의되지 않음).
 */
function sampleAt(
  params: {
    points: { tMs: number; value: number }[];
    loop: boolean;
  },
  t: number,
): number | undefined {
  const pts = params.points;
  if (pts.length === 0) return undefined;
  const first = pts[0]!;
  if (t < first.tMs) return undefined;
  let effectiveT = t;
  if (params.loop) {
    const last = pts[pts.length - 1]!;
    // 한 사이클 길이는 [first.tMs, last.tMs + (last.tMs - first.tMs)/(pts.length-1)]
    // 가 아니라 단순히 (last.tMs - first.tMs)를 cycle로 사용. last가 다음 사이클의
    // 시작점과 동치 — schedule 작성자가 첫·마지막 value를 일치시키면 부드럽게 연결.
    const cycle = last.tMs - first.tMs;
    if (cycle > 0) {
      const offset = (t - first.tMs) % cycle;
      effectiveT = first.tMs + offset;
    }
  }
  // 정렬 가정: tMs ≤ effectiveT인 가장 마지막 point 찾기 — 선형 스캔.
  let pick = first;
  for (const p of pts) {
    if (p.tMs <= effectiveT) pick = p;
    else break;
  }
  return pick.value;
}
