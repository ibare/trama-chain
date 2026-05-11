import { z } from 'zod';

export const UnitSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('number'),
    suffix: z.string(),
    min: z.number(),
    max: z.number(),
  }),
  z.object({ kind: z.literal('scale'), min: z.number(), max: z.number() }),
  z.object({ kind: z.literal('label'), values: z.array(z.string()) }),
  z.object({ kind: z.literal('free') }),
]);

export const NodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  unit: UnitSchema,
  initialValue: z.number(),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  combiner: z.string(),
  isFocal: z.boolean(),
  description: z.string().nullable().optional(),
});

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
export type TramaEdge = z.infer<typeof EdgeSchema>;
