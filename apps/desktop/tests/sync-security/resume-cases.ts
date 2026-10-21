/**
 * [INPUT]: Production service/SDK/SQLite, isolated profiles and a controlled encrypted cloud.
 * [OUTPUT]: Automatic session restoration, explicit logout and Case 1 regression evidence.
 * [POS]: Persistent-session E2E. OS storage is synthetic; signed native acceptance is separate.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createCloud } from '../sync-cost/cloud'
import { Clock } from '../sync-cost/clock'
import { cipher, worker } from '../sync-cost/peer'
import { calendar, command, password, seedLocal, settle, sql, tasks } from '../sync-join/peer'
import { SyncService } from '../../src/main/sync/service'
import { CredentialError } from '../../src/main/smart/credentials'

async function main() {
  const out = resolve('output/tests/sync-security'), root = await mkdtemp(join(tmpdir(), 'goalloom-session-sync-'))
  await mkdir(out, { recursive: true })
  const cloud = await createCloud(), peers: any[] = []
  const report: any = { ok: false, checks: [], runtime: { electron: process.versions.electron, node: process.versions.node },
    host: { os: release(), arch: arch(), cpu: cpus()[0]?.model },
    scope: 'Production service/SDK/SQLite, isolated service lifetimes, synthetic OS cipher and encrypted HTTP. No signed native or physical reboot acceptance.' }
  const check = (label: string) => { report.checks.push(label); console.log(`PASS ${label}`) }
  async function open(profile: string, name: string, allowed = true, modern = true, online = true) {
    const storage = await worker(profile), clock = new Clock()
    const peer: any = { profile, storage, clock, name, allowed, signIns: 0, reads: 0, status: null, secretDenied: false, keys: new Map() }
    const protectedCipher = { available: () => peer.allowed,
      encrypt: (value: string) => { if (!peer.allowed) throw new CredentialError('unavailable'); return cipher.encrypt(value) },
      decrypt: (value: Buffer) => { peer.reads++; if (!peer.allowed) throw new CredentialError('unavailable'); return cipher.decrypt(value) } }
    peer.service = new SyncService({ userData: profile, storage, clock, random: () => 1,
      cipher: protectedCipher, ...(modern ? { sessionCipher: protectedCipher } : {}),
      openExternal: async () => {}, notify: status => { peer.status = status }, onApplied: () => {}, clipboard: () => {},
      now: () => new Date().toISOString(), onSettings: async () => [],
      monitorNetwork: handler => { peer.network = handler; handler(online ? 'online' : 'offline'); return () => {} },
      beginSignIn: async client => { peer.signIns++; return (await client.auth.refreshSession({ refresh_token: peer.name })).data.session! },
      readSecret: async key => peer.keys.get(key),
      applySecret: async (key, value) => { if (peer.secretDenied) throw new CredentialError('unavailable'); peer.keys.set(key, value) },
    })
    peers.push(peer); await peer.service.start(); return peer
  }
  async function close(peer: any) { peer.service.stop(); await peer.service.schedule.settle(); await peer.storage.close(); peers.splice(peers.indexOf(peer), 1) }
  async function login(peer: any, value = password) {
    await peer.service.handle({ type: 'sign-in', provider: 'google' }); assert.equal(peer.status.phase, 'enter-key', JSON.stringify(peer.status))
    await peer.service.handle({ type: 'submit-password', password: value }); await settle(peer)
    assert.equal(peer.status.phase, 'ready', JSON.stringify(peer.status)); assert.equal(peer.status.error, null)
  }
  try {
    const alpha = join(root, 'alpha'), beta = join(root, 'beta')
    await seedLocal(alpha, 'alpha', 5, cloud); await seedLocal(beta, 'beta', 0, cloud)
    const original = tasks(alpha), originalCalendar = calendar(alpha)
    let a = await open(alpha, 'alpha'), b = await open(beta, 'beta')
    assert.equal(a.reads + b.reads, 0)
    await b.service.handle({ type: 'sign-in', provider: 'google' }); assert.equal(b.status.phase, 'setup')
    await b.service.handle({ type: 'create', password }); await settle(b)
    await login(a); await settle(a, b)
    assert.deepEqual(tasks(beta), original); assert.deepEqual(calendar(beta), originalCalendar)
    report.runtime.sqlite = (await a.storage.call('runtime')).sqlite
    const device = a.service.secrets.deviceId, devices = cloud.world.devices.size
    check('Case 1: empty B enables sync first; populated A joins automatically with the same task IDs and calendar')

    await close(a); a = await open(alpha, 'alpha'); await settle(a, b)
    assert.equal(a.signIns, 0); assert.equal(a.status.phase, 'ready'); assert.equal(a.service.secrets.deviceId, device)
    await command(a, { type: 'create', title: 'Automatic after restart', horizon: 'day' }); await settle(a, b)
    assert.equal(tasks(beta).filter(row => row.title === 'Automatic after restart').length, 1)
    check('A new service lifetime restores its session and syncs without Google authorization or password entry')

    await a.service.handle({ type: 'sign-out' }); assert.equal(a.status.phase, 'signed-out')
    await command(b, { type: 'delete', itemId: original[0]!.id, expectedVersion: Number(sql(beta, `SELECT version FROM items WHERE id='${original[0]!.id}'`)[0]!.version) }); await settle(b)
    await close(a); a = await open(alpha, 'alpha')
    assert.equal(a.status.phase, 'signed-out'); assert.equal(a.signIns, 0); assert.equal(a.reads, 0)
    await a.service.handle({ type: 'sign-in', provider: 'google' }); assert.equal(a.signIns, 1); assert.equal(a.status.phase, 'enter-key')
    await a.service.handle({ type: 'submit-password', password: 'incorrect-password' }); assert.equal(a.status.error, 'password')
    await close(a); a = await open(alpha, 'alpha')
    assert.equal(a.status.phase, 'signed-out'); assert.equal(a.reads, 0)
    await login(a); await settle(a, b)
    assert.deepEqual(tasks(alpha), tasks(beta)); assert(tasks(alpha).find(row => row.id === original[0]!.id)!.deletedAt)
    assert.equal(a.service.secrets.deviceId, device); assert.equal(cloud.world.devices.size, devices)
    check('Logout survives restart and wrong-password login; successful relogin preserves device identity, task IDs and remote tombstones')

    for (let repeat = 0; repeat < 2; repeat++) {
      await a.service.handle({ type: 'sign-out' }); await login(a); await settle(a, b)
      assert.deepEqual(tasks(alpha), tasks(beta)); assert.equal(cloud.world.devices.size, devices)
    }
    await close(a); a = await open(alpha, 'alpha'); assert.equal(a.status.phase, 'ready'); assert.equal(a.signIns, 0)
    check('Repeated logout/login neither imports again nor resurrects deleted tasks, and restores automatic login afterwards')

    const beforeFailedLogout = await readFile(join(alpha, 'sync-session.bin'))
    await mkdir(join(alpha, 'sync-session.bin.tmp'))
    await a.service.handle({ type: 'sign-out' })
    assert.equal(a.status.phase, 'ready'); assert.equal(a.status.error, 'storage')
    assert.deepEqual(await readFile(join(alpha, 'sync-session.bin')), beforeFailedLogout)
    await rm(join(alpha, 'sync-session.bin.tmp'), { recursive: true })
    check('A failed durable logout reports failure and retains the prior session and bytes')

    await close(a); a = await open(alpha, 'alpha', true, true, false)
    assert.equal(a.status.error, 'network'); assert.equal(a.signIns, 0)
    await command(b, { type: 'create', title: 'Receive after offline startup', horizon: 'day' }); await settle(b)
    a.network('online'); await a.service.operation; await settle(a, b)
    assert.equal(a.status.phase, 'ready'); assert.equal(a.signIns, 0)
    assert(tasks(alpha).some(row => row.title === 'Receive after offline startup'))
    check('Offline startup retains the session and resumes automatically when connectivity returns')

    a.secretDenied = true
    b.keys.set('ai.key.openrouter', 'synthetic-session-api-key')
    await b.storage.call('sync', { type: 'emit-settings', entries: [{ key: 'ai.key.openrouter', value: 'synthetic-session-api-key' }],
      at: new Date().toISOString(), opId: crypto.randomUUID(), mode: 'change' })
    await command(b, { type: 'create', title: 'Sync despite old AI key denial', horizon: 'day' }); await settle(b, a)
    assert.equal(a.status.error, null); assert.equal(a.status.credentialStorage, undefined)
    assert(tasks(alpha).some(row => row.title === 'Sync despite old AI key denial'))
    assert.equal(a.service.secrets.pendingSecrets['ai.key.openrouter'].value, 'synthetic-session-api-key')
    assert(!JSON.stringify(sql(alpha, 'SELECT * FROM sync_settings')).includes('synthetic-session-api-key'))
    a.secretDenied = false; await settle(a)
    assert.equal(a.keys.get('ai.key.openrouter'), 'synthetic-session-api-key')
    check('Modern session storage keeps syncing tasks when the separate legacy AI credential store is denied')

    cloud.controls.fault = 'commit:push_ops'; cloud.controls.session = 'alpha'
    await a.clock.advance(60_001)
    await a.service.schedule.settle()
    await command(a, { type: 'create', title: 'One upload after lost reply', horizon: 'day' }); await a.service.handle({ type: 'retry' })
    await a.service.schedule.settle()
    const unknown = sql(alpha, "SELECT opId,payloadHash FROM sync_ops WHERE state='send_unknown'")
    assert(unknown.length, JSON.stringify({ status: a.status, sends: sql(alpha, 'SELECT opId,state FROM sync_ops'), requests: cloud.requests.slice(-10) }))
    await close(a); cloud.controls.fault = ''; cloud.controls.session = ''
    a = await open(alpha, 'alpha'); await a.clock.advance(60_001); await settle(a, b)
    assert.equal(a.status.pending, 0); assert.equal(a.signIns, 0)
    assert.equal(tasks(beta).filter(row => row.title === 'One upload after lost reply').length, 1)
    for (const row of unknown) assert.equal(sql(alpha, `SELECT payloadHash FROM sync_ops WHERE opId='${row.opId}'`)[0]?.payloadHash, row.payloadHash)
    check('Automatic restoration resolves an unknown send with its original identity/hash and no duplicate task')

    const legacy = join(root, 'legacy'); await seedLocal(legacy, 'legacy', 0, cloud)
    let c = await open(legacy, 'legacy', true, false); await login(c)
    const old = await readFile(join(legacy, 'sync-vault.bin')), oldDevice = c.service.secrets.deviceId
    await close(c); c = await open(legacy, 'legacy')
    assert.equal(c.status.phase, 'ready'); assert.equal(c.signIns, 0); assert.equal(c.service.secrets.deviceId, oldDevice)
    assert.deepEqual(await readFile(join(legacy, 'sync-vault.bin')), old)
    await readFile(join(legacy, 'sync-session.bin'))
    check('An upgrade migrates a readable legacy session without login and preserves the original ciphertext and device')
    await close(c)

    const recovered = join(root, 'recovered'); await seedLocal(recovered, 'recovered', 0, cloud)
    c = await open(recovered, 'recovered', false, false); await login(c)
    const recoveryDevice = c.service.secrets.deviceId
    await close(c); c = await open(recovered, 'recovered')
    await login(c); assert.equal(c.service.secrets.deviceId, recoveryDevice)
    assert.equal(c.status.credentialStorage, undefined)
    await close(c); c = await open(recovered, 'recovered')
    assert.equal(c.status.phase, 'ready'); assert.equal(c.signIns, 0); assert.equal(c.service.secrets.deviceId, recoveryDevice)
    check('Password-only recovery promotes to protected automatic restoration after one successful login/password proof')

    const racing = join(root, 'racing'); await seedLocal(racing, 'racing', 0, cloud)
    let d = await open(racing, 'racing', false); await login(d)
    d.allowed = true
    let releaseSave!: () => void, notifySaved!: () => void
    const savedSignal = new Promise<void>(resolve => { notifySaved = resolve })
    const pause = new Promise<void>(resolve => { releaseSave = resolve })
    const save = d.service.passwordVault.save.bind(d.service.passwordVault)
    d.service.passwordVault.save = async (value: unknown) => { await save(value); notifySaved(); await pause }
    const late = d.service.keepSession({ refresh_token: 'racing-rotated', user: { id: d.service.secrets.userId } })
    await savedSignal
    await d.service.handle({ type: 'sign-out' }); assert.equal(d.status.phase, 'signed-out')
    releaseSave(); await late
    await assert.rejects(readFile(join(racing, 'sync-session.bin')), { code: 'ENOENT' })
    await close(d); d = await open(racing, 'racing')
    assert.equal(d.status.phase, 'signed-out'); assert.equal(d.signIns, 0)
    check('A token save already in flight cannot promote a password vault or reactivate a completed logout')
    await close(d)

    const saved = await readFile(join(recovered, 'sync-session.bin'))
    await close(c); c = await open(recovered, 'recovered', false)
    assert.equal(c.signIns, 0); assert.deepEqual(await readFile(join(recovered, 'sync-session.bin')), saved)
    c.allowed = true; await c.service.resume()
    assert.equal(c.status.phase, 'ready'); assert.equal(c.signIns, 0)
    check('Temporary OS denial preserves ciphertext and silently resumes when access returns')

    await c.service.handle({ type: 'sign-out', clearLocal: true })
    assert.equal(c.status.phase, 'signed-out'); assert.equal(c.status.error, null)
    await assert.rejects(readFile(join(recovered, 'sync-session.bin')), { code: 'ENOENT' })
    await close(c); c = await open(recovered, 'recovered')
    assert.equal(c.status.phase, 'signed-out'); assert.deepEqual(tasks(recovered), [])
    check('Explicit local cleanup removes the new session and cannot restore it on restart')
    report.ok = true
  } catch (error) { report.error = (error as Error).stack; throw error }
  finally {
    for (const peer of [...peers]) await close(peer).catch(() => {})
    await cloud.close(); await rm(root, { recursive: true, force: true })
    await writeFile(join(out, 'resume.json'), JSON.stringify(report, null, 2))
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
