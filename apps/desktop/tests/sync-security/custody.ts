/**
 * [INPUT]: Two authenticated real-service peers, their isolated scoped files and private temporary test paths.
 * [OUTPUT]: Offline account/project/environment isolation, filtered custody and body/lock mismatch evidence.
 * [POS]: Owning password-security integration extension; real crypto/files follow complete service initialization.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { canonicalJson } from '@goalloom/contracts'
import { hex, sha256Hex } from '@goalloom/crypto'
import { PasswordVault } from '../../src/main/sync/password-vault'
import { scopeContext, scopeDirectory, scopeId, type KeyScope } from '../../src/main/sync/key-scope'
import { openLocal } from '../../src/main/sync/sealed-file'
import type { VaultSecrets } from '../../src/main/sync/vault'

export async function verifyScopedCustody(a: any, b: any, directory: string): Promise<string[]> {
  const nativeA = a.service.secrets as VaultSecrets, nativeB = b.service.secrets as VaultSecrets
  const scope = a.service.passwordVault.scope as KeyScope, scopeB = b.service.passwordVault.scope as KeyScope
  assert.notEqual(scope.accountId, scopeB.accountId)
  const masterA = nativeA.bindingJournalKeys![scopeId(scope)]!, masterB = nativeB.bindingJournalKeys![scopeId(scopeB)]!
  assert(!Buffer.from(masterA).equals(masterB))
  const contaminated: VaultSecrets = { ...nativeA, bindingJournalKeys: { ...nativeA.bindingJournalKeys, ...nativeB.bindingJournalKeys }, accounts: { ...nativeA.accounts,
    [scopeB.accountId]: { deviceId: nativeB.deviceId, workspaceKey: nativeB.workspaceKey, workspaceId: nativeB.workspaceId, generation: nativeB.generation, epoch: nativeB.epoch,
      roster: nativeB.roster, recoveryBoxSk: nativeB.recoveryBoxSk, recoverySignSk: nativeB.recoverySignSk } } }
  const before = JSON.parse(await readFile(a.service.passwordVault.path, 'utf8'))
  await a.service.passwordVault.save(contaminated)
  const bytesA = await readFile(a.service.passwordVault.path), file = JSON.parse(bytesA.toString())
  assert.equal(file.lock, before.lock); assert.deepEqual(file.kdf, before.kdf)
  const context = `vault/v2|${scopeContext(scope)}|${file.workspaceId}|lock:${sha256Hex(canonicalJson({ kdf: file.kdf, lock: file.lock }))}`
  const plain = openLocal(nativeA.recoveryBoxSk!, context, Buffer.from(file.body, 'base64')).toString()
  const payload = JSON.parse(plain)
  for (const key of ['accounts', 'refreshToken', 'bindingJournalKey', 'bindingJournalKeys']) assert.equal(Object.hasOwn(payload, key), false)
  assert.equal(payload.journalKey, hex(masterA)); assert(!plain.includes(hex(masterB))); assert(!plain.includes(scopeB.accountId))
  assert(!plain.includes(nativeB.refreshToken!))
  await a.service.bindingJournal.retain(a.service.activeBinding, contaminated)
  const records = await a.service.bindingJournal.file.load()
  const retained = records.contexts.at(-1).vault
  assert(!retained.includes(hex(masterB))); assert(!retained.includes('refreshToken')); assert(!retained.includes('bindingJournalKeys'))
  const malformed = join(directory, 'scope-swap-profiles')
  for (const candidate of [{ ...scope, accountId: scopeB.accountId }, { ...scope, projectRef: 'foreign-project' }, { ...scope, environment: 'production' as const }]) {
    const reader = new PasswordVault(malformed, candidate)
    await mkdir(dirname(reader.path), { recursive: true }); await writeFile(reader.path, bytesA)
    await assert.rejects(reader.identity()); assert.deepEqual(await readFile(reader.path), bytesA)
  }
  const reader = new PasswordVault(join(directory, 'body-lock-swaps'), scope)
  await mkdir(dirname(reader.path), { recursive: true })
  const bytesB = await readFile(b.service.passwordVault.path), other = JSON.parse(bytesB.toString())
  const reject = async (changed: object, workspaceId = file.workspaceId) => {
    const bytes = Buffer.from(JSON.stringify(changed)); await writeFile(reader.path, bytes)
    await assert.rejects(reader.recover(nativeA.recoveryBoxSk!, scope.accountId, workspaceId))
    assert.deepEqual(await readFile(reader.path), bytes)
  }
  await reject({ ...file, kdf: other.kdf, lock: other.lock })
  const wrongWorkspace = randomUUID(); await reject({ ...file, workspaceId: wrongWorkspace }, wrongWorkspace)
  await reject({ ...file, body: Buffer.from('Corrupt authenticated body').toString('base64') })
  const originalA = await readFile(a.service.passwordVault.path)
  await assert.rejects(a.service.passwordVault.save({ ...nativeA, recoveryBoxSk: randomBytes(32) }))
  await assert.rejects(a.service.passwordVault.save({ ...nativeA, workspaceId: randomUUID() }))
  assert.deepEqual(await readFile(a.service.passwordVault.path), originalA)
  const journalB = await readFile(join(scopeDirectory(b.profile, scopeB), 'sync-bindings.bin')), header = Buffer.from('Goalloom scoped binding journal 1\n')
  assert.throws(() => openLocal(masterA, `binding-journal/v2|${scopeContext(scopeB)}`, journalB.subarray(header.length)))
  const journalA = a.service.bindingJournal, nativeReference = a.service.secrets, capture = journalA.file.cipher
  let captured!: () => void
  const barrier = new Promise<void>(resolve => { captured = resolve })
  journalA.file.cipher = () => { const cipher = capture(); captured(); return cipher }
  const reading = journalA.file.load(); await barrier
  a.service.secrets = nativeB
  const actual = await reading
  a.service.secrets = nativeReference; journalA.file.cipher = capture
  assert.deepEqual(actual.scope, scope)
  assert(actual.bindings.every((binding: KeyScope) => binding.accountId === scope.accountId))
  return [
    'Scoped password/retained payloads contain only A’s key/device state even when native custody also holds B; automatic body updates keep the original lock',
    'Account/project/environment, workspace, lock/KDF and ciphertext swaps fail without mutation; A’s recovered master cannot open B’s journal',
    'New recovery key/workspace cannot reuse an old lock; in-flight scoped reads retain the captured account/path/key after active secrets change',
  ]
}
