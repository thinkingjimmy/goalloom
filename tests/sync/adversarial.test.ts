import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { expect, it } from 'vitest'
import { canonicalJson } from '@goalloom/contracts'
import {
  acceptNewerCheckpoint, checkpointHash, counterRandom, deriveRecovery, generateRecoveryMnemonic, hex,
  rosterHash, rosterWrapTargets, signCheckpoint, unwrap, verifyRecoveryJoin, wipeRecovery, wrap, type RosterBody,
} from '@goalloom/crypto'
import { exportCanonicalSnapshot, installCanonicalSnapshot, projectionHash } from '@goalloom/store-core'
import { applyPushReceipts, rejectMissingKey, rejectUnknownFormat } from '@goalloom/sync'
import { at, openSync, seedItem } from './fixture'

const utf8 = (value: string) => new TextEncoder().encode(value)
const ws = '11111111-1111-4111-8111-111111111111'

it('case 1 a lost response and a compacted op retry keep the original seq', () => {
  const pending = [{ opId: '11111111-1111-4111-8111-111111111111', payloadHash: 'ab'.repeat(32) }]
  const receipt = { opId: pending[0]!.opId, payloadHash: pending[0]!.payloadHash, seq: 7, duplicate: true }
  expect(applyPushReceipts(pending, [receipt])).toEqual([{ opId: receipt.opId, seq: 7 }])
  expect(applyPushReceipts(pending, [receipt])).toEqual([{ opId: receipt.opId, seq: 7 }])
  expect(() => applyPushReceipts(pending, [{ ...receipt, payloadHash: 'cd'.repeat(32) }])).toThrow(/op_id_reused/)
})

it('case 5 rotates a recovery envelope without the phrase', () => {
  const phrase = generateRecoveryMnemonic()
  const recovery = deriveRecovery(phrase, ws)
  const sender = ed25519.utils.randomSecretKey()
  const envelope = wrap({
    senderId: 'dev', signSk: sender, recipientId: 'recovery', recipientBoxPub: recovery.boxPub,
    ctx: `wk|${ws}|2`, plaintext: utf8('next-wk'), random: counterRandom(new Uint8Array(32).fill(9)),
  })
  const opened = unwrap(envelope, { expectedCtx: `wk|${ws}|2`, recipientId: 'recovery', boxSk: recovery.boxSk, senderSignPub: ed25519.getPublicKey(sender) })
  expect(new TextDecoder().decode(opened)).toBe('next-wk')
  wipeRecovery(recovery)
})

it('case 6 does not wrap to an injected public key', () => {
  const sender = ed25519.utils.randomSecretKey()
  const listed = x25519.utils.randomSecretKey()
  const injected = x25519.utils.randomSecretKey()
  const roster: RosterBody = {
    workspaceId: ws, version: 1, epoch: 1, prevHash: null,
    devices: [{ id: 'dev', signPub: hex(ed25519.getPublicKey(sender)), boxPub: hex(x25519.getPublicKey(listed)) }],
    recoverySignPub: hex(ed25519.getPublicKey(sender)), recoveryBoxPub: hex(x25519.getPublicKey(listed)),
  }
  expect(rosterWrapTargets(roster)).toEqual(['dev', 'recovery'])
  expect(rosterWrapTargets(roster)).not.toContain(hex(x25519.getPublicKey(injected)))
  const envelope = wrap({
    senderId: 'dev', signSk: sender, recipientId: 'dev', recipientBoxPub: x25519.getPublicKey(listed),
    ctx: `wk|${ws}|1`, plaintext: utf8('wk'), random: counterRandom(new Uint8Array(32).fill(4)),
  })
  expect(() => unwrap(envelope, {
    expectedCtx: `wk|${ws}|1`, recipientId: 'dev', boxSk: listed, senderSignPub: ed25519.getPublicKey(ed25519.utils.randomSecretKey()),
  })).toThrow()
})

