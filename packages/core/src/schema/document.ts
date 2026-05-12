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

export const ValueNodeSchema = z.object({
  kind: z.literal('value'),
  id: z.string(),
  label: z.string(),
  /** 카탈로그 단위 키. 알 수 없는 키면 documentToModel에서 free로 폴백. */
  unitId: z.string(),
  unitOverride: UnitOverrideSchema.optional(),
  initialValue: z.number(),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  combiner: z.string(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const FunctionNodeSchema = z.object({
  kind: z.literal('function'),
  id: z.string(),
  label: z.string(),
  functionKey: z.string(),
  outputUnitId: z.string().optional(),
  outputUnitOverride: UnitOverrideSchema.optional(),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const ConstantNodeSchema = z.object({
  kind: z.literal('constant'),
  id: z.string(),
  label: z.string(),
  value: z.number(),
  /** 카탈로그 항목 식별자. 사용자 정의 임의 수면 비어 있다. */
  constantKey: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const ConditionalOperatorSchema = z.enum(['>', '==', '!=']);

export const ConditionalNodeSchema = z.object({
  kind: z.literal('conditional'),
  id: z.string(),
  label: z.string(),
  operator: ConditionalOperatorSchema,
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
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

export const NodeSchema = z.discriminatedUnion('kind', [
  ValueNodeSchema,
  FunctionNodeSchema,
  ConstantNodeSchema,
  ConditionalNodeSchema,
  ExpressionNodeSchema,
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
  /** source가 다출력 노드(예: ConditionalNode)일 때 어느 출력 슬롯에서 시작했는지. */
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
export type TramaFunctionNode = z.infer<typeof FunctionNodeSchema>;
export type TramaConstantNode = z.infer<typeof ConstantNodeSchema>;
export type TramaConditionalNode = z.infer<typeof ConditionalNodeSchema>;
export type TramaExpressionNode = z.infer<typeof ExpressionNodeSchema>;
export type TramaEdge = z.infer<typeof EdgeSchema>;
