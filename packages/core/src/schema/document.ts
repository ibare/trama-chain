import { z } from 'zod';

export const UnitOverrideSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    suffix: z.string().optional(),
    labels: z.array(z.string()).optional(),
  })
  .strict();

/** core는 kind/params의 의미를 검증하지 않는다 — projector가 자체 레지스트리로 해석. */
export const NodeSkinSchema = z
  .object({
    kind: z.string(),
    params: z.record(z.any()),
  })
  .strict();

/** numeric ValueKind — 수치 + 카탈로그 단위 키. */
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

export const ValueNodeSchema = z.object({
  kind: z.literal('value'),
  id: z.string(),
  label: z.string(),
  unitOverride: UnitOverrideSchema.optional(),
  initialValue: ValueSchema,
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  combiner: z.string(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
  skin: NodeSkinSchema.optional(),
});

export const ConstantNodeSchema = z.object({
  kind: z.literal('constant'),
  id: z.string(),
  label: z.string(),
  value: ValueSchema,
  /** 카탈로그 항목 식별자. 사용자 정의 임의 수면 비어 있다. */
  constantKey: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const ConditionOperatorSchema = z.enum(['>', '<', '>=', '<=', '==', '!=']);

export const ConditionNodeSchema = z.object({
  kind: z.literal('condition'),
  id: z.string(),
  label: z.string(),
  operator: ConditionOperatorSchema,
  threshold: z.number(),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const ComparisonNodeSchema = z.object({
  kind: z.literal('comparison'),
  id: z.string(),
  label: z.string(),
  operator: ConditionOperatorSchema,
  threshold: z.number(),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const LogicGateOperatorSchema = z.enum(['and', 'or', 'xor']);

export const LogicGateNodeSchema = z.object({
  kind: z.literal('logic-gate'),
  id: z.string(),
  label: z.string(),
  operator: LogicGateOperatorSchema,
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const ObserveCapacitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bounded'), size: z.number().int().positive() }),
  z.object({ kind: z.literal('unbounded') }),
]);

export const ObserveNodeSchema = z.object({
  kind: z.literal('observe'),
  id: z.string(),
  label: z.string(),
  capacity: ObserveCapacitySchema,
  visualization: z.string(),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const ExpressionNodeSchema = z.object({
  kind: z.literal('expression'),
  id: z.string(),
  label: z.string(),
  latex: z.string(),
  variables: z.array(z.string()),
  preset: z.object({ key: z.string() }).optional(),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const GeneratorParamsSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('counter'),
    start: z.number(),
    step: z.number(),
  }),
  z.object({
    kind: z.literal('random'),
    min: z.number(),
    max: z.number(),
    integer: z.boolean(),
    seed: z.number(),
  }),
]);

export const GeneratorNodeSchema = z.object({
  kind: z.literal('generator'),
  id: z.string(),
  label: z.string(),
  params: GeneratorParamsSchema,
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const NodeSchema = z.discriminatedUnion('kind', [
  ValueNodeSchema,
  ConstantNodeSchema,
  ConditionNodeSchema,
  ComparisonNodeSchema,
  LogicGateNodeSchema,
  ObserveNodeSchema,
  ExpressionNodeSchema,
  GeneratorNodeSchema,
]);

export const EdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  shape: z.object({
    kind: z.string(),
    params: z.record(z.any()),
  }),
  inverted: z.boolean(),
  lag: z.union([z.literal(0), z.literal(1)]),
  slotIndex: z.number().int().min(0).optional(),
  /** source가 다출력 노드일 때 어느 출력 슬롯에서 시작했는지. 단일 출력 노드는 0/생략. */
  sourceSlotIndex: z.number().int().min(0).optional(),
  description: z.string().nullable().optional(),
});

export const ExecutionSchema = z.object({
  steps: z.number().int().positive(),
  stepUnit: z.string().nullable(),
});

export const TramaDocumentSchema = z.object({
  trama: z.literal('1'),
  id: z.string(),
  question: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  execution: ExecutionSchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type TramaDocument = z.infer<typeof TramaDocumentSchema>;
export type TramaNode = z.infer<typeof NodeSchema>;
export type TramaValueNode = z.infer<typeof ValueNodeSchema>;
export type TramaConstantNode = z.infer<typeof ConstantNodeSchema>;
export type TramaConditionNode = z.infer<typeof ConditionNodeSchema>;
export type TramaComparisonNode = z.infer<typeof ComparisonNodeSchema>;
export type TramaLogicGateNode = z.infer<typeof LogicGateNodeSchema>;
export type TramaObserveNode = z.infer<typeof ObserveNodeSchema>;
export type TramaExpressionNode = z.infer<typeof ExpressionNodeSchema>;
export type TramaGeneratorNode = z.infer<typeof GeneratorNodeSchema>;
export type TramaEdge = z.infer<typeof EdgeSchema>;
