/**
 * [INPUT]: Production sync/SQLite and a controlled encrypted cloud with denied OS credentials.
 * [OUTPUT]: Repeatable password recovery, account isolation and pending-send evidence.
 * [POS]: No-Keychain sync acceptance; no real accounts, keys or system dialogs.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createCloud } from '../sync-cost/cloud'
import { Clock } from '../sync-cost/clock'
import { cipher, worker } from '../sync-cost/peer'
import { command, password, seedLocal, settle, sql, tasks } from '../sync-join/peer'
import { SyncService } from '../../src/main/sync/service'
import { SyncVault } from '../../src/main/sync/vault'
import { CredentialError } from '../../src/main/smart/credentials'

async function main() {
  const out = resolve('output/tests/sync-security'), root = await mkdtemp(join(tmpdir(), 'goalloom-password-sync-'))
  await mkdir(out, { recursive: true })
  const cloud = await createCloud(), peers: any[] = []
  const report: any = { ok: false, checks: [], runtime: { electron: process.versions.electron, node: process.versions.node },
    host: { os: release(), arch: arch(), cpu: cpus()[0]?.model },
    scope: 'Production service/SDK/SQLite; synthetic denied OS cipher and encrypted HTTP. No real Google or packaged keychain acceptance.' }
  const check = (label: string) => { report.checks.push(label); console.log(`PASS ${label}`) }
  async function open(profile: string, name: string, denied = true) {
    const storage = await worker(profile), clock = new Clock()
    const peer: any = { profile, storage, clock, name, denied, signIns: 0, status: null, keys: new Map() }
    peer.service = new SyncService({ userData: profile, storage, clock, random: () => 1,
      cipher: { available: () => !peer.denied, encrypt: text => { assert(!peer.denied); return cipher.encrypt(text) },
        decrypt: bytes => { assert(!peer.denied); return cipher.decrypt(bytes) } },
      openExternal: async () => {}, notify: status => { peer.status = status }, onApplied: () => {}, clipboard: () => {}, now: () => new Date().toISOString(),
      onSettings: async () => [],
      beginSignIn: async client => { peer.signIns++; return (await client.auth.refreshSession({ refresh_token: peer.name })).data.session! },
      readSecret: async key => peer.keys.get(key),
      applySecret: async (key, value) => { if (peer.denied) throw new CredentialError('unavailable'); peer.keys.set(key, value) },
    })
    peers.push(peer); await peer.service.start(); return peer
  }
  async function close(peer: any) { peer.service.stop(); await peer.service.schedule.settle(); await peer.storage.close(); peers.splice(peers.indexOf(peer), 1) }
  async function signIn(peer: any, value = password) {
    const before = peer.signIns
    await peer.service.handle({ type: 'sign-in', provider: 'google' })
    assert.equal(peer.signIns, before + 1, 'Explicit sign-in must reach Google authorization')
    assert.equal(peer.status.phase, 'enter-key', JSON.stringify(peer.status))
    await peer.service.handle({ type: 'submit-password', password: value }); await settle(peer)
    assert.equal(peer.status.phase, 'ready', JSON.stringify(peer.status)); assert.equal(peer.status.error, null)
  }
  try {
    const fresh = join(root, 'fresh')
    await seedLocal(fresh, 'fresh', 1, cloud)
    let c = await open(fresh, 'other-fresh')
    await c.service.handle({ type: 'sign-in', provider: 'google' }); assert.equal(c.status.phase, 'setup')
    await mkdir(join(fresh, 'sync-password.bin.tmp'))
    await c.service.handle({ type: 'create', password }); assert.equal(c.status.error, 'storage')
    assert.equal(cloud.worlds.get('22222222-2222-4222-8222-222222222222')!.workspaces.size, 0)
    await rm(join(fresh, 'sync-password.bin.tmp'), { recursive: true })
    cloud.controls.fault = 'missing:bootstrap_workspace'; cloud.controls.session = 'other-fresh'
    await c.service.handle({ type: 'create', password }); assert(c.status.error)
    const draft = c.service.secrets.workspaceId
    await close(c); cloud.controls.fault = ''; cloud.controls.session = ''
    c = await open(fresh, 'other-fresh')
    await c.service.handle({ type: 'sign-in', provider: 'google' }); assert.equal(c.status.phase, 'enter-key', JSON.stringify(c.status))
    await c.service.handle({ type: 'submit-password', password }); assert.equal(c.status.phase, 'setup', JSON.stringify(c.status))
    await c.service.handle({ type: 'create', password }); await settle(c)
    assert.equal(c.status.phase, 'ready'); assert.equal(c.service.secrets.workspaceId, draft); assert.equal(tasks(fresh).length, 1)
    check('Failed protected writes leave cloud untouched; interrupted first creation resumes the same encrypted draft after restart')

    cloud.controls.fault = 'commit:create_new_workspace'; cloud.controls.session = 'other-fresh'
    await c.service.handle({ type: 'create-new-workspace', password: 'new-workspace-password' })
    assert.equal(c.status.error, 'network')
    const recoveryDraft = c.service.secrets.pendingRecovery.workspaceId
    await close(c); cloud.controls.fault = ''; cloud.controls.session = ''
    c = await open(fresh, 'other-fresh'); await signIn(c, 'new-workspace-password')
    await c.service.handle({ type: 'create-new-workspace', password: 'new-workspace-password' }); await settle(c)
    assert.equal(c.status.phase, 'ready'); assert.equal(c.service.secrets.workspaceId, recoveryDraft)
    assert.equal(cloud.worlds.get('22222222-2222-4222-8222-222222222222')!.workspaces.size, 2)
    check('Password-mode recovery reuses a committed creation draft after a lost response and preserves the old workspace')
    await close(c)

    const alpha = join(root, 'alpha'), beta = join(root, 'beta'), legacy = join(root, 'legacy')
    await seedLocal(alpha, 'alpha', 4, cloud); await seedLocal(beta, 'beta', 0, cloud); await seedLocal(legacy, 'legacy', 0, cloud)
    const opaque = Buffer.from('Synthetic inaccessible old OS ciphertext')
    await writeFile(join(alpha, 'sync-vault.bin'), opaque)
    let b = await open(beta, 'beta'), a = await open(alpha, 'alpha')
    await b.service.handle({ type: 'sign-in', provider: 'google' }); assert.equal(b.signIns, 1)
    assert.equal(b.status.phase, 'setup')
    await b.service.handle({ type: 'create', password }); await settle(b)
    assert.equal(b.status.phase, 'ready', JSON.stringify(b.status)); assert.equal(b.status.error, null)
    const original = tasks(alpha)
    await a.service.handle({ type: 'sign-out' }); await a.service.handle({ type: 'sign-in', provider: 'google' })
    assert.equal(a.signIns, 1); assert.equal(a.status.phase, 'enter-key')
    const saved = await readFile(join(alpha, 'sync-vault.bin'))
    await a.service.handle({ type: 'submit-password', password: 'incorrect-password' })
    assert.equal(a.status.error, 'password'); assert.deepEqual(tasks(alpha), original)
    assert.deepEqual(await readFile(join(alpha, 'sync-vault.bin')), saved)
    await a.service.handle({ type: 'submit-password', password }); await settle(a, b)
    assert.equal(a.status.phase, 'ready', JSON.stringify(a.status)); assert.equal(a.status.error, null)
    assert.deepEqual(tasks(beta), original)
    assert.deepEqual(await readFile(join(alpha, 'sync-vault.bin')), saved)
    report.runtime.sqlite = (await a.storage.call('runtime')).sqlite
    check('Case 1 works with OS access denied on both devices; wrong passwords and recovery preserve legacy ciphertext and tasks')

    const device = a.service.secrets.deviceId, count = cloud.world.devices.size
    await a.service.handle({ type: 'sign-out' })
    await command(b, { type: 'delete', itemId: original[0]!.id, expectedVersion: Number(sql(beta, `SELECT version FROM items WHERE id='${original[0]!.id}'`)[0]!.version) }); await settle(b)
    await close(a); a = await open(alpha, 'alpha')
    assert.equal(a.status.phase, 'signed-out'); assert.equal(a.signIns, 0)
    await signIn(a); await settle(a, b)
    assert.equal(a.service.secrets.deviceId, device); assert.equal(cloud.world.devices.size, count)
    assert.deepEqual(tasks(alpha), tasks(beta)); assert(tasks(alpha)[0]!.deletedAt)
    check('Restart requires explicit authorization/password and reuses device identity without duplicate imports or deleted-task resurrection')

    await a.service.handle({ type: 'sign-out' }); a.name = 'other-alpha'
    const beforeSwitch = cloud.requests.length
    await a.service.handle({ type: 'sign-in', provider: 'google' })
    assert.equal(a.status.error, 'mismatch'); assert.equal(a.status.phase, 'signed-out')
    assert(!cloud.requests.slice(beforeSwitch).some(row => ['register_device', 'push_ops', 'bootstrap_workspace'].includes(row.rpc)))
    a.name = 'alpha'; await signIn(a)
    check('The authenticated account must own the existing workspace before device registration or upload')

    cloud.controls.fault = 'commit:push_ops'; cloud.controls.session = 'alpha'
    await command(a, { type: 'create', title: 'Preserve an unknown send', horizon: 'day' }); await a.service.handle({ type: 'retry' })
    assert(sql(alpha, "SELECT opId FROM sync_ops WHERE state='send_unknown'").length > 0)
    const unknown = sql(alpha, "SELECT opId,payloadHash FROM sync_ops WHERE state='send_unknown'")
    await close(a); cloud.controls.fault = ''; cloud.controls.session = ''
    a = await open(alpha, 'alpha'); await signIn(a); await settle(a, b)
    assert.equal(a.status.pending, 0); assert.equal(a.service.secrets.deviceId, device)
    assert.equal(tasks(beta).filter(row => row.title === 'Preserve an unknown send').length, 1)
    for (const row of unknown) assert.equal(sql(alpha, `SELECT payloadHash FROM sync_ops WHERE opId='${row.opId}'`)[0]?.payloadHash, row.payloadHash)
    check('Encrypted prepared sends survive a lost response, denied Keychain access and restart without changing identities or hashes')

    await a.clock.advance(60_001); await settle(a, b)
    await command(a, { type: 'create', title: 'Pending during password change', horizon: 'day' })
    await close(a)
    const changed = 'changed-sync-password'
    await b.service.handle({ type: 'change-password', password: changed }); assert.equal(b.status.error, null)
    a = await open(alpha, 'alpha'); await signIn(a, changed)
    // Restart restores the persisted network cooldown against the new clock.
    await a.clock.advance(60_001); await settle(a, b)
    report.passwordChange = { a: a.status, b: b.status, pending: sql(alpha, "SELECT opId,state FROM sync_ops WHERE origin='local' AND state IN ('never_sent','send_unknown')") }
    assert.equal(a.service.secrets.deviceId, device)
    assert(tasks(beta).some(row => row.title === 'Pending during password change'), JSON.stringify(report.passwordChange))
    await a.service.handle({ type: 'sign-out' }); await signIn(a, changed)
    assert.equal(a.service.secrets.deviceId, device)
    check('A password changed on another device recovers the original local keys and pending work through the verified cloud key')

    let old = await open(legacy, 'legacy', false)
    await old.service.handle({ type: 'sign-in', provider: 'google' }); await old.service.handle({ type: 'submit-password', password: changed }); await settle(old)
    await command(old, { type: 'create', title: 'Legacy offline edit', horizon: 'day' })
    const legacyVault = await readFile(join(legacy, 'sync-vault.bin'))
    await close(old); old = await open(legacy, 'legacy', true)
    await signIn(old, changed); await settle(old, b)
    assert(tasks(beta).some(row => row.title === 'Legacy offline edit'))
    assert.deepEqual(await readFile(join(legacy, 'sync-vault.bin')), legacyVault)
    check('A previously bound OS-vault device recovers into the same workspace and retains unsent local edits')

    b.keys.set('ai.key.openrouter', 'synthetic-private-api-key')
    await b.storage.call('sync', { type: 'emit-settings', entries: [{ key: 'ai.key.openrouter', value: 'synthetic-private-api-key' }],
      at: new Date().toISOString(), opId: crypto.randomUUID(), mode: 'change' })
    await command(b, { type: 'create', title: 'Tasks pass an unavailable AI key store', horizon: 'day' }); await settle(b, a)
    report.aiDelivery = { a: a.status, b: b.status }
    assert.equal(a.status.error, null); assert(tasks(alpha).some(row => row.title === 'Tasks pass an unavailable AI key store'), JSON.stringify(report.aiDelivery))
    assert(!JSON.stringify(sql(alpha, 'SELECT * FROM sync_settings')).includes('synthetic-private-api-key'))
    assert.equal(a.service.secrets.pendingSecrets['ai.key.openrouter'].value, 'synthetic-private-api-key')
    a.denied = false; await settle(a)
    assert.equal(a.keys.get('ai.key.openrouter'), 'synthetic-private-api-key')
    assert.equal(a.service.secrets.pendingSecrets['ai.key.openrouter'], undefined)
    a.denied = true
    check('Denied AI-key storage does not block task sync; a protected deferred copy stays outside SQLite')

    const fallback = await readFile(join(alpha, 'sync-password.bin'))
    assert(!fallback.includes(Buffer.from(changed))); assert(!fallback.includes(Buffer.from('Preserve an unknown send')))
    const bytes = await new SyncVault(legacy, cipher).load()
    assert(bytes, 'The original OS vault remains readable with its original cipher')
    await a.service.handle({ type: 'sign-out', clearLocal: true })
    assert.equal(a.status.phase, 'signed-out'); assert.equal(a.status.error, null)
    await assert.rejects(readFile(join(alpha, 'sync-password.bin')), { code: 'ENOENT' })
    assert.deepEqual(tasks(alpha), [])
    check('Fallback files contain no plaintext secrets and explicit cleanup removes the password vault with local tasks')
    report.ok = true
  } catch (error) { report.error = (error as Error).stack; throw error }
  finally {
    for (const peer of [...peers]) await close(peer).catch(() => {})
    await cloud.close(); await rm(root, { recursive: true, force: true })
    await writeFile(join(out, 'password.json'), JSON.stringify(report, null, 2))
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
