/**
 * [INPUT]: A workspace key and canonical SyncOp bytes, or a pulled ciphertext row.
 * [OUTPUT]: C3 ciphertext, or a parsed op whose hash matches the server receipt.
 * [POS]: The only place the engine seals and opens ops.
 */
import { parseSyncOp, syncOpPayload, type SyncOp } from '@goalloom/contracts'
import { hex, openOp, sealOp, sha256Hex, systemRandom, unhex, utf8, type RandomSource } from '@goalloom/crypto'
import type { PullWire, PushWire } from './remote'
import { SyncFailure } from './failure'

export function sealOpWire(input: { op: SyncOp; workspaceKey: Uint8Array; workspaceId: string; epoch: number; random?: RandomSource }): PushWire {
  const payload = syncOpPayload(input.op)
  const ciphertext = sealOp({
    workspaceKey: input.workspaceKey, workspaceId: input.workspaceId, opId: input.op.opId, epoch: input.epoch,
    plaintext: utf8(payload), random: input.random ?? systemRandom(),
  })
  return { opId: input.op.opId, payloadHash: sha256Hex(payload), formatVersion: 1, keyEpoch: input.epoch, ciphertext: hex(ciphertext) }
}

export function openOpWire(row: PullWire, input: { workspaceKey: Uint8Array; workspaceId: string }): SyncOp {
  if (row.formatVersion !== 1) throw new SyncFailure('version')
  let plain: Uint8Array
  try {
    plain = openOp({ workspaceKey: input.workspaceKey, workspaceId: input.workspaceId, opId: row.opId, epoch: row.keyEpoch, ciphertext: unhex(row.ciphertext) })
  } catch {
    throw new SyncFailure('key')
  }
  const text = new TextDecoder().decode(plain)
  let parsed: SyncOp
  try { parsed = parseSyncOp(JSON.parse(text)) }
  catch { throw new SyncFailure('version') }
  if (parsed.opId !== row.opId || sha256Hex(syncOpPayload(parsed)) !== row.payloadHash) throw new SyncFailure('key')
  return parsed
}
