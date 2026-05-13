import { z } from 'zod';
import type { ShapeDefinition } from '../types.js';

/**
 * 변환 없음(identity passthrough) shape.
 *
 * edge.shape.kind === 'none'은 "사용자가 아직 어떤 변환도 선택하지 않은 상태"를
 * 의미한다. compute는 입력을 그대로 흘려보내고, isIdentityShape도 true를 반환해
 * raw passthrough 파이프라인을 그대로 탄다.
 *
 * picker UI에서는 카드로 노출하지 않으며, 사용자가 다른 shape을 모두 해제하면
 * 자동으로 이 kind으로 되돌아간다.
 */
const params = z.object({}).strict();
export type NoneParams = z.infer<typeof params>;

export const noneShape: ShapeDefinition<NoneParams> = {
  key: 'none',
  labels: { ko: '변환 없음', en: 'no transform' },
  paramsSchema: params,
  defaultParams: {},
  compute: (x) => x,
  previewPath: (w, h) => `M 0 ${h / 2} L ${w} ${h / 2}`,
};
