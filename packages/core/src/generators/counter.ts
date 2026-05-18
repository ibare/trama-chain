import { numericValue } from '../model/index.js';
import type { GeneratorParadigm } from './types.js';

/**
 * 1,2,3... 증가 카운터 패러다임.
 *
 * - initCursor: nextValue = params.start. 첫 emit에서 그 값을 그대로 출력.
 * - emit: 현재 cursor.nextValue를 출력, nextValue += params.step.
 */
export const counterParadigm: GeneratorParadigm<
  { kind: 'counter'; start: number; step: number },
  { kind: 'counter'; nextValue: number }
> = {
  kind: 'counter',
  outputInterpolation: 'continuous',
  initCursor: (params) => ({ kind: 'counter', nextValue: params.start }),
  emit: (params, cursor) => ({
    value: numericValue(cursor.nextValue, 'free'),
    nextCursor: { kind: 'counter', nextValue: cursor.nextValue + params.step },
  }),
  peek: (_params, cursor) => numericValue(cursor.nextValue, 'free'),
};
