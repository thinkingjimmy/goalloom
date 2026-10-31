/**
 * [INPUT]: Main-owned profile path, verified project/account identity and explicit finite billing intent.
 * [OUTPUT]: Atomic original operation/continuation identity across timeouts and restarts, without credentials.
 * [POS]: Device-only billing journal. It never stores URLs, tasks, tokens or sync keys.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { atomicJson } from '../storage/atomic-json'
import { billingContinuationSchema, billingCycleSchema, billingMutationKinds, type BillingContinuation, type BillingCycle, type BillingMutation } from '../../shared/contracts/billing'

const operationSchema = z.strictObject({
  project: z.string().url().max(200), accountId: z.uuid(), requestId: z.uuid(), continuation: billingContinuationSchema.nullable(),
  action: z.enum(billingMutationKinds), cycle: billingCycleSchema.nullable(), createdAt: z.iso.datetime(),
  browserOpened: z.boolean(), returnSeen: z.boolean(),
  canonicalRequestId: z.uuid().nullable(), continuationExpiresAt: z.iso.datetime({ offset: true }).nullable(), returnToThisDevice: z.boolean().nullable(),
})
const journalSchema = z.strictObject({ version: z.literal(1), operations: operationSchema.array().max(100) })
export type BillingOperation = z.infer<typeof operationSchema>

export class BillingJournal {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private path: string) {}

  private async read(): Promise<BillingOperation[]> {
    try { return journalSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))).operations }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }
  private async write(operations: BillingOperation[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    await atomicJson(this.path, journalSchema.parse({ version: 1, operations }))
  }
  private serialized<T>(run: () => Promise<T>): Promise<T> {
    const next = this.tail.then(run)
    this.tail = next.catch(() => undefined)
    return next
  }
  pending(project: string, accountId: string): Promise<BillingOperation | null> {
    return this.serialized(async () => (await this.read()).find(row => row.project === project && row.accountId === accountId) ?? null)
  }
  begin(project: string, accountId: string, action: BillingMutation, cycle: BillingCycle | null, now: string, continuation: BillingContinuation | null): Promise<BillingOperation> {
    return this.serialized(async () => {
      const rows = await this.read()
      const previous = rows.find(row => row.project === project && row.accountId === accountId)
      // An unknown result owns its original intent. A different intent cannot replace it.
      if (previous) return previous
      const operation = operationSchema.parse({ project, accountId, action, cycle, createdAt: now,
        requestId: randomUUID(), continuation, browserOpened: false, returnSeen: false,
        canonicalRequestId: null, continuationExpiresAt: null, returnToThisDevice: null })
      await this.write([...rows, operation])
      return operation
    })
  }
  received(operation: BillingOperation, receipt: Pick<BillingOperation, 'canonicalRequestId' | 'continuationExpiresAt' | 'returnToThisDevice'>): Promise<BillingOperation> {
    return this.serialized(async () => {
      const rows = await this.read()
      const current = rows.find(row => row.requestId === operation.requestId && row.project === operation.project && row.accountId === operation.accountId)
      if (!current) throw Error('billing_request_conflict')
      const next = operationSchema.parse({ ...current, ...receipt })
      await this.write(rows.map(row => row === current ? next : row))
      return next
    })
  }
  seen(operation: BillingOperation): Promise<void> {
    return this.serialized(async () => {
      const rows = await this.read()
      await this.write(rows.map(row => row.requestId === operation.requestId && row.project === operation.project && row.accountId === operation.accountId ? { ...row, returnSeen: true } : row))
    })
  }
  opened(operation: BillingOperation): Promise<BillingOperation> {
    return this.serialized(async () => {
      const rows = await this.read()
      const current = rows.find(row => row.requestId === operation.requestId && row.project === operation.project && row.accountId === operation.accountId)
      if (!current) throw Error('billing_request_conflict')
      const next = { ...current, browserOpened: true }
      await this.write(rows.map(row => row === current ? next : row))
      return next
    })
  }
  complete(operation: BillingOperation): Promise<void> {
    return this.serialized(async () => {
      const rows = await this.read()
      await this.write(rows.filter(row => row.requestId !== operation.requestId || row.project !== operation.project || row.accountId !== operation.accountId))
    })
  }
}
