/**
 * [INPUT]: Existing real-service peer lifecycle, isolated profiles and signed encrypted HTTP cloud.
 * [OUTPUT]: Prepared-key/CAS failure, original-request restart and sanitized backup evidence.
 * [POS]: Password-security owning E2E extension; failure matrix precedes runtime wiring in the reviewed epoch plan.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { canonicalJson } from '@goalloom/contracts'
import { hex, rosterHash, signRoster, systemRandom, unhex, utf8, wrap } from '@goalloom/crypto'
import { SyncFailure } from '@goalloom/sync'
import { createCloud } from '../sync-cost/cloud'
import { command, password, seedLocal, settle, sql, tasks } from '../sync-join/peer'

export async function verifyEpochCustody(root: string, out: string, open: (profile: string, name: string, denied?: boolean) => Promise<any>, close: (peer: any) => Promise<void>, signIn: (peer: any) => Promise<void>): Promise<string[]> {
  const cloud = await createCloud(), profile = join(root, 'epoch-owner'), peerProfile = join(root, 'epoch-peer'), checks: string[] = []
  let a: any, b: any
  try {
    await seedLocal(profile, 'epoch-owner', 0, cloud); await seedLocal(peerProfile, 'epoch-peer', 0, cloud)
    a = await open(profile, 'epoch-owner'); await a.service.handle({ type: 'sign-in', provider: 'google' })
    assert.equal(a.status.phase, 'setup'); await a.service.handle({ type: 'create', password }); await settle(a)
    b = await open(peerProfile, 'epoch-peer', false); await signIn(b); await settle(a, b)
    await command(a, { type: 'create', title: 'Epoch proof preserves local history', horizon: 'day' }); await settle(a, b)
    const preserved = canonicalJson(sql(profile, 'SELECT * FROM operations ORDER BY id')), oldBinding = a.service.activeBinding
    const passwordPath = a.service.passwordVault.path, passwordBefore = JSON.parse((await readFile(passwordPath)).toString())
    const rotate = () => {
      const ws = cloud.world.workspace!, previous = ws.rosters.at(-1)!.roster, signer = a.service.secrets, key = randomBytes(32)
      const roster = { ...previous, version: previous.version + 1, epoch: previous.epoch + 1, prevHash: rosterHash(previous) }
      ws.rosters.push({ version: roster.version, roster, bodyHash: rosterHash(roster), signature: hex(signRoster(roster, signer.signSk)), signerType: 'device', signerDevice: signer.deviceId })
      ws.rosterVersion = roster.version; ws.keyEpoch = roster.epoch
      for (const recipient of [...roster.devices.map(row => ({ id: row.id, boxPub: row.boxPub })), { id: 'recovery', boxPub: roster.recoveryBoxPub }]) {
        const envelope = wrap({ senderId: signer.deviceId, signSk: signer.signSk, recipientId: recipient.id, recipientBoxPub: unhex(recipient.boxPub), ctx: `wk|${ws.id}|${roster.epoch}`, plaintext: key, random: systemRandom() })
        ws.envelopes.push({ epoch: roster.epoch, recipient: recipient.id, ciphertext: hex(utf8(JSON.stringify(envelope))), signature: envelope.sig, rosterVersion: roster.version, signerDevice: signer.deviceId })
      }
      return roster
    }
    const roster = rotate()
    const journal = a.service.bindingJournal, journalBefore = await readFile(journal.path), prepare = journal.prepareEpoch.bind(journal)
    journal.prepareEpoch = async () => { throw Error('Synthetic protected preparation failure') }
    await assert.rejects(a.service.followRoster()); journal.prepareEpoch = prepare
    assert.deepEqual(await readFile(journal.path), journalBefore)
    assert.equal(sql(profile, 'SELECT count(*) AS n FROM sync_binding_epoch_receipts')[0]!.n, 0)
    assert.equal(a.service.secrets.epoch, oldBinding.keyEpoch)
    checks.push('Epoch preparation failure changes neither SQL identity nor keys/journal; no unprotected new-epoch transport is admitted')

    const save = a.service.passwordVault.save.bind(a.service.passwordVault)
    a.service.passwordVault.save = async () => { throw Error('Synthetic password promotion failure') }
    await assert.rejects(a.service.followRoster()); a.service.passwordVault.save = save
    const prepared = await journal.pendingEpoch(oldBinding.accountId, oldBinding.workspaceId), receipt = sql(profile, 'SELECT * FROM sync_binding_epoch_receipts')[0]!
    assert(prepared); assert.equal(receipt.requestId, prepared.requestId)
    assert.equal(a.service.secrets.epoch, oldBinding.keyEpoch); assert.equal(a.service.activeBinding.keyEpoch, oldBinding.keyEpoch)
    assert.equal(JSON.parse((await readFile(passwordPath)).toString()).body, passwordBefore.body)
    const originalReceipt = canonicalJson(receipt)
    await close(a); a = await open(profile, 'epoch-owner'); await signIn(a); await settle(a)
    assert.equal(a.service.secrets.epoch, roster.epoch); assert.equal(a.service.activeBinding.bindingToken, oldBinding.bindingToken)
    assert.equal(canonicalJson(sql(profile, 'SELECT * FROM sync_binding_epoch_receipts')[0]), originalReceipt)
    assert.equal(canonicalJson(sql(profile, 'SELECT * FROM operations ORDER BY id')), preserved)
    const passwordAfter = JSON.parse((await readFile(passwordPath)).toString())
    assert.deepEqual(passwordAfter.kdf, passwordBefore.kdf); assert.equal(passwordAfter.lock, passwordBefore.lock)
    checks.push('Committed epoch SQL with failed password promotion restarts from the same protected request/receipt and original password lock; local history/token remain unchanged')

    const call = b.storage.call.bind(b.storage), requests: string[] = []
    b.storage.call = async (method: string, argument: any) => {
      const result = await call(method, argument)
      if (method === 'sync' && argument?.type === 'epoch-advance') { requests.push(argument.proof.requestId); throw Error('Synthetic lost committed epoch reply') }
      return result
    }
    await b.service.followRoster(); b.storage.call = call
    assert.equal(requests.length, 1); assert.equal(b.service.activeBinding.keyEpoch, roster.epoch)
    assert.equal(sql(peerProfile, 'SELECT requestId FROM sync_binding_epoch_receipts')[0]!.requestId, requests[0])
    await b.service.handle({ type: 'retry' }); await settle(a, b)
    await command(b, { type: 'create', title: 'New epoch remains usable', horizon: 'day' }); await settle(a, b)
    assert(tasks(profile).some(row => row.title === 'New epoch remains usable'))
    checks.push('A lost committed epoch reply is resolved with its original request; native-custody peers keep full guards and exchange real new-epoch operations')

    const nextRoster = rotate(), previousRuntimeEpoch = b.service.secrets.epoch, turn = new AbortController()
    const epochJournal = b.service.bindingJournal, remember = epochJournal.remember.bind(epochJournal)
    let notify!: () => void, release!: () => void
    const renamed = new Promise<void>(resolve => { notify = resolve }), held = new Promise<void>(resolve => { release = resolve })
    epochJournal.remember = async (...args: any[]) => { await remember(...args); notify(); await held }
    b.service.turnSignal = turn.signal
    const advancing = b.service.followRoster()
    await renamed
    const interrupted = await epochJournal.pendingEpoch(oldBinding.accountId, oldBinding.workspaceId)
    assert(interrupted)
    const committed = canonicalJson(sql(peerProfile, `SELECT * FROM sync_binding_epoch_receipts WHERE requestId='${interrupted.requestId}'`)[0])
    turn.abort(new SyncFailure('timeout')); b.service.turnSignal = null; release()
    await assert.rejects(advancing, (error: any) => error.code === 'timeout')
    assert.equal(b.service.secrets.epoch, previousRuntimeEpoch); assert.equal(b.service.activeBinding.keyEpoch, previousRuntimeEpoch)
    epochJournal.remember = remember
    const read = b.service.readView.bind(b.service), nextTurn = new AbortController()
    let notifyRead!: () => void, releaseRead!: () => void
    const readStarted = new Promise<void>(resolve => { notifyRead = resolve }), heldRead = new Promise<void>(resolve => { releaseRead = resolve })
    b.service.readView = async () => { const view = await read(); notifyRead(); await heldRead; return view }
    const journalBytes = await readFile(epochJournal.path), passwordBytes = await readFile(b.service.passwordVault.path)
    b.service.turnSignal = nextTurn.signal
    const reread = b.service.exchangeOnce(nextTurn.signal)
    await readStarted; nextTurn.abort(new SyncFailure('timeout')); b.service.turnSignal = null; releaseRead()
    await assert.rejects(reread, (error: any) => error.code === 'timeout')
    assert.equal(b.service.secrets.epoch, previousRuntimeEpoch); assert.equal(b.service.activeBinding.keyEpoch, previousRuntimeEpoch)
    assert.deepEqual(await readFile(epochJournal.path), journalBytes); assert.deepEqual(await readFile(b.service.passwordVault.path), passwordBytes)
    assert.equal(canonicalJson(sql(peerProfile, `SELECT * FROM sync_binding_epoch_receipts WHERE requestId='${interrupted.requestId}'`)[0]), committed)
    b.service.readView = read
    await b.service.followRoster()
    assert.equal(b.service.secrets.epoch, nextRoster.epoch)
    assert.equal(canonicalJson(sql(peerProfile, `SELECT * FROM sync_binding_epoch_receipts WHERE requestId='${interrupted.requestId}'`)[0]), committed)
    checks.push('Expired original turns at post-journal promotion and the preceding readView gate cannot advance CAS/custody/runtime after their signal slot clears; the original receipt remains recoverable')

    const currentJournal = a.service.bindingJournal, savedJournal = await readFile(currentJournal.path)
    await currentJournal.file.update((value: any) => ({ ...value, epochAdvances: [] }))
    const missingBytes = await readFile(currentJournal.path)
    await close(a); a = await open(profile, 'epoch-owner')
    await a.service.handle({ type: 'sign-in', provider: 'google' }); await a.service.handle({ type: 'submit-password', password })
    assert.equal(a.status.error, 'storage'); assert.notEqual(a.status.phase, 'ready')
    assert.deepEqual(await readFile(currentJournal.path), missingBytes)
    assert.equal(canonicalJson(sql(profile, 'SELECT * FROM sync_binding_epoch_receipts')[0]), originalReceipt)
    await close(a); await writeFile(currentJournal.path, savedJournal); a = await open(profile, 'epoch-owner'); await signIn(a)
    checks.push('Missing original epoch preparation fails closed without replacing key/journal bytes or rewriting its committed receipt; restoring original evidence permits recovery')

    const generation = (await a.service.local({ type: 'view' })).generation
    const backup = await a.storage.call('data', { type: 'createBackup', generation })
    const record = backup.status.records.find((row: any) => row.kind === 'manual')
    const artifact = join(out, 'epoch-portable.sqlite'); await copyFile(join(profile, 'backups', `${record.id}.sqlite`), artifact)
    const db = new DatabaseSync(artifact, { readOnly: true })
    try { assert.equal(db.prepare('SELECT count(*) AS n FROM sync_binding_epoch_receipts').get()!.n, 0) } finally { db.close() }
    assert(!(await readFile(artifact)).includes(Buffer.from(prepared.contextDigest)))
    checks.push('Actual portable SQLite backup removes internal epoch receipts and protected context digest bytes')
    await writeFile(join(out, 'epoch.json'), JSON.stringify({ ok: true, checks, runtime: await a.storage.call('runtime'), artifact, requestId: prepared.requestId, bindingTokenPreserved: true }, null, 2))
    return checks
  } finally { if (a) await close(a).catch(() => {}); if (b) await close(b).catch(() => {}); await cloud.close() }
}
