/**
 * [INPUT]: Existing account/device binding, original unknown operation hashes and local generation guard.
 * [OUTPUT]: Exact receipt confirmations only, with no status discovery, roster read, download or upload.
 * [POS]: Independent recovery before paid-service admission; service expiry never erases an unknown send.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { SyncFailure, type PendingPlain, type SyncRemote } from '@goalloom/sync'

export async function recoverUnknownReceipts(input: {
  remote: SyncRemote; workspaceId: string; deviceId: string; generation: string; signal: AbortSignal
  storage: <T>(command: unknown) => Promise<T>; at: () => string; check: () => void
}): Promise<{ queried: boolean; maxSeq: number; confirmed: string[] }> {
  const unknown = await input.storage<PendingPlain[]>({ type: 'peek', unknownOnly: true })
  input.check()
  if (!unknown.length) return { queried: false, maxSeq: 0, confirmed: [] }
  const selected = unknown.slice(0, 200)
  const receipts = await input.remote.receiptsFor(input.workspaceId, input.deviceId,
    selected.map(row => ({ opId: row.opId, payloadHash: row.payloadHash })), { signal: input.signal })
  input.check()
  if (receipts.some(receipt => selected.find(row => row.opId === receipt.opId)?.payloadHash !== receipt.payloadHash)) throw new SyncFailure('key', 'receipt hash mismatch')
  if (receipts.length) {
    await input.storage({ type: 'accept', scope: { workspaceId: input.workspaceId, generation: input.generation },
      pending: selected, results: receipts.map(row => ({ opId: row.opId, seq: row.seq })), at: input.at() })
    input.check()
  }
  return { queried: true, maxSeq: receipts.reduce((seq, row) => Math.max(seq, row.seq), 0), confirmed: receipts.map(row => row.opId) }
}
