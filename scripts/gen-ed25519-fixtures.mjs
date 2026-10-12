/**
 * Prints the Ed25519 fixtures embedded in supabase/tests/0001_core.test.sql.
 * Hosted Supabase does not grant postgres pgsodium.crypto_sign_new_keypair.
 * Verification stays in public._ed25519_verify (pgsodium.crypto_sign_verify_detached).
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'

const seed = new Uint8Array(32).fill(0x42)
const pub = ed25519.getPublicKey(seed)
const nonce = '42'.repeat(32)
const rosterHash = 'cd'.repeat(32)
const workspace = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const device = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const recoveryMessage = `goalloom/recover/v1|${workspace}|${device}|${nonce}|${rosterHash}`
const fixtureMessage = 'goalloom/ed25519-fixture/v1'

function hex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

const rosterCanonical = '{"devices":[{"boxPub":"aa","id":"dev","signPub":"bb"}],"epoch":1,"prevHash":null,"recoveryBoxPub":"cc","recoverySignPub":"dd","version":1,"workspaceId":"11111111-1111-4111-8111-111111111111"}'
const rosterDigest = sha256(new TextEncoder().encode(`goalloom/roster/v1|${rosterCanonical}`))
const fixtureSig = ed25519.sign(new TextEncoder().encode(fixtureMessage), seed)
const recoverySig = ed25519.sign(new TextEncoder().encode(recoveryMessage), seed)
const rosterSig = ed25519.sign(rosterDigest, seed)
if (!ed25519.verify(fixtureSig, new TextEncoder().encode(fixtureMessage), pub)) throw new Error('fixture signature does not verify')
if (!ed25519.verify(recoverySig, new TextEncoder().encode(recoveryMessage), pub)) throw new Error('recovery signature does not verify')
if (!ed25519.verify(rosterSig, rosterDigest, pub)) throw new Error('roster signature does not verify')

const expectedPub = '2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12'
const expectedFixture = '1b7e33e90d42931eee096472cdd462eaca2128375857134671acae886fa12ec804b26b5633f730b1045917702da9ec5446b068c1783196a0907b2c7a057fe10e'
const expectedRecovery = '947f9078028932189c32ee444dbc8a81f9297946bb1acca82e80f70cb19aa05084370b8258408c81349dcbc98fd633be5ce369cef2c339ef7a45be03ea3ec60c'
const expectedRoster = '0a92e4dedfc06749fcd95129ef6f54f20a9e72b5de577b7d57d9cddcb1e0a95449cb5a42c924b88d12fe0e09534de40730eae92259d3f30bc302d43ef098a30d'
if (hex(pub) !== expectedPub || hex(fixtureSig) !== expectedFixture || hex(recoverySig) !== expectedRecovery || hex(rosterSig) !== expectedRoster) {
  throw new Error('committed pgTAP constants drifted; update supabase/tests/0001_core.test.sql')
}

console.log(`pub ${hex(pub)}`)
console.log(`fixture ${hex(fixtureSig)}`)
console.log(`recovery ${hex(recoverySig)}`)
console.log(`roster ${hex(rosterSig)}`)
console.log(`nonce ${nonce}`)
console.log(`rosterHash ${rosterHash}`)
