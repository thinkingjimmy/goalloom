/**
 * [INPUT]: Synthetic devices and the production encrypted sync protocol.
 * [OUTPUT]: A counted HTTP/Realtime boundary with controllable failures; no user data.
 * [POS]: Cloud boundary for sync acceptance. Persistence and SyncService remain production code.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { unhex } from '@goalloom/crypto'
import { createMemoryWorld, memoryRemote } from '@goalloom/sync'

export const userId = '11111111-1111-4111-8111-111111111111'
export async function createCloud() {
  const world = createMemoryWorld()
  const requests: { rpc: string; peer: string; bytes: number; uploadedBytes: number; aborted: boolean }[] = []
  const replies: (() => void)[] = []
  const delayed: (() => Promise<void>)[] = []
  const sockets = new Set<any>()
  const controls = { fault: '', session: '', blocked: '', retryAt: 0, broadcasts: 0, dropped: false }
  const jwt = (session: string) => [
    { alg: 'HS256', typ: 'JWT' },
    { sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', session_id: session },
  ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic'
  const sessionOf = (authorization: string) => {
    try { return JSON.parse(Buffer.from(authorization.split('.')[1]!, 'base64url').toString()).session_id }
    catch { return 'alpha' }
  }
  const wire = (value: string) => unhex(value.replace(/^\\x/, ''))
  const server = createServer(async (request, response) => {
    const fault = !controls.session || sessionOf(request.headers.authorization ?? '') === controls.session ? controls.fault : ''
    const rpc = request.url!.split('/').pop()!.split('?')[0]!
    const row = { rpc, peer: sessionOf(request.headers.authorization ?? ''), bytes: 0, uploadedBytes: 0, aborted: false }
    requests.push(row)
    response.on('close', () => { if (!response.writableEnded) row.aborted = true })
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    row.uploadedBytes = Buffer.concat(chunks).length
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    const send = (value: unknown, status = 200) => {
      const json = JSON.stringify(value)
      row.bytes = Buffer.byteLength(json)
      response.writeHead(status, { 'content-type': 'application/json' }); response.end(json)
    }
    if (request.url!.includes('/auth/v1/token')) {
      send({ access_token: jwt(body.refresh_token), refresh_token: body.refresh_token, token_type: 'bearer', expires_in: 3600,
        user: { id: userId, email: 'sync@example.invalid', aud: 'authenticated', role: 'authenticated' } })
      return
    }
    if (request.url!.includes('/auth/')) { send(null); return }
    if (fault === `missing:${rpc}`) { send({ code: 'PGRST202', message: 'Missing target RPC' }, 404); return }
    if (fault === `headers:${rpc}`) return
    if (fault === `body:${rpc}`) { response.writeHead(200, { 'content-type': 'application/json' }); response.write('['); return }
    const remote = memoryRemote(world, sessionOf(request.headers.authorization ?? ''))
    const b = body
    const handlers: Record<string, () => Promise<unknown>> = {
      list_account: () => remote.account(),
      register_device: () => remote.registerDevice({ name: b.p_name, platform: b.p_platform, signPub: wire(b.p_sign_pub), boxPub: wire(b.p_box_pub) }),
      rebind_device: () => remote.rebindDevice(b.p_device, wire(b.p_message), wire(b.p_signature)),
      get_roster: () => remote.getRoster(b.p_workspace, b.p_device),
      get_key_envelopes: () => remote.getEnvelopes(b.p_workspace, b.p_device),
      get_latest_checkpoint: () => remote.getCheckpoint(b.p_workspace, b.p_device),
      start_recovery: () => remote.startRecovery(b.p_workspace, b.p_device),
      complete_recovery: () => remote.completeRecovery({ workspaceId: b.p_workspace, deviceId: b.p_device, challengeId: b.p_challenge,
        signature: wire(b.p_signature), roster: b.p_roster, bodyHash: b.p_body_hash, rosterSig: wire(b.p_roster_sig) }),
      put_key_envelopes: () => remote.putEnvelopes(b.p_workspace, b.p_device, b.p_envelopes),
      bootstrap_workspace: () => remote.bootstrap({ deviceId: b.p_device, workspaceId: b.p_workspace, generation: b.p_generation,
        roster: b.p_roster, rosterHash: b.p_roster_hash, rosterSig: wire(b.p_roster_sig), checkpoint: b.p_checkpoint,
        recSig: wire(b.p_rec_sig), devSig: wire(b.p_dev_sig) }),
      pull_ops: () => remote.pullOps({ workspaceId: b.p_workspace, deviceId: b.p_device, after: b.p_after, limit: b.p_limit }),
      push_ops: () => remote.pushOps({ workspaceId: b.p_workspace, deviceId: b.p_device, generation: b.p_generation,
        ops: b.p_ops.map((op: any) => ({ opId: op.op_id, payloadHash: op.payload_hash, formatVersion: op.format_version, keyEpoch: op.key_epoch, ciphertext: op.ciphertext })) }),
      get_sync_status: async () => {
        await remote.pullOps({ workspaceId: b.p_workspace, deviceId: b.p_device, after: world.workspace?.headSeq ?? 0, limit: 1 })
        return { ...(await remote.account()), minRetainedSeq: 0, minProtocolRead: 1, minProtocolWrite: 1 }
      },
      receipts_for: async () => {
        await remote.pullOps({ workspaceId: b.p_workspace, deviceId: b.p_device, after: world.workspace?.headSeq ?? 0, limit: 1 })
        return b.p_op_ids.flatMap((id: string) => {
          const receipt = world.workspace?.receipts.get(id)
          return receipt ? [{ op_id: id, payload_hash: receipt.hash, seq: receipt.seq }] : []
        })
      },
    }
    try {
      if (fault === `gate-limit:${rpc}`) {
        replies.push(() => send({ code: 'P0001', message: 'upload_rate_limited', details: JSON.stringify({ retryAt: controls.retryAt, scope: 'upload' }) }, 429)); return
      }
      if (controls.blocked === rpc) { send({ code: 'P0001', message: 'upload_rate_limited', details: JSON.stringify({ retryAt: controls.retryAt, scope: 'upload' }) }, 429); return }
      if (fault === `late:${rpc}`) {
        delayed.push(async () => { const previous = world.workspace?.headSeq ?? 0; await handlers[rpc]!(); if ((world.workspace?.headSeq ?? 0) > previous) broadcast() })
        return
      }
      const previous = world.workspace?.headSeq ?? 0
      const result = await handlers[rpc]!()
      if (rpc === 'push_ops' && (world.workspace?.headSeq ?? 0) > previous) broadcast()
      if (fault === `commit:${rpc}`) { response.destroy(); return }
      if (fault === `gate:${rpc}`) { replies.push(() => send(result ?? null)); return }
      send(result ?? null)
    } catch (error) { send({ message: (error as Error).message, code: '42501' }, 403) }
  })
  function frame(value: unknown) {
    const bytes = Buffer.from(JSON.stringify(value))
    if (bytes.length < 126) return Buffer.concat([Buffer.from([129, bytes.length]), bytes])
    const header = Buffer.alloc(4); header[0] = 129; header[1] = 126; header.writeUInt16BE(bytes.length, 2)
    return Buffer.concat([header, bytes])
  }
  function broadcast() {
    controls.broadcasts++
    if (controls.dropped) return
    for (const socket of sockets) if (socket.topic) socket.write(frame([socket.joinRef, null, socket.topic, 'broadcast', { event: 'head', payload: { head: world.workspace?.headSeq }, type: 'broadcast' }]))
  }
  server.on('upgrade', (request, socket) => {
    const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n')
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    let pending = Buffer.alloc(0)
    socket.on('data', (data: Buffer) => {
      pending = Buffer.concat([pending, data])
      while (pending.length >= 2) {
        const opcode = pending[0]! & 15
        let size = pending[1]! & 127, offset = 2
        if (size === 126) { if (pending.length < 4) return; size = pending.readUInt16BE(2); offset = 4 }
        if (size === 127) return
        const masked = Boolean(pending[1]! & 128)
        if (pending.length < offset + (masked ? 4 : 0) + size) return
        const mask = pending.subarray(offset, offset + 4); if (masked) offset += 4
        const message = Buffer.from(pending.subarray(offset, offset + size))
        if (masked) for (let i = 0; i < size; i++) message[i] = message[i]! ^ mask[i % 4]!
        pending = pending.subarray(offset + size)
        if (opcode === 8) { socket.end(); return }
        if (opcode !== 1) continue
        const [joinRef, ref, topic, event] = JSON.parse(message.toString())
        if (event === 'phx_join') { (socket as any).topic = topic; (socket as any).joinRef = joinRef }
        socket.write(frame([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]))
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { world, requests, controls, broadcast, releaseReplies() { for (const reply of replies.splice(0)) reply() }, disconnectSockets() { for (const socket of sockets) socket.destroy() }, async commitDelayed() { for (const commit of delayed.splice(0)) await commit() }, url: `http://127.0.0.1:${(server.address() as any).port}`,
    async close() { for (const socket of sockets) socket.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } }
}
