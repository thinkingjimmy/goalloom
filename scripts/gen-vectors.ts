import { writeFileSync } from 'node:fs'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { counterRandom, hex, sealOp, sealSnapshot, unhex, utf8, wrap } from '@goalloom/crypto'
import { uuidv5 } from '@goalloom/crypto'

const xKey = unhex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f')
const xNonce = unhex('404142434445464748494a4b4c4d4e4f5051525354555657')
const xAad = unhex('50515253c0c1c2c3c4c5c6c7')
const xPt = utf8("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.")
const xCt = xchacha20poly1305(xKey, xNonce, xAad).encrypt(xPt)
const seed = unhex('11'.repeat(32))
const signSk = unhex('22'.repeat(32))
const boxSk = unhex('33'.repeat(32))
const signPub = ed25519.getPublicKey(signSk)
const boxPub = x25519.getPublicKey(boxSk)
const ctx = 'wk|ws|1'
const pt = utf8('workspace-key')
const envelope = wrap({ senderId: 'device-a', signSk, recipientId: 'device-b', recipientBoxPub: boxPub, ctx, plaintext: pt, random: counterRandom(seed) })
const opKey = unhex('44'.repeat(32))
const opId = '11111111-1111-4111-8111-111111111111'
const opCt = sealOp({ workspaceKey: opKey, workspaceId: 'ws', opId, epoch: 1, plaintext: utf8('op-body'), random: counterRandom(seed) })
const snapKey = unhex('55'.repeat(32))
const snapPt = utf8('snapshot-body')
const snapCt = sealSnapshot({ workspaceKey: snapKey, workspaceId: 'ws', uptoSeq: 9, epoch: 1, plaintext: snapPt, random: counterRandom(seed) })
const uuid = uuidv5('rollover:item:week:2026-09-21@0:week:2026-09-28', '11111111-1111-4111-8111-111111111111')
const body = {
  xchacha: { key: hex(xKey), nonce: hex(xNonce), aad: hex(xAad), pt: hex(xPt), ct: hex(xCt) },
  c1: { ctx, recipientId: 'device-b', boxSk: hex(boxSk), signPub: hex(signPub), pt: hex(pt), envelope: { ...envelope } },
  op: { key: hex(opKey), workspaceId: 'ws', opId, epoch: 1, pt: hex(utf8('op-body')), ct: hex(opCt) },
  snap: { key: hex(snapKey), workspaceId: 'ws', uptoSeq: 9, epoch: 1, pt: hex(snapPt), ct: hex(snapCt) },
  uuid,
}
writeFileSync('packages/crypto/test/vectors.json', `${JSON.stringify(body, null, 2)}\n`)
console.log('wrote vectors', uuid)
