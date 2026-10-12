/**
 * [INPUT]: Local op ids and hashes, plus server receipts (including duplicates after compaction).
 * [OUTPUT]: The original seq for each op. A reused op id with a different hash is rejected.
 * [POS]: Client half of adversarial case 1. The server half is push_ops / receipts_for.
 */

export interface PushReceipt {
  opId: string
  payloadHash: string
  seq: number
  duplicate?: boolean
  error?: string
}

export function applyPushReceipts(pending: { opId: string; payloadHash: string }[], receipts: PushReceipt[]): { opId: string; seq: number }[] {
  return receipts.map(receipt => {
    const local = pending.find(op => op.opId === receipt.opId)
    if (!local) throw new Error('unknown receipt')
    if (receipt.error) throw new Error(receipt.error)
    if (local.payloadHash !== receipt.payloadHash) throw new Error('op_id_reused')
    return { opId: receipt.opId, seq: receipt.seq }
  })
}
