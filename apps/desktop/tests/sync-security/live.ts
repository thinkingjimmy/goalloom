/**
 * [INPUT]: Authorized development API keys, disposable Auth users and the current storage-worker build.
 * [OUTPUT]: Real encrypted multi-device journeys, scoped cloud-state checks and a credential-free JSON report.
 * [POS]: Hosted service/SDK/SQLite E2E. Only connectivity, a lost reply and the local OS cipher are controlled.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { arch, cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { SyncService } from '../../src/main/sync/service'
import { createNetworkMonitor } from '../../src/main/sync/network-monitor'
import { worker } from '../sync-cost/peer'
import { calendar, command, sql, tasks } from '../sync-join/peer'

async function main() {
  const out = resolve('output/tests/sync-security/live')
  await mkdir(out, { recursive: true })
  const root = await mkdtemp(join(tmpdir(), 'goalloom-sync-security-live-'))
  const url = process.env['GOALLOOM_SUPABASE_URL']!
  const users = JSON.parse(process.env['SYNC_SECURITY_LIVE_USERS']!) as { id: string; email: string; password: string }[]
  assert.equal(new URL(url).hostname, 'asqyvcnxdltzzfutbbqy.supabase.co')
  assert.equal(users.length, 2)
  assert(users.every(user => user.email.startsWith('security-') && user.email.endsWith('@goalloom.test')))
  const service = createClient(url, process.env['SYNC_SECURITY_LIVE_SERVICE_KEY']!, { auth: { persistSession: false, autoRefreshToken: false } })
  const nativeFetch = globalThis.fetch, requests: any[] = [], peers: any[] = []
  const transport = { offline: false, loseCreationReply: false }
  const cipherKey = randomBytes(32)
  const cipher = {
    available: () => true,
    encrypt: (text: string) => {
      const iv = randomBytes(12), writer = createCipheriv('aes-256-gcm', cipherKey, iv)
      return Buffer.concat([iv, writer.update(text, 'utf8'), writer.final(), writer.getAuthTag()])
    },
    decrypt: (bytes: Buffer) => {
      const reader = createDecipheriv('aes-256-gcm', cipherKey, bytes.subarray(0, 12))
      reader.setAuthTag(bytes.subarray(-16))
      return Buffer.concat([reader.update(bytes.subarray(12, -16)), reader.final()]).toString()
    },
  }
  const report: any = { ok: false, checks: [], runtime: { electron: process.versions.electron, node: process.versions.node },
    host: { os: release(), arch: arch(), cpu: cpus()[0]?.model },
    scope: 'Real development Supabase Auth password sessions, HTTP/RPC, private Realtime and production SyncService/SQLite worker. Ephemeral AES cipher replaces OS keychain. Connectivity and one lost reply are controlled. No Google provider UI, Wi-Fi changes, packaged signing or Windows acceptance.' }
  const check = (name: string, evidence: object = {}) => { report.checks.push({ name, ...evidence }); console.log(`PASS ${name}`) }
  const sameTasks = (left: string, right: string) => assert.equal(JSON.stringify(tasks(left)) === JSON.stringify(tasks(right)), true, 'Task identities, text and states must match')
  const exists = async (path: string) => Boolean(await stat(path).catch(() => null))
  async function until(label: string, predicate: () => boolean | Promise<boolean>, timeout = 30000) {
    const deadline = performance.now() + timeout
    while (performance.now() < deadline) {
      if (await predicate()) return
      await new Promise(resolveWait => setTimeout(resolveWait, 50))
    }
    throw Error(`Timed out: ${label}`)
  }
  async function rows(table: string, userId: string) {
    assert(users.some(user => user.id === userId), 'Cloud queries must target this run only')
    assert(['workspaces', 'devices'].includes(table))
    const result = await service.from(table).select('*').eq('user_id', userId).order('id')
    assert(!result.error, `Cloud metadata query failed: ${result.error?.message}`)
    return result.data!
  }
  async function state(workspaceId: string) {
    const owned = (await rows('workspaces', users[0]!.id)).find(row => row.id === workspaceId)
    if (!owned) return null
    const data: any = { workspace: owned }
    for (const table of ['ops', 'device_roster', 'key_envelopes', 'recovery_checkpoints', 'op_receipts']) {
      const result = await service.from(table).select('*').eq('workspace_id', workspaceId)
      assert(!result.error, `Scoped ${table} query failed: ${result.error?.message}`)
      // Compare all persisted bytes in memory, never write ciphertext or plaintext into the report.
      data[table] = [...result.data!].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    }
    return data
  }
  async function open(name: string, account: number, online = { value: true }, seedCount?: number) {
    const profile = join(root, name)
    await mkdir(profile, { recursive: true })
    const storage = await worker(profile)
    const peer: any = { name, profile, storage, online, account, status: null, network: [] }
    if (seedCount !== undefined) {
      await command(peer, { type: 'confirmSetup', timezone: 'Asia/Singapore', weekStart: 1, mode: 'rolling',
        anchor: { kind: 'date', date: '2026-01-31' }, confirmed: true })
      for (let index = 0; index < seedCount; index++) await command(peer, { type: 'create', title: `${name} isolated task ${index}`, horizon: 'day' })
    }
    peer.service = new SyncService({ userData: profile, storage, cipher, random: () => 1,
      openExternal: async () => { throw Error('Live acceptance must not open a real user login') },
      notify: status => { peer.status = status }, onApplied: () => {}, clipboard: () => {}, now: () => new Date().toISOString(),
      monitorNetwork: handler => createNetworkMonitor(event => { peer.network.push({ event, at: performance.now() }); handler(event) }, { online: () => online.value }),
      beginSignIn: async client => {
        const user = users[peer.account]!
        const reply = await client.auth.signInWithPassword({ email: user.email, password: user.password })
        assert(!reply.error && reply.data.session, `Disposable Auth sign-in failed: ${reply.error?.message}`)
        return reply.data.session!
      },
    })
    peers.push(peer)
    await peer.service.start()
    return peer
  }
  async function close(peer: any) {
    peer.service.stop()
    await peer.service.operation
    await peer.service.schedule.settle()
    await peer.service.channelClosed
    await peer.storage.close()
    peers.splice(peers.indexOf(peer), 1)
  }
  async function drained(peer: any) {
    await peer.service.operation
    await peer.service.handle({ type: 'retry' })
    await until(`${peer.name} pending operations drain`, async () => {
      const view = await peer.storage.call('sync', { type: 'view' })
      return peer.status.phase === 'ready' && !peer.status.error && view.pending === 0
    })
    await peer.service.schedule.settle()
  }
  const expectPhase = (reply: any, phase: string) => assert.equal(reply.status.phase, phase, `Expected ${phase}; error=${reply.status.error ?? 'none'}`)

  globalThis.fetch = async (input, init) => {
    const target = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url)
    if (target.origin !== url) return nativeFetch(input, init)
    let body: any = {}
    if (typeof init?.body === 'string' && init.body) {
      try { body = JSON.parse(init.body) } catch { /* Auth may use a non-JSON transport body. */ }
    }
    const event: any = { path: target.pathname, workspaceId: body.p_workspace ?? null, at: performance.now() }
    requests.push(event)
    if (transport.offline) { event.controlledOffline = true; throw TypeError('Controlled offline boundary') }
    try {
      const response = await nativeFetch(input, init)
      event.status = response.status
      if (transport.loseCreationReply && target.pathname.endsWith('/create_new_workspace') && response.ok) {
        transport.loseCreationReply = false
        await response.arrayBuffer()
        event.lostReply = true
        throw TypeError('Controlled reply loss after server commit')
      }
      return response
    } catch (error) { event.failed = true; throw error }
  }

  try {
    let a = await open('alpha', 0, { value: true }, 3)
    expectPhase(await a.service.handle({ type: 'sign-in', provider: 'google' }), 'setup')
    expectPhase(await a.service.handle({ type: 'create', password: 'live-primary-password' }), 'ready')
    await drained(a)
    report.runtime.sqlite = (await a.storage.call('runtime')).sqlite
    const oldId = a.service.secrets.workspaceId
    let b = await open('beta', 0)
    expectPhase(await b.service.handle({ type: 'sign-in', provider: 'google' }), 'enter-key')
    expectPhase(await b.service.handle({ type: 'submit-password', password: 'live-primary-password' }), 'ready')
    await drained(a); await drained(b)
    sameTasks(a.profile, b.profile)
    assert.equal(JSON.stringify(calendar(a.profile)) === JSON.stringify(calendar(b.profile)), true)
    await until('real private channels subscribe', () => a.service.schedule.realtimeConnected && b.service.schedule.realtimeConnected)
    const oldState = await state(oldId)
    assert(oldState?.ops.length > 0 && oldState.device_roster.length > 0 && oldState.key_envelopes.length > 0 && oldState.recovery_checkpoints.length > 0)
    check('Real Auth sessions bootstrap and recover one encrypted board on two SQLite devices', { workspaceId: oldId, uploadedOps: oldState.ops.length, realtimeSubscribed: true })

    b.service.headHint = 0
    const broadcastAt = performance.now()
    await command(a, { type: 'create', title: 'Private realtime delivery', horizon: 'day' })
    a.service.nudge('write')
    await until('private head broadcast from the hosted server', () => b.service.headHint > 0, 15000)
    await until('broadcast-triggered encrypted download', () => tasks(b.profile).length === 4)
    await drained(a); await drained(b); sameTasks(a.profile, b.profile)
    check('Hosted private Realtime head broadcast triggers a real peer download', { elapsedMs: Math.round(performance.now() - broadcastAt), headSeq: b.service.headHint })

    const other = await open('other', 1, { value: true }, 1)
    expectPhase(await other.service.handle({ type: 'sign-in', provider: 'google' }), 'setup')
    expectPhase(await other.service.handle({ type: 'create', password: 'live-other-password' }), 'ready')
    await drained(other)
    const beforeOther = await rows('workspaces', users[1]!.id), otherDevices = await rows('devices', users[1]!.id)
    const keptTasks = JSON.stringify(tasks(a.profile))
    expectPhase(await a.service.handle({ type: 'sign-out' }), 'signed-out')
    assert.equal(JSON.stringify(tasks(a.profile)) === keptTasks, true, 'Keep-local sign-out must retain the board')
    a.account = 1
    const switched = await a.service.handle({ type: 'sign-in', provider: 'google' })
    expectPhase(switched, 'signed-out'); assert.equal(switched.status.error, 'mismatch')
    assert.equal(JSON.stringify(await rows('workspaces', users[1]!.id)) === JSON.stringify(beforeOther), true, 'Wrong account cloud must stay unchanged')
    assert.equal(JSON.stringify(await rows('devices', users[1]!.id)) === JSON.stringify(otherDevices), true, 'Wrong account must not register a device')
    assert.equal(JSON.stringify(tasks(a.profile)) === keptTasks, true)
    a.account = 0
    expectPhase(await a.service.handle({ type: 'sign-in', provider: 'google' }), 'ready'); await drained(a)
    check('Kept local data blocks a real second account before registration or cloud upload')

    const preserved = await state(oldId), localCalendar = calendar(a.profile)
    expectPhase(await a.service.handle({ type: 'create-new-workspace', password: 'live-new-password' }), 'ready')
    await drained(a)
    const newId = a.service.secrets.workspaceId
    assert.notEqual(newId, oldId)
    assert.equal(JSON.stringify(await state(oldId)) === JSON.stringify(preserved), true, 'Recovery must preserve every old encrypted cloud row')
    assert.equal(JSON.stringify(tasks(a.profile)) === keptTasks, true)
    assert.equal(JSON.stringify(calendar(a.profile)) === JSON.stringify(localCalendar), true)
    assert.equal((await rows('workspaces', users[0]!.id)).length, 2)
    await close(a); a = await open('alpha', 0); await drained(a)
    assert.equal(a.service.secrets.workspaceId, newId)
    await close(b); b = await open('beta', 0); await drained(b)
    assert.equal(b.service.secrets.workspaceId, oldId)
    await command(b, { type: 'create', title: 'Preserved workspace only', horizon: 'day' }); b.service.nudge('write'); await drained(b)
    assert.equal(tasks(a.profile).length, 4); assert.equal(tasks(b.profile).length, 5)
    const fresh = await open('fresh', 0)
    expectPhase(await fresh.service.handle({ type: 'sign-in', provider: 'google' }), 'enter-key')
    assert.equal(fresh.service.selectedWorkspace, newId)
    expectPhase(await fresh.service.handle({ type: 'submit-password', password: 'live-new-password' }), 'ready'); await drained(fresh)
    sameTasks(a.profile, fresh.profile); await close(fresh)
    const foreign = await other.service.client.rpc('list_account', { p_workspace: oldId })
    assert(!foreign.error && foreign.data === null)
    check('Non-destructive recovery preserves cloud bytes, both restart pins and old-device writes; fresh discovery selects newest and rejects foreign pins', { oldWorkspaceId: oldId, newWorkspaceId: newId, coexist: 2 })

    transport.loseCreationReply = true
    const lost = await a.service.handle({ type: 'create-new-workspace', password: 'live-retry-password' })
    assert.equal(lost.status.error, 'network')
    assert.equal(transport.loseCreationReply, false, 'The real server must commit before losing its response')
    const draftId = a.service.secrets.pendingRecovery.workspaceId
    assert.equal(a.service.secrets.workspaceId, newId)
    assert.equal(sql(a.profile, 'SELECT workspaceId FROM sync_state')[0]!.workspaceId, newId)
    assert(await state(draftId)); assert.equal((await rows('workspaces', users[0]!.id)).length, 3)
    await close(a); a = await open('alpha', 0); await drained(a)
    expectPhase(await a.service.handle({ type: 'create-new-workspace', password: 'live-retry-password' }), 'ready'); await drained(a)
    assert.equal(a.service.secrets.workspaceId, draftId)
    assert.equal((await rows('workspaces', users[0]!.id)).length, 3)
    const attempts = requests.filter(row => row.path.endsWith('/create_new_workspace') && row.workspaceId === draftId)
    assert.equal(attempts.length, 2); assert(attempts.every(row => row.status === 204 || row.status === 200))
    check('A real committed creation with a lost response reuses the encrypted draft after restart without a duplicate space', { workspaceId: draftId, realServerAttempts: attempts.length })

    await assert.rejects(a.service.handle({ type: 'reset-sync', password: 'live-reset-password' }))
    await assert.rejects(a.service.handle({ type: 'reset-sync', password: 'live-reset-password', confirmation: 'delete all cloud data' }))
    const oldBeforeReset = await state(oldId), newBeforeReset = await state(newId)
    expectPhase(await a.service.handle({ type: 'reset-sync', password: 'live-reset-password', confirmation: 'DELETE ALL CLOUD DATA' }), 'ready'); await drained(a)
    assert.equal(await state(draftId), null)
    for (const table of ['ops', 'device_roster', 'key_envelopes', 'recovery_checkpoints', 'op_receipts']) {
      const result = await service.from(table).select('workspace_id').eq('workspace_id', draftId)
      assert(!result.error && result.data?.length === 0, `Scoped reset must cascade ${table}`)
    }
    assert.equal(JSON.stringify(await state(oldId)) === JSON.stringify(oldBeforeReset), true)
    assert.equal(JSON.stringify(await state(newId)) === JSON.stringify(newBeforeReset), true)
    check('Exact-confirmation destructive recovery deletes only its selected real workspace and cascades its encrypted rows')

    await close(b)
    await close(other)
    await close(a)
    const beforeOffline = requests.length
    transport.offline = true
    const online = { value: false }
    a = await open('alpha', 0, online)
    assert.equal(a.status.phase, 'signed-out'); assert.equal(a.status.error, 'network')
    assert.equal(requests.length, beforeOffline, 'Offline startup must avoid an SDK refresh request')
    await command(a, { type: 'create', title: 'Offline pending upload', horizon: 'day' })
    const restoredAt = performance.now()
    transport.offline = false; online.value = true
    await until('automatic real session refresh after network restoration', () => a.status.phase === 'ready' && !a.status.error)
    await until('automatic pending upload after network restoration', async () => (await a.storage.call('sync', { type: 'view' })).pending === 0)
    const firstAfterOnline = requests.slice(beforeOffline)[0]
    assert(firstAfterOnline && firstAfterOnline.at - restoredAt <= 4000, 'Connectivity must trigger refresh within one two-second poll')
    assert(a.network.some((event: any) => event.event === 'online'))
    const offlinePeer = await open('offline-peer', 0)
    expectPhase(await offlinePeer.service.handle({ type: 'sign-in', provider: 'google' }), 'enter-key')
    expectPhase(await offlinePeer.service.handle({ type: 'submit-password', password: 'live-reset-password' }), 'ready'); await drained(offlinePeer)
    sameTasks(a.profile, offlinePeer.profile); await close(offlinePeer)
    check('Offline startup resumes a real saved Auth session and uploads offline writes automatically after an OS connectivity hint', {
      firstRefreshMs: Math.round(firstAfterOnline.at - restoredAt), completionMs: Math.round(performance.now() - restoredAt), manualRetries: 0 })

    const oldGeneration = (await a.storage.call('sync', { type: 'view' })).generation
    const primaryCloud = await rows('workspaces', users[0]!.id)
    expectPhase(await a.service.handle({ type: 'sign-out', clearLocal: true }), 'signed-out')
    assert.equal(tasks(a.profile).length, 0)
    assert.equal(await exists(join(a.profile, 'sync-vault.bin')), false)
    const freshView = await a.storage.call('sync', { type: 'view' })
    assert.notEqual(freshView.generation, oldGeneration)
    await close(a); a = await open('alpha', 1)
    expectPhase(await a.service.handle({ type: 'sign-in', provider: 'google' }), 'enter-key')
    expectPhase(await a.service.handle({ type: 'submit-password', password: 'live-other-password' }), 'ready'); await drained(a)
    assert.equal(tasks(a.profile).length, 1)
    assert.equal(tasks(a.profile).some(row => row.id === tasks(join(root, 'other'))[0]!.id), true)
    assert.equal(JSON.stringify(await rows('workspaces', users[0]!.id)) === JSON.stringify(primaryCloud), true)
    const heads = (spaces: any[]) => spaces.map(row => ({ id: row.id, generation: row.generation, headSeq: row.head_seq }))
    assert.equal(JSON.stringify(heads(await rows('workspaces', users[1]!.id))) === JSON.stringify(heads(beforeOther)), true, 'Joining may advance the roster, but it must not upload the previous account board')
    check('Clear-local sign-out creates a fresh generation; another real account downloads only its own board and leaves both clouds unchanged')
    report.ok = true
  } catch (error) { report.error = error instanceof Error ? error.message : 'Unknown live acceptance failure'; process.exitCode = 1 }
  finally {
    transport.offline = false
    for (const peer of [...peers]) {
      try { await close(peer) } catch { report.ok = false; report.localCleanupError = true; process.exitCode = 1 }
    }
    globalThis.fetch = nativeFetch
    await rm(root, { recursive: true, force: true })
    cipherKey.fill(0)
    report.localProfilesRemoved = !await exists(root)
    report.requests = { total: requests.length, controlledLostReplies: requests.filter(row => row.lostReply).length,
      rpcCounts: Object.fromEntries([...new Set(requests.map(row => row.path))].map(path => [path, requests.filter(row => row.path === path).length])) }
    report.sourceHashes = {}
    for (const path of ['tests/sync-security/live.ts', '../../scripts/sync-security-live.mjs', 'src/main/sync/service.ts',
      'src/main/sync/recovery.ts', 'src/main/sync/network-monitor.ts', 'src/main/storage/clear-local.ts', 'out/main/storage.js', '../../supabase/migrations/0009_sync_security.sql']) {
      report.sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
    }
    await writeFile(resolve(out, 'client.json'), JSON.stringify(report, null, 2))
    if (!report.ok) console.error(report.error ?? 'Live local cleanup failed')
  }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1 })