it('case 7 installs a snapshot without changing generation', () => {
  const source = openSync()
  source.driver.prepare('UPDATE workspace SET generation=? WHERE id=1').run(ws)
  source.driver.prepare('UPDATE base_workspace SET generation=? WHERE id=1').run(ws)
  source.driver.prepare('UPDATE sync_state SET workspaceId=?, lastAppliedSeq=4').run(ws)
  seedItem(source.driver, 'base', 'kept', '保留', null)
  const body = exportCanonicalSnapshot(source.driver, { workspaceId: ws, uptoSeq: 4, keyEpoch: 1 })
  const target = openSync()
  const minted = String(target.driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation)
  installCanonicalSnapshot(target.driver, body, at)
  expect(String(target.driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation)).toBe(ws)
  expect(minted).not.toBe(ws)
  expect(target.driver.prepare('SELECT title FROM base_items').get()).toEqual({ title: '保留' })
  expect(projectionHash(target.driver, 'base')).toBe(projectionHash(source.driver, 'base'))
  source.db.close(); target.db.close()
})

it('case 8 pauses on an unknown format or a missing key and leaves local rows', () => {
  const unknown = openSync()
  seedItem(unknown.driver, 'visible', 'local', '本地', null)
  expect(() => rejectUnknownFormat(unknown.driver, 2, at)).toThrow(/unsupported_version/)
  expect(unknown.driver.prepare('SELECT paused FROM sync_state').get()?.paused).toBe('unsupported_version')
  expect(unknown.driver.prepare("SELECT title FROM items WHERE id='local'").get()?.title).toBe('本地')
  const missing = openSync()
  seedItem(missing.driver, 'visible', 'local', '本地', null)
  expect(() => rejectMissingKey(missing.driver, false, at)).toThrow(/key_missing/)
  expect(missing.driver.prepare('SELECT paused FROM sync_state').get()?.paused).toBe('key_missing')
  expect(missing.driver.prepare('SELECT count(*) AS n FROM items').get()?.n).toBe(1)
  unknown.db.close(); missing.db.close()
})

it('case 15 rejects a roster whose fingerprint or recovery key does not match the QR anchor', () => {
  const sender = ed25519.utils.randomSecretKey()
  const signPub = hex(ed25519.getPublicKey(sender))
  const boxPub = hex(x25519.getPublicKey(x25519.utils.randomSecretKey()))
  const head: RosterBody = {
    workspaceId: ws, version: 1, epoch: 1, prevHash: null,
    devices: [{ id: 'dev', signPub, boxPub }], recoverySignPub: signPub, recoveryBoxPub: boxPub,
  }
  const anchor = { workspaceId: ws, epoch: 1, rosterVersion: 1, rosterHash: rosterHash(head), approverDeviceId: 'dev', approverSignPub: signPub }
  const forged: RosterBody = { ...head, devices: [{ id: 'dev', signPub: hex(ed25519.getPublicKey(ed25519.utils.randomSecretKey())), boxPub }] }
  expect(rosterHash(forged)).not.toBe(anchor.rosterHash)
  const phrase = generateRecoveryMnemonic()
  const secrets = deriveRecovery(phrase, ws)
  const roster = { ...head, recoverySignPub: hex(secrets.signPub), recoveryBoxPub: hex(secrets.boxPub) }
  const checkpoint = {
    workspaceId: ws, cpVersion: 1, rosterVersion: 1, rosterHash: rosterHash(roster), epoch: 1,
    recoverySignPub: hex(secrets.signPub), recoveryBoxPub: hex(secrets.boxPub), prevCpHash: null,
  }
  const copied = { ...roster, devices: [{ id: 'evil', signPub: forged.devices[0]!.signPub, boxPub }] }
  const copiedCp = { ...checkpoint, rosterHash: rosterHash(copied) }
  expect(() => verifyRecoveryJoin({
    mnemonic: phrase, workspaceId: ws, checkpoint: copiedCp, recSig: signCheckpoint(copiedCp, secrets.signSk),
    devSig: signCheckpoint(copiedCp, sender), roster: copied,
  })).toThrow()
  wipeRecovery(secrets)
})

