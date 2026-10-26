// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Externally held quarantine, independently recorded key fingerprint/current ledger and resumable run ID.
 * [OUTPUT]: Bounded verified-prefix capture/projection metadata, with admission still blocked.
 * [POS]: Operator restore seam. It cannot open the quarantine or infer supplier backup disposal.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Environment, Rpc } from './contract.ts'
import { hex32, LifecycleError, uuid } from './http.ts'
import { type DeletionLedger, ledgerCursor } from './ledger.ts'
export interface RestoreQuarantine {
  assertClosed(): Promise<{ closed: true; projectRef: string; gateId: string }>
}
export async function replayDeletionLedger(deps: {
  environment: Environment; rpc: Rpc; ledger: DeletionLedger; quarantine: RestoreQuarantine
  keyDigest: string; runId: string | null; maxSteps?: number
}): Promise<Record<string, unknown>> {
  const refs = { development: 'asqyvcnxdltzzfutbbqy', production: 'keqprrgvcefqdwnxaafv' }
  const gate = await deps.quarantine.assertClosed()
  if (gate.closed !== true || gate.projectRef !== refs[deps.environment] || !gate.gateId || !hex32.test(deps.keyDigest)
    || deps.runId !== null && !uuid.test(deps.runId)) throw new LifecycleError('lifecycle_unavailable')
  const head = await deps.ledger.head()
  if (!head.storeId || !ledgerCursor(head.cursor)) throw new LifecycleError('lifecycle_unavailable')
  type Status = { ok: boolean; runId: string; environment: string; keyDigest: string; keyMatches: boolean; storeId: string; after: string; through: string; phase: 'capture' | 'project' | 'replayed'; admissionBlocked: boolean }
  let status = deps.runId ? await deps.rpc<Status>('lifecycle_restore_status', { p_run: deps.runId })
    : await deps.rpc<Status>('lifecycle_restore_begin', { p_environment: deps.environment, p_store: head.storeId, p_through: head.cursor, p_key_digest: deps.keyDigest })
  const runId = status?.runId
  if (!uuid.test(runId ?? '') || deps.runId !== null && deps.runId !== runId) throw new LifecycleError('lifecycle_unavailable')
  const validate = (value: Status, through?: string) => {
    if (value?.ok !== true || value.runId !== runId || value.environment !== deps.environment || value.storeId !== head.storeId
      || value.keyDigest !== deps.keyDigest || value.keyMatches !== true || value.admissionBlocked !== true
      || !ledgerCursor(value.after) || !ledgerCursor(value.through) || BigInt(value.after) > BigInt(value.through)
      || BigInt(value.through) > BigInt(head.cursor) || through !== undefined && value.through !== through
      || !['capture','project','replayed'].includes(value.phase) || value.phase !== 'capture' && value.after !== value.through) throw new LifecycleError('lifecycle_unavailable')
  }
  status = await deps.rpc<Status>('lifecycle_restore_status', { p_run: runId }); validate(status)
  const through = status.through
  const steps = Math.min(Math.max(deps.maxSteps ?? 10, 1), 25)
  for (let i = 0; i < steps && status.phase !== 'replayed'; i++) {
    await deps.quarantine.assertClosed().then(value => {
      if (value.closed !== true || value.gateId !== gate.gateId || value.projectRef !== gate.projectRef) throw new LifecycleError('lifecycle_unavailable')
    })
    if (status.phase === 'capture') {
      const page = await deps.ledger.read(status.after, status.through, 100)
      if (page.storeId !== head.storeId) throw new LifecycleError('lifecycle_unavailable')
      try {
        await deps.rpc('lifecycle_restore_capture', { p_run: runId, p_store: head.storeId, p_after: status.after, p_entries: page.entries })
      } catch { /* A committed page with a lost acknowledgment is resolved through the original run. */ }
    } else if (status.phase === 'project') await deps.rpc('lifecycle_restore_project', { p_run: runId })
    else throw new LifecycleError('lifecycle_unavailable')
    status = await deps.rpc<Status>('lifecycle_restore_status', { p_run: runId })
    validate(status, through)
  }
  const finalGate = await deps.quarantine.assertClosed()
  if (finalGate.closed !== true || finalGate.gateId !== gate.gateId || finalGate.projectRef !== gate.projectRef) throw new LifecycleError('lifecycle_unavailable')
  status = await deps.rpc<Status>('lifecycle_restore_status', { p_run: runId }); validate(status, through)
  const current = await deps.ledger.head()
  if (current.storeId !== head.storeId || !ledgerCursor(current.cursor) || BigInt(current.cursor) < BigInt(status.through)) throw new LifecycleError('lifecycle_unavailable')
  return { version: 1, runId, storeId: head.storeId, after: status.after, through: status.through, phase: status.phase,
    ledgerAdvanced: current.cursor !== status.through, admissionBlocked: true }
}
