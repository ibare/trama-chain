import { z } from 'zod';

/** numeric ValueKind — 단위가 붙는 실수값. */
export const NumericValueSchema = z.object({
  kind: z.literal('numeric'),
  n: z.number(),
  unitId: z.string(),
});

/** boolean ValueKind — 2값 신호. 단위 없음. */
export const BooleanValueSchema = z.object({
  kind: z.literal('boolean'),
  b: z.boolean(),
});

/** Value sum type — 신호가 흐르는 모든 자리의 시멘틱 타입. */
export const ValueSchema = z.discriminatedUnion('kind', [
  NumericValueSchema,
  BooleanValueSchema,
]);
