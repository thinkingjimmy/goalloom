/**
 * [INPUT]: Untrusted exact initialization records inside encrypted format-1 SyncOps.
 * [OUTPUT]: Non-transforming, closed seed schemas with explicit row and byte limits.
 * [POS]: Application payload capability 2; ordinary commands retain their existing schemas.
 */
import { z } from 'zod'

const id = z.string().min(1).max(180).regex(/^[a-zA-Z0-9:_-]+$/)
const instant = z.iso.datetime({ offset: true })
const date = z.iso.date()
const horizon = z.enum(['year', 'half', 'cycle', 'month', 'week', 'day'])
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const json = z.string().refine(value => { try { JSON.parse(value); return true } catch { return false } })

export const seedRecordSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('workspace'), calendar: json.nullable(), setupConfirmedAt: instant.nullable() }),
  z.strictObject({ kind: z.literal('period'), row: z.strictObject({ id, horizon, startDate: date, endDate: date, startAt: instant, endAt: instant }) }),
  z.strictObject({ kind: z.literal('policy'), row: z.strictObject({ horizon, mode: z.enum(['auto', 'manual']), version, effectiveFromPeriodId: id }) }),
  z.strictObject({
    kind: z.literal('item'),
    row: z.strictObject({
      id, title: z.string().max(500).refine(value => value.trim().length > 0), description: z.string().max(100_000), dueDate: date.nullable(),
      status: z.enum(['todo', 'done', 'cancelled']), completedAt: instant.nullable(), cancelledAt: instant.nullable(),
      archivedAt: instant.nullable(), deletedAt: instant.nullable(), deletedBy: id.nullable(), createdAt: instant, updatedAt: instant,
      version, flowColor: z.number().int().min(0).max(7).nullable(),
    }),
    placement: z.strictObject({
      itemId: id, horizon: z.enum(['later', 'year', 'half', 'cycle', 'month', 'week', 'day']), periodId: id.nullable(),
      sortKey: z.number().finite().refine(value => !Object.is(value, -0)), version, holdPeriodId: id.nullable(), nestingParentId: id.nullable(),
    }),
    guidance: z.strictObject({ itemId: id, revision: version, value: json.nullable(), updatedAt: instant, operationId: id }).nullable(),
  }),
  z.strictObject({ kind: z.literal('relation'), row: z.strictObject({
    id, parentId: id, childId: id, invalidatedAt: instant.nullable(), invalidatedBy: id.nullable(),
    reason: z.enum(['unlink', 'delete']).nullable(), createdAt: instant,
  }) }),
])

export const seedManifestSchema = z.strictObject({
  version: z.literal(1), seedId: z.uuid(),
  counts: z.strictObject({
    workspace: z.literal(1), periods: z.number().int().nonnegative().max(100_000), policies: z.number().int().nonnegative().max(6),
    items: z.number().int().nonnegative().max(100_000), guidance: z.number().int().nonnegative().max(100_000), relations: z.number().int().nonnegative().max(500_000),
  }),
  rowBytes: z.number().int().positive().max(104_857_600), chunks: z.number().int().positive().max(1_000_000), digest: hash,
})
export const seedActions = [
  z.strictObject({ t: z.literal('seed.begin'), manifest: seedManifestSchema }),
  z.strictObject({ t: z.literal('seed.rows'), seedId: z.uuid(), index: z.number().int().nonnegative().max(999_999), records: z.array(seedRecordSchema).min(1).max(200) }),
  z.strictObject({ t: z.literal('seed.final'), seedId: z.uuid(), chunks: z.number().int().positive().max(1_000_000), digest: hash }),
] as const

export type SeedRecord = z.infer<typeof seedRecordSchema>
export type SeedManifest = z.infer<typeof seedManifestSchema>
