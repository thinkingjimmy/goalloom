/**
 * [INPUT]: Portable local operation boundaries and non-executable external guidance observations.
 * [OUTPUT]: Finite ordered checkpoints preserving exact heads, absence/tombstones and logical undo identity.
 * [POS]: Schema13 guidance provenance contract; no authority to execute, send or confirm an operation.
 */
import { z } from 'zod'
import { cloudInteger, cloudPositive } from '@goalloom/contracts'
import { guidanceRecordSchema } from './assistance'
import { idSchema, instantSchema } from './entities'

export const provenanceBindingSchema = z.strictObject({ accountId: z.uuid(), projectRef: z.string().min(1).max(100), environment: z.enum(['development', 'production']), workspaceId: z.uuid(), generation: z.uuid(), localGeneration: z.uuid(), deviceId: z.uuid(), keyEpoch: cloudPositive, bindingToken: z.uuid() })
export const guidanceStateSchema = z.strictObject({ head: guidanceRecordSchema, identity: idSchema.nullable() })
export const guidanceCheckpointSchema = z.strictObject({
  id: z.uuid(), order: cloudPositive, at: instantSchema, afterOperationId: idSchema.nullable(), afterEventSeq: cloudInteger,
  source: z.strictObject({ workspaceId: z.uuid(), generation: z.uuid(), seq: cloudInteger }).nullable(),
  cause: z.enum(['baseline', 'install', 'absorb', 'receipt']),
  changes: z.array(z.strictObject({ itemId: idSchema, before: guidanceStateSchema.nullable(), after: guidanceStateSchema.nullable() })).min(1).max(100_000),
})
export type GuidanceState = z.infer<typeof guidanceStateSchema>
export type GuidanceCheckpoint = z.infer<typeof guidanceCheckpointSchema>
