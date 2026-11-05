/**
 * [INPUT]: Verified account/project/workspace/generation identities.
 * [OUTPUT]: A complete strict binding identity.
 * [POS]: Shared current binding contract; no authority to execute, send or confirm an operation.
 */
import { z } from 'zod'
import { cloudPositive } from '@goalloom/contracts'

export const provenanceBindingSchema = z.strictObject({ accountId: z.uuid(), projectRef: z.string().min(1).max(100), environment: z.enum(['development', 'production']), workspaceId: z.uuid(), generation: z.uuid(), localGeneration: z.uuid(), deviceId: z.uuid(), keyEpoch: cloudPositive, bindingToken: z.uuid() })
