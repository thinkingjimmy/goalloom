/**
 * [INPUT]: SUPABASE_URL, anon key, service-role key. Users come from the admin API.
 * [OUTPUT]: The six prototype scenarios against push_ops, pull_ops, rotate_epoch and snapshot-url.
 * [POS]: Hosted half of P0.7. Two Electron SQLite clients. No OAuth and no secrets in the log.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { parseSyncOp, syncOpPayload, type SyncOp } from '@goalloom/contracts'
import {
  hex, openOp, openSnapshot, rosterHash, sealOp, sealSnapshot, sha256Hex, signRoster, systemRandom, unhex, utf8,
} from '@goalloom/crypto'
import { applySyncOp, exportCanonicalSnapshot, installCanonicalSnapshot, markAccepted, markSendUnknown, mergeRemoteOps, projectionHash, rebuildVisibleFull } from '@goalloom/store-core'
import { applyPushReceipts, snapshotPlaintext } from '@goalloom/sync'
import { at, openSync } from './fixture'

const itemA = 'item-a'
const itemB = 'item-b'

type Box = ReturnType<typeof openSync>
interface Session {
  user: SupabaseClient
  deviceId: string
  signSk: Uint8Array
  boxPub: string
  box: Box
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function detail(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error ?? 'unknown error')
}

function bytea(bytes: Uint8Array): string {
  return `\\x${hex(bytes)}`
}

function titles(box: Box): string {
  return box.driver.prepare(`SELECT i.title AS title FROM items i JOIN item_placements p ON p.itemId=i.id
    WHERE i.deletedAt IS NULL ORDER BY p.sortKey, i.id`).all().map(row => String(row.title)).join(',')
}

function cursor(box: Box): number {
  return Number(box.driver.prepare('SELECT lastAppliedSeq AS seq FROM sync_state WHERE id=1').get()?.seq ?? 0)
}

function remember(box: Box, op: SyncOp): void {
  const payload = syncOpPayload(op)
  const order = Number(box.driver.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()?.n ?? 0) + 1
  box.driver.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,createdAt,updatedAt)
    VALUES (?,?,'local',1,?,?,?,?, 'never_sent', ?, ?)`).run(op.opId, order, payload, sha256Hex(payload), op.deviceId, op.at, at, at)
}

function bind(box: Box, workspaceId: string, generation: string): void {
  box.driver.prepare('UPDATE workspace SET generation=? WHERE id=1').run(generation)
  box.driver.prepare('UPDATE base_workspace SET generation=? WHERE id=1').run(generation)
  box.driver.prepare('UPDATE sync_state SET workspaceId=?, keyEpoch=1, updatedAt=? WHERE id=1').run(workspaceId, at)
}

async function admin(url: string, serviceKey: string, path: string, init: RequestInit = {}): Promise<{ id?: string }> {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} ${response.status} ${text.slice(0, 180)}`)
  return text ? JSON.parse(text) as { id?: string } : {}
}

export async function runHostedPrototype(input: { url: string; anonKey: string; serviceKey: string }): Promise<void> {
  const email = `p0-proto-${randomUUID()}@goalloom.test`
  const password = randomBytes(24).toString('base64url')
  const workspaceId = randomUUID()
  const generation = randomUUID()
  const workspaceKey = randomBytes(32)
  const service = createClient(input.url, input.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const sessions: Session[] = []
  let userId: string | null = null
  let objectPath = ''

  const pass = (name: string) => console.log(`pass  ${name}`)

  try {
    const created = await admin(input.url, input.serviceKey, '/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true }),
    })
    userId = created.id ?? null
    assert(userId, 'admin creates a confirmed test user')

    for (const name of ['electron-a', 'electron-b']) {
      const user = createClient(input.url, input.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      const signedIn = await user.auth.signInWithPassword({ email, password })
      if (signedIn.error || !signedIn.data.session) throw new Error(detail(signedIn.error))
      const signSk = ed25519.utils.randomSecretKey()
      const boxPub = hex(x25519.getPublicKey(x25519.utils.randomSecretKey()))
      const registered = await user.rpc('register_device', {
        p_name: name, p_platform: 'macos', p_sign_pub: bytea(ed25519.getPublicKey(signSk)), p_box_pub: bytea(unhex(boxPub)), p_protocol: 1,
      })
      if (registered.error || !registered.data) throw new Error(detail(registered.error))
      const deviceId = String(registered.data)
      const authorized = await service.from('devices').update({ status: 'authorized' }).eq('id', deviceId).select('status')
      if (authorized.error || authorized.data?.[0]?.status !== 'authorized') throw new Error(detail(authorized.error) || 'device was not authorized')
      const box = openSync()
      bind(box, workspaceId, generation)
      sessions.push({ user, deviceId, signSk, boxPub, box })
    }
    const left = sessions[0]
    const right = sessions[1]
    assert(left && right, 'two sessions')
    const workspace = await service.from('workspaces').insert({ id: workspaceId, user_id: userId, generation }).select('id')
    if (workspace.error || workspace.data?.[0]?.id !== workspaceId) throw new Error(detail(workspace.error) || 'workspace insert failed')

    const seal = (op: SyncOp, epoch: number) => {
      const payload = syncOpPayload(op)
      const ciphertext = sealOp({ workspaceKey, workspaceId, opId: op.opId, epoch, plaintext: utf8(payload), random: systemRandom() })
      return { op_id: op.opId, payload_hash: sha256Hex(payload), format_version: 1, key_epoch: epoch, ciphertext: hex(ciphertext), op }
    }
    const push = async (session: Session, rows: ReturnType<typeof seal>[]) => {
      const result = await session.user.rpc('push_ops', {
        p_workspace: workspaceId, p_device: session.deviceId, p_generation: generation, p_ops: rows.map(({ op: _op, ...wire }) => wire),
      })
      if (result.error) throw new Error(detail(result.error))
      const data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data
      assert(Array.isArray(data), 'push_ops did not return a list')
      return data as { op_id: string; seq?: number; duplicate?: boolean; error?: string }[]
    }
    const pull = async (session: Session) => {
      const result = await session.user.rpc('pull_ops', {
        p_workspace: workspaceId, p_device: session.deviceId, p_after: cursor(session.box), p_limit: 50,
      })
      if (result.error) throw new Error(detail(result.error))
      const data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data
      return (Array.isArray(data) ? data : []) as { seq: number; op_id: string; payload_hash: string; key_epoch: number; ciphertext: string }[]
    }
    const absorb = (session: Session, rows: Awaited<ReturnType<typeof pull>>) => {
      if (!rows.length) return
      const batch = rows.map(row => {
        const plain = new TextDecoder().decode(openOp({
          workspaceKey, workspaceId, opId: row.op_id, epoch: Number(row.key_epoch), ciphertext: unhex(row.ciphertext),
        }))
        const op = parseSyncOp(JSON.parse(plain))
        assert(sha256Hex(syncOpPayload(op)) === row.payload_hash, 'pulled payload hash')
        return { seq: Number(row.seq), op }
      })
      mergeRemoteOps(session.box.driver, batch, session.box.host, at)
    }

    const offline = parseSyncOp({
      v: 1, opId: randomUUID(), deviceId: left.deviceId, at,
      actions: [{ t: 'item.create', id: itemA, title: 'offline', description: '', dueDate: null, horizon: 'later', periodKey: null, sortHint: { afterId: null, beforeId: null } }],
    })
    applySyncOp(left.box.driver, offline, 'visible', left.box.host)
    remember(left.box, offline)
    assert(titles(left.box) === 'offline', 'offline title before push')
    assert(!left.box.driver.prepare('SELECT id FROM base_items WHERE id=?').get(itemA), 'base empty while offline')
    assert((await pull(right)).length === 0, 'peer pull is empty while the author is offline')
    const offlineReceipt = (await push(left, [seal(offline, 1)]))[0]
    assert(offlineReceipt?.seq === 1 && offlineReceipt.duplicate === false, 'offline edit allocated seq 1')
    absorb(left, await pull(left))
    absorb(right, await pull(right))
    assert(titles(left.box) === 'offline' && titles(right.box) === 'offline', 'both clients show the offline edit')
    pass('offline edit')

    const second = parseSyncOp({
      v: 1, opId: randomUUID(), deviceId: left.deviceId, at,
      actions: [{ t: 'item.create', id: itemB, title: 'second', description: '', dueDate: null, horizon: 'later', periodKey: null, sortHint: { afterId: itemA, beforeId: null } }],
    })
    const place = parseSyncOp({
      v: 1, opId: randomUUID(), deviceId: left.deviceId, at,
      actions: [{ t: 'item.place', id: itemB, horizon: 'later', periodKey: null, sortHint: { afterId: null, beforeId: itemA }, reason: 'arrange' }],
    })
    applySyncOp(left.box.driver, second, 'visible', left.box.host)
    applySyncOp(left.box.driver, place, 'visible', left.box.host)
    assert(titles(left.box) === 'second,offline', 'local order before push')
    assert(titles(right.box) === 'offline', 'peer has not reordered')
    const placed = await push(left, [seal(second, 1), seal(place, 1)])
    assert(placed[0]?.seq === 2 && placed[1]?.seq === 3 && !placed[0]?.error && !placed[1]?.error, 'reorder allocated seq 2 and 3')
    absorb(left, await pull(left))
    absorb(right, await pull(right))
    assert(titles(left.box) === 'second,offline' && titles(right.box) === titles(left.box), 'both clients share the order')
    pass('reorder')

    const rejected = parseSyncOp({
      v: 1, opId: randomUUID(), deviceId: right.deviceId, at,
      actions: [{ t: 'item.set', id: 'missing', fields: { title: 'nope' } }],
    })
    const conflict = (await push(right, [seal(rejected, 1)]))[0]
    assert(conflict?.seq === 4 && !conflict.error, 'server accepts ciphertext it cannot read')
    absorb(left, await pull(left))
    absorb(right, await pull(right))
    assert(left.box.driver.prepare('SELECT code FROM sync_conflicts WHERE seq=4').get()?.code === 'item_deleted', 'client rejected the op')
    assert(titles(left.box) === 'second,offline' && titles(right.box) === 'second,offline', 'conflict left both lists unchanged')
    pass('conflict reject')

    const recovered = parseSyncOp({
      v: 1, opId: randomUUID(), deviceId: left.deviceId, at,
      actions: [{ t: 'item.set', id: itemA, fields: { title: 'recovered' } }],
    })
    applySyncOp(left.box.driver, recovered, 'visible', left.box.host)
    remember(left.box, recovered)
    markSendUnknown(left.box.driver, [recovered.opId], 'attempt-1', at)
    rebuildVisibleFull(left.box.driver, left.box.host)
    assert(titles(left.box) === 'second,recovered', 'title remains after the response is lost')
    const sealedRecovery = seal(recovered, 1)
    const lost = (await push(left, [sealedRecovery]))[0]
    assert(lost?.seq === 5 && lost.duplicate === false, 'server accepted the op whose response was discarded')
    const receipts = await left.user.rpc('receipts_for', {
      p_workspace: workspaceId, p_device: left.deviceId, p_op_ids: [recovered.opId],
    })
    if (receipts.error) throw new Error(detail(receipts.error))
    const found = (typeof receipts.data === 'string' ? JSON.parse(receipts.data) : receipts.data)?.[0]
    assert(found?.seq === lost.seq && found?.payload_hash === sealedRecovery.payload_hash, 'receipt matches the lost response')
    const pending = [{ opId: recovered.opId, payloadHash: sealedRecovery.payload_hash }]
    assert(applyPushReceipts(pending, [{ opId: recovered.opId, payloadHash: sealedRecovery.payload_hash, seq: Number(found.seq), duplicate: true }])[0]?.seq === 5, 'retry keeps seq 5')
    const duplicate = (await push(left, [sealedRecovery]))[0]
    assert(duplicate?.duplicate === true && duplicate.seq === 5, 'second push is a duplicate of seq 5')
    markAccepted(left.box.driver, recovered.opId, 5, at)
    assert(Number(left.box.driver.prepare('SELECT count(*) AS n FROM sync_ops WHERE opId=?').get(recovered.opId)?.n) === 1, 'one local row')
    absorb(left, await pull(left))
    absorb(right, await pull(right))
    assert(titles(left.box) === 'second,recovered' && titles(right.box) === 'second,recovered', 'both clients recovered the edit')
    pass('crash recovery')

    const roster = {
      workspaceId, version: 1, epoch: 2, prevHash: null,
      devices: [{ id: left.deviceId, signPub: hex(ed25519.getPublicKey(left.signSk)), boxPub: left.boxPub }, { id: right.deviceId, signPub: hex(ed25519.getPublicKey(right.signSk)), boxPub: right.boxPub }],
      recoverySignPub: hex(ed25519.getPublicKey(left.signSk)), recoveryBoxPub: left.boxPub,
    }
    const signature = signRoster(roster, left.signSk)
    const rotated = await left.user.rpc('rotate_epoch', {
      p_workspace: workspaceId, p_device: left.deviceId, p_expected_epoch: 1,
      p_roster: roster, p_body_hash: rosterHash(roster), p_signature: bytea(signature),
    })
    if (rotated.error) throw new Error(detail(rotated.error))
    const staleOp = parseSyncOp({
      v: 1, opId: randomUUID(), deviceId: left.deviceId, at,
      actions: [{ t: 'item.set', id: itemA, fields: { title: 'stale' } }],
    })
    const stale = (await push(left, [seal(staleOp, 1)]))[0]
    assert(stale?.error === 'stale_epoch' && stale.seq == null, 'epoch 1 is rejected after rotation')
    assert((await pull(left)).length === 0, 'stale op did not advance the cursor')
    const rotatedOp = parseSyncOp({
      v: 1, opId: randomUUID(), deviceId: left.deviceId, at,
      actions: [{ t: 'item.set', id: itemA, fields: { title: 'rotated' } }],
    })
    const epoch2 = seal(rotatedOp, 2)
    assert(sha256Hex(syncOpPayload(rotatedOp)) === epoch2.payload_hash, 'epoch does not change the payload hash')
    const next = (await push(left, [epoch2]))[0]
    assert(next?.seq === 6 && !next.error, 'epoch 2 op allocated seq 6')
    const pulled = await pull(right)
    const rotatedRow = pulled[0]
    assert(rotatedRow, 'peer did not receive the epoch 2 op')
    assert(throws(() => openOp({
      workspaceKey, workspaceId, opId: rotatedOp.opId, epoch: 1, ciphertext: unhex(rotatedRow.ciphertext),
    })), 'epoch 1 cannot open the epoch 2 ciphertext')
    absorb(left, await pull(left))
    absorb(right, pulled)
    assert(titles(left.box) === 'second,rotated' && titles(right.box) === 'second,rotated', 'both clients applied the new epoch')
    pass('key rotation')

    const uptoSeq = cursor(left.box)
    assert(uptoSeq === 6, 'snapshot cursor is 6')
    const body = exportCanonicalSnapshot(left.box.driver, { workspaceId, uptoSeq, keyEpoch: 2 })
    const plain = snapshotPlaintext(body)
    const ciphertext = sealSnapshot({ workspaceKey, workspaceId, uptoSeq, epoch: 2, plaintext: utf8(plain), random: systemRandom() })
    objectPath = `workspaces/${workspaceId}/${uptoSeq}.bin`
    const published = await service.from('snapshots').insert({
      workspace_id: workspaceId, upto_seq: uptoSeq, format_version: 1, key_epoch: 2,
      object_path: objectPath, sha256: sha256Hex(ciphertext), size: ciphertext.length, state: 'published', created_by: left.deviceId,
    }).select('upto_seq')
    if (published.error) throw new Error(detail(published.error))
    const upload = await edge(input, left, 'upload')
    const bytes = new ArrayBuffer(ciphertext.byteLength)
    new Uint8Array(bytes).set(ciphertext)
    const put = await fetch(upload.signedUrl, { method: 'PUT', headers: { 'content-type': 'application/octet-stream', 'x-upsert': 'true' }, body: new Blob([bytes]) })
    if (!put.ok) throw new Error(`snapshot upload ${put.status} ${redact(await put.text())}`)
    const download = await edge(input, right, 'download')
    const downloaded = await fetch(download.signedUrl)
    if (!downloaded.ok) throw new Error(`snapshot download ${downloaded.status} ${redact(await downloaded.text())}`)
    const got = new Uint8Array(await downloaded.arrayBuffer())
    assert(hex(got) === hex(ciphertext), 'downloaded snapshot bytes match the upload')
    const opened = new TextDecoder().decode(openSnapshot({ workspaceKey, workspaceId, uptoSeq, epoch: 2, ciphertext: got }))
    const joiner = openSync()
    try {
      const minted = String(joiner.driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation)
      installCanonicalSnapshot(joiner.driver, JSON.parse(opened), at)
      assert(String(joiner.driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation) === generation, 'join keeps the snapshot generation')
      assert(minted !== generation, 'joiner had a different generation')
      assert(projectionHash(joiner.driver, 'base') === projectionHash(left.box.driver, 'base'), 'joined base matches the author')
      assert(cursor(joiner) === uptoSeq, 'joiner resumes at uptoSeq')
    } finally {
      joiner.db.close()
    }
    pass('snapshot join')
  } finally {
    for (const session of sessions) session.box.db.close()
    if (userId) {
      if (objectPath) await service.storage.from('snapshots').remove([objectPath]).catch(() => {})
      await deleteHostedUser(service, userId).catch((error: unknown) => console.error(`row cleanup failed: ${detail(error)}`))
      await admin(input.url, input.serviceKey, `/auth/v1/admin/users/${userId}`, { method: 'DELETE' }).catch((error: unknown) => console.error(`user cleanup failed: ${detail(error)}`))
    }
    await Promise.all(sessions.map(session => session.user.realtime.disconnect().catch(() => {})))
  }
}

async function deleteHostedUser(client: SupabaseClient, userId: string): Promise<void> {
  const devices = await client.from('devices').select('id').eq('user_id', userId)
  if (devices.error) throw new Error(devices.error.message)
  const deviceIds = (devices.data ?? []).map(row => row.id)
  const workspaces = await client.from('workspaces').select('id').eq('user_id', userId)
  if (workspaces.error) throw new Error(workspaces.error.message)
  const workspaceIds = (workspaces.data ?? []).map(row => row.id)
  if (workspaceIds.length) {
    const removed = await client.from('workspaces').delete().in('id', workspaceIds)
    if (removed.error) throw new Error(removed.error.message)
  }
  if (deviceIds.length) {
    const buckets = await client.from('rpc_buckets').delete().in('device_id', deviceIds)
    if (buckets.error) throw new Error(buckets.error.message)
    const events = await client.from('control_events').delete().in('device_id', deviceIds)
    if (events.error) throw new Error(events.error.message)
    const gone = await client.from('devices').delete().in('id', deviceIds)
    if (gone.error) throw new Error(gone.error.message)
  }
}

function throws(fn: () => unknown): boolean {
  try { fn(); return false } catch { return true }
}

function redact(text: string): string {
  return text.replace(/token=[^&\s"]+/g, 'token=redacted').slice(0, 180)
}

async function edge(input: { url: string; anonKey: string }, session: Session, method: 'upload' | 'download'): Promise<{ signedUrl: string }> {
  const access = (await session.user.auth.getSession()).data.session?.access_token
  assert(access, 'session expired')
  const upto = cursor(session.box)
  const response = await fetch(`${input.url}/functions/v1/snapshot-url`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, apikey: input.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      deviceId: session.deviceId, workspaceId: (session.box.driver.prepare('SELECT workspaceId FROM sync_state WHERE id=1').get()?.workspaceId),
      seq: upto, path: `workspaces/${session.box.driver.prepare('SELECT workspaceId FROM sync_state WHERE id=1').get()?.workspaceId}/${upto}.bin`, method,
    }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`snapshot-url ${method} ${response.status} ${redact(text)}`)
  const body = JSON.parse(text) as { signedUrl?: string }
  if (!body.signedUrl?.startsWith('http')) throw new Error('signed url missing')
  return { signedUrl: body.signedUrl }
}
