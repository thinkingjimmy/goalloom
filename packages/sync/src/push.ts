/**
 * [INPUT]: Local ops in localOrder, with blob readiness.
 * [OUTPUT]: Batches of at most 200 ops and 1 MiB. An op waits for its blobs, and later ops do not pass it.
 * [POS]: Causal push planner. It does not perform network IO.
 */
export interface PushCandidate { opId: string; localOrder: number; bytes: number; blobReady: boolean }

const maxOps = 200
/** One op may use the whole push batch. A 100_000-character description seals under this and over 64 KiB. */
export const maxOpCiphertextBytes = 1024 * 1024
const maxBytes = maxOpCiphertextBytes

export function planPushBatches(ops: PushCandidate[]): string[][] {
  const ordered = [...ops].sort((left, right) => left.localOrder - right.localOrder)
  const batches: string[][] = []
  let current: string[] = []
  let bytes = 0
  for (const op of ordered) {
    if (!op.blobReady) break
    const nextBytes = bytes + op.bytes
    if (current.length && (current.length >= maxOps || nextBytes > maxBytes)) {
      batches.push(current)
      current = []
      bytes = 0
    }
    current.push(op.opId)
    bytes += op.bytes
  }
  if (current.length) batches.push(current)
  return batches
}

export function missingBlobHoldsCursor(blobReady: boolean): boolean { return !blobReady }
