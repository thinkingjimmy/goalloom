// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Leased SQL work, independent ledger, scoped Storage/Auth and the original billing coordinator.
 * [OUTPUT]: Bounded retryable deletion steps; no completion inferred from a timeout or missing row.
 * [POS]: D2 worker orchestration. Every side-effect result is revalidated by its SQL fence.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Environment, Rpc } from './contract.ts'
import { LifecycleError, uuid } from './http.ts'
import { type DeletionLedger, type LedgerEvent, validateEvent } from './ledger.ts'
import { type ObjectStore, type AuthStore } from './storage.ts'
type Export = LedgerEvent & { lease: string }
type Generation = { workspaceId: string; generation: string; subjectId: string; revision: number; lease: string }
type Account = { subjectId: string; lease: string }
type Reply = Record<string, unknown> & { ok?: boolean }
export type WorkerTarget = { subjectId?: string; workspaceId?: string; generation?: string; ownerId?: string; paths?: string[] }
export function workerScopeGuard(rpc: Rpc, environment: Environment): (target?: WorkerTarget) => Promise<void> {
  return async (target = {}) => {
    if (target.paths?.some(path => !target.workspaceId || !target.generation
      || !path.startsWith(environment === 'development' ? `workspaces/${target.workspaceId}/${target.generation}/` : `workspaces/${target.workspaceId}/`)
      || path.includes('..'))) throw new LifecycleError('worker_scope_denied',403)
    const result = await rpc<{ ok: boolean; scoped: boolean }>('lifecycle_scope_check', { p_environment: environment,
      p_subject: target.subjectId ?? null, p_workspace: target.workspaceId ?? null, p_generation: target.generation ?? null, p_owner: target.ownerId ?? null })
    if (result?.ok !== true || environment === 'development' && result.scoped !== true) throw new LifecycleError('worker_scope_required')
  }
}
export type WorkerDependencies = {
  environment: Environment; rpc: Rpc; ledger: DeletionLedger; storage: ObjectStore; auth: AuthStore
  settle(subject: string): Promise<unknown>; now?: () => number
  guard?: (target?: WorkerTarget) => Promise<void>
}
export function createLifecycleWorker(deps: WorkerDependencies): () => Promise<Record<string, unknown>> {
  const { rpc, environment } = deps, now = deps.now ?? Date.now
  const args = { p_environment: environment }
  const call = async <T extends Reply = Reply>(name: string, values: Record<string, unknown>): Promise<T> => {
    await deps.guard?.({ ...(typeof values.p_subject === 'string' ? { subjectId: values.p_subject } : {}),
      ...(typeof values.p_workspace === 'string' ? { workspaceId: values.p_workspace } : {}),
      ...(typeof values.p_generation === 'string' ? { generation: values.p_generation } : {}),
      ...(typeof values.p_owner === 'string' ? { ownerId: values.p_owner } : {}),
      ...(Array.isArray(values.p_paths) ? { paths: values.p_paths as string[] } : {}),
      ...(typeof values.p_path === 'string' ? { paths: [values.p_path] } : {}) })
    const result = await rpc<T>(name, { ...args, ...values })
    if (result?.ok === false || result?.error) throw new LifecycleError('lifecycle_unavailable')
    return result
  }
  return async () => {
    if (environment === 'development' && !deps.guard) throw new LifecycleError('worker_scope_required')
    await deps.guard?.()
    const started = now(), report = { version: 1, exported: 0, progressed: 0, pending: 0, authDeleted: 0, renewalPending: 0 }
    const work = await rpc<{ exports: Export[]; generations: Generation[]; accounts: Account[] }>('lifecycle_take_work', { ...args, p_limit: 2 })
    if (!work || ![work.exports,work.generations,work.accounts].every(rows => Array.isArray(rows) && rows.length <= 2)) throw new LifecycleError('lifecycle_unavailable')
    for (const item of work.exports) {
      try {
        const event = await validateEvent({ eventId: item.eventId, digest: item.digest, record: item.record })
        const target = event.record.target as { workspaceId: string; generation: string } | null
        await deps.guard?.({ subjectId: String(event.record.subjectId), ...(target ?? {}) })
        if (event.record.environment !== environment || !uuid.test(item.lease)) throw new LifecycleError('lifecycle_unavailable')
        let acknowledged
        try { acknowledged = await deps.ledger.append(event) }
        catch {
          const original = await deps.ledger.get(event.eventId)
          if (!original || original.digest !== event.digest) throw new LifecycleError('lifecycle_unavailable')
          acknowledged = { ...(await deps.ledger.head()), cursor: original.cursor, digest: original.digest }
        }
        if (acknowledged.digest !== event.digest) throw new LifecycleError('lifecycle_unavailable')
        await call('lifecycle_ack_export', { p_event: item.eventId, p_lease: item.lease, p_digest: event.digest,
          p_store: acknowledged.storeId, p_cursor: acknowledged.cursor })
        report.exported++
      } catch {
        report.pending++
        await (async () => { await deps.guard?.({ subjectId: String(item.record?.subjectId) });
          await rpc('lifecycle_retry_work', { ...args, p_kind: 'export', p_id: item.eventId, p_lease: item.lease }) })().catch(() => undefined)
      }
    }
    for (const item of work.generations) {
      const fence = { ...args, p_workspace: item.workspaceId, p_generation: item.generation, p_revision: item.revision, p_lease: item.lease }
      try {
        if (now() - started > 30000) { report.pending++; continue }
        if (![item.workspaceId,item.generation,item.subjectId,item.lease].every(value => uuid.test(value)) || !Number.isSafeInteger(item.revision)) throw new LifecycleError('lifecycle_unavailable')
        await deps.guard?.({ subjectId: item.subjectId, workspaceId: item.workspaceId, generation: item.generation })
        const prepared = await call('lifecycle_prepare_job', fence)
        fence.p_revision = Number(prepared.revision)
        if (!Number.isSafeInteger(fence.p_revision)) throw new LifecycleError('lifecycle_unavailable')
        if (prepared.phase !== 'inventory') { report.pending++; continue }
        if (prepared.inventoryComplete !== true) {
          const page = await deps.storage.inventory(item.workspaceId, prepared.cursor ?? null)
          await deps.guard?.({ subjectId: item.subjectId, workspaceId: item.workspaceId, generation: item.generation, paths: page.paths })
          await call('lifecycle_inventory_page', { ...fence, p_paths: page.paths, p_cursor: page.cursor, p_done: page.done })
          report.progressed++; continue
        }
        const transfers = await call('lifecycle_reconcile_transfers', fence)
        if (transfers.phase !== 'ready') { report.pending++; continue }
        const batch = await call('lifecycle_delete_batch', fence)
        if (!Array.isArray(batch.paths) || batch.paths.length > 100) throw new LifecycleError('lifecycle_unavailable')
        // One external removal per lease keeps slow or unknown requests bounded and restartable.
        const object = batch.paths[0] as { bucket: string; path: string } | undefined
        if (object) {
          if (object.bucket !== 'snapshots') throw new LifecycleError('lifecycle_unavailable')
          await deps.guard?.({ subjectId: item.subjectId, workspaceId: item.workspaceId, generation: item.generation, paths: [object.path] })
          const absent = await deps.storage.remove(item.workspaceId, object.path)
          await call('lifecycle_object_result', { ...fence, p_path: object.path, p_absent: absent })
          if (absent) report.progressed++; else report.pending++
          continue
        }
        if (batch.transfersPending !== false) { report.pending++; continue }
        const scan = await call('lifecycle_storage_scan_status', fence)
        if (scan.verified !== true) {
          const page = await deps.storage.inventory(item.workspaceId, scan.cursor ?? null)
          await deps.guard?.({ subjectId: item.subjectId, workspaceId: item.workspaceId, generation: item.generation, paths: page.paths })
          await call('lifecycle_storage_scan_page', { ...fence, p_paths: page.paths, p_cursor: page.cursor, p_done: page.done })
          report.progressed++; continue
        }
        await call('lifecycle_purge_content', fence)
        report.progressed++
      } catch { report.pending++ }
      finally {
        await (async () => { await deps.guard?.({ subjectId: item.subjectId, workspaceId: item.workspaceId, generation: item.generation });
          await rpc('lifecycle_retry_work', { ...args, p_kind: 'generation', p_id: item.workspaceId, p_lease: item.lease }) })().catch(() => undefined)
      }
    }
    for (const item of work.accounts) {
      try {
        if (now() - started > 45000) { report.pending++; continue }
        // Content/Auth deletion is independent of renewal/provider availability.
        try {
          const ready = await call('lifecycle_account_ready', { p_subject: item.subjectId })
          if (ready.ready === true && typeof ready.ownerId === 'string') {
            await deps.guard?.({ subjectId: item.subjectId, ownerId: ready.ownerId })
            if (await deps.auth.remove(ready.ownerId)) {
            await call('lifecycle_account_deleted', { p_subject: item.subjectId, p_owner: ready.ownerId }); report.authDeleted++
            }
          }
        } catch { report.pending++ }
        try { await deps.guard?.({ subjectId: item.subjectId }); await deps.settle(item.subjectId) }
        catch { report.renewalPending++ }
      } finally {
        await (async () => { await deps.guard?.({ subjectId: item.subjectId });
          await rpc('lifecycle_account_work_done', { ...args, p_subject: item.subjectId, p_lease: item.lease, p_retry_seconds: 60 }) })().catch(() => undefined)
      }
    }
    return report
  }
}
