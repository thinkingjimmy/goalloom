/**
 * [INPUT]: 受限查询、实体/操作 DTO。
 * [OUTPUT]: 工作区快照、分页列表和当前条目详情。
 * [POS]: 只读 IPC 契约；历史查询后续沿用固定周期 ID。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { z } from 'zod'
import { dateSchema, horizonSchema, idSchema, itemSchema, periodSchema, policySchema, relationSchema, workspaceSchema } from './entities'

export const querySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('snapshot') }),
  z.strictObject({ type: z.literal('item'), itemId: idSchema }),
  z.strictObject({ type: z.literal('list'), view: z.enum(['search', 'done', 'cancelled', 'archived', 'trash', 'backlog']), query: z.string().max(500).default(''), horizon: horizonSchema.optional(), offset: z.number().int().min(0).max(100_000).default(0), limit: z.number().int().min(1).max(100).default(50) }),
  z.strictObject({ type: z.literal('receipt'), operationId: idSchema, generation: idSchema }),
  z.strictObject({ type: z.literal('history'), horizon: z.enum(['cycle', 'month', 'week', 'day']), startDate: dateSchema, offset: z.number().int().min(0).max(100_000).default(0), limit: z.number().int().min(1).max(100).default(50) }),
  z.strictObject({ type: z.literal('activity'), itemId: idSchema, beforeSeq: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).default(50) }),
  z.strictObject({ type: z.literal('batches') }),
])
export type Query = z.infer<typeof querySchema>
export const relationViewSchema = relationSchema.extend({ parentTitle: z.string(), childTitle: z.string(), parentArchived: z.boolean(), childArchived: z.boolean() })
export const snapshotSchema = z.strictObject({
  workspace: workspaceSchema, periods: z.array(periodSchema), items: z.array(itemSchema), relations: z.array(relationViewSchema), policies: z.array(policySchema),
  backlog: z.record(z.string(), z.number().int().nonnegative()), observedAt: z.string(), maintenance: z.boolean(), backupError: z.string().nullable(),
  rolloverSources: z.record(idSchema, dateSchema),
})
export const itemPageSchema = z.strictObject({ items: z.array(itemSchema), total: z.number().int().nonnegative() })
export const detailSchema = z.strictObject({ item: itemSchema, relations: z.array(relationViewSchema) })
export type Snapshot = z.infer<typeof snapshotSchema>
export type ItemPage = z.infer<typeof itemPageSchema>
export type ItemDetail = z.infer<typeof detailSchema>