it('case 21 accepts a regenerated phrase and rejects rollback, forks and cross-workspace replay', () => {
  const oldPhrase = generateRecoveryMnemonic()
  const newPhrase = generateRecoveryMnemonic()
  const oldKeys = deriveRecovery(oldPhrase, ws)
  const newKeys = deriveRecovery(newPhrase, ws)
  const device = ed25519.utils.randomSecretKey()
  const devicePub = hex(ed25519.getPublicKey(device))
  const boxPub = hex(x25519.getPublicKey(x25519.utils.randomSecretKey()))
  const roster1: RosterBody = {
    workspaceId: ws, version: 1, epoch: 1, prevHash: null,
    devices: [{ id: 'dev', signPub: devicePub, boxPub }],
    recoverySignPub: hex(oldKeys.signPub), recoveryBoxPub: hex(oldKeys.boxPub),
  }
  const cp1 = {
    workspaceId: ws, cpVersion: 1, rosterVersion: 1, rosterHash: rosterHash(roster1), epoch: 1,
    recoverySignPub: hex(oldKeys.signPub), recoveryBoxPub: hex(oldKeys.boxPub), prevCpHash: null,
  }
  verifyRecoveryJoin({
    mnemonic: oldPhrase, workspaceId: ws, checkpoint: cp1, recSig: signCheckpoint(cp1, oldKeys.signSk),
    devSig: signCheckpoint(cp1, device), roster: roster1,
  })
  const roster2: RosterBody = { ...roster1, version: 2, prevHash: rosterHash(roster1), epoch: 2, recoverySignPub: hex(newKeys.signPub), recoveryBoxPub: hex(newKeys.boxPub) }
  const cp2 = {
    workspaceId: ws, cpVersion: 2, rosterVersion: 2, rosterHash: rosterHash(roster2), epoch: 2,
    recoverySignPub: hex(newKeys.signPub), recoveryBoxPub: hex(newKeys.boxPub), prevCpHash: checkpointHash(cp1),
  }
  verifyRecoveryJoin({
    mnemonic: newPhrase, workspaceId: ws, checkpoint: cp2, recSig: signCheckpoint(cp2, newKeys.signSk),
    devSig: signCheckpoint(cp2, device), roster: roster2,
  })
  expect(() => verifyRecoveryJoin({
    mnemonic: oldPhrase, workspaceId: ws, checkpoint: cp2, recSig: signCheckpoint(cp2, oldKeys.signSk),
    devSig: signCheckpoint(cp2, device), roster: roster2,
  })).toThrow()
  expect(() => acceptNewerCheckpoint(cp2, cp1)).toThrow(/rollback/)
  expect(() => acceptNewerCheckpoint(cp1, { ...cp2, prevCpHash: '00'.repeat(32) })).toThrow(/fork/)
  expect(() => acceptNewerCheckpoint(cp1, cp2)).not.toThrow()
  expect(() => acceptNewerCheckpoint(cp1, { ...cp2, cpVersion: 3, prevCpHash: checkpointHash(cp2) })).toThrow(/gap/)
  expect(() => verifyRecoveryJoin({
    mnemonic: newPhrase, workspaceId: '22222222-2222-4222-8222-222222222222', checkpoint: cp2,
    recSig: signCheckpoint(cp2, newKeys.signSk), devSig: signCheckpoint(cp2, device), roster: roster2,
  })).toThrow()
  wipeRecovery(oldKeys); wipeRecovery(newKeys)
})

it('canonical JSON sorts keys and drops undefined', () => {
  expect(canonicalJson({ b: 1, a: { d: true, c: undefined } })).toBe('{"a":{"d":true},"b":1}')
})
