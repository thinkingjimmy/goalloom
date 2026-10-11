/**
 * Prints the Ed25519 fixtures embedded in supabase/tests/0001_core.test.sql.
 * Hosted Supabase does not grant postgres pgsodium.crypto_sign_new_keypair.
 * Verification stays in public._ed25519_verify (pgsodium.crypto_sign_verify_detached).
 */
import { ed25519 } from '@noble/curves/ed25519.js'

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

const fixtureSig = ed25519.sign(new TextEncoder().encode(fixtureMessage), seed)
const recoverySig = ed25519.sign(new TextEncoder().encode(recoveryMessage), seed)
if (!ed25519.verify(fixtureSig, new TextEncoder().encode(fixtureMessage), pub)) throw new Error('fixture signature does not verify')
if (!ed25519.verify(recoverySig, new TextEncoder().encode(recoveryMessage), pub)) throw new Error('recovery signature does not verify')

const expectedPub = '2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12'
const expectedFixture = '1b7e33e90d42931eee096472cdd462eaca2128375857134671acae886fa12ec804b26b5633f730b1045917702da9ec5446b068c1783196a0907b2c7a057fe10e'
const expectedRecovery = '947f9078028932189c32ee444dbc8a81f9297946bb1acca82e80f70cb19aa05084370b8258408c81349dcbc98fd633be5ce369cef2c339ef7a45be03ea3ec60c'
if (hex(pub) !== expectedPub || hex(fixtureSig) !== expectedFixture || hex(recoverySig) !== expectedRecovery) {
  throw new Error('committed pgTAP constants drifted; update supabase/tests/0001_core.test.sql')
}

console.log(`pub ${hex(pub)}`)
console.log(`fixture ${hex(fixtureSig)}`)
console.log(`recovery ${hex(recoverySig)}`)
console.log(`nonce ${nonce}`)
console.log(`rosterHash ${rosterHash}`)
