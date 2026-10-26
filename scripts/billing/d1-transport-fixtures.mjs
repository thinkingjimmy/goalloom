/**
 * [INPUT]: Synthetic transport IDs and the shared canonical JSON protocol.
 * [OUTPUT]: In-memory Ed25519 proofs, opaque bytes and finite RPC payloads.
 * [POS]: Real D1 transport fixture generator; no persistent signing seeds or user content.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {ed25519,x25519} from '@noble/curves/ed25519.js'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
export const bytes=()=>Buffer.from('goalloom-d1-opaque-transport-fixture','utf8')
const hex=value=>Buffer.from(value).toString('hex')
export function transportProof(workspaceId,generation){
 const signSeed=randomBytes(32),recoverySeed=randomBytes(32)
 const keys={signPub:hex(ed25519.getPublicKey(signSeed)),boxPub:hex(x25519.getPublicKey(randomBytes(32))),
  recoverySignPub:hex(ed25519.getPublicKey(recoverySeed)),recoveryBoxPub:hex(x25519.getPublicKey(randomBytes(32)))}
 const signature=(text,seed)=>`\\x${hex(ed25519.sign(Buffer.from(hash(text),'hex'),seed))}`
 return {keys,workspaceArguments(deviceId){
  const roster={workspaceId,version:1,epoch:1,prevHash:null,devices:[{id:deviceId,signPub:keys.signPub,boxPub:keys.boxPub}],
   recoverySignPub:keys.recoverySignPub,recoveryBoxPub:keys.recoveryBoxPub}
  const rosterHash=hash(canonicalJson(roster))
  const checkpoint={workspaceId,cpVersion:1,rosterVersion:1,rosterHash,epoch:1,recoverySignPub:keys.recoverySignPub,recoveryBoxPub:keys.recoveryBoxPub,prevCpHash:null}
  return {p_device:deviceId,p_workspace:workspaceId,p_generation:generation,p_roster:roster,p_roster_hash:rosterHash,
   p_roster_sig:signature(`goalloom/roster/v1|${canonicalJson(roster)}`,signSeed),p_checkpoint:checkpoint,
   p_rec_sig:signature(`goalloom/recovery-cp/v1|${canonicalJson(checkpoint)}`,recoverySeed),p_dev_sig:signature(`goalloom/recovery-cp/v1|${canonicalJson(checkpoint)}`,signSeed)}
 }}
}
export function opaqueOperation(opId=randomUUID()){
 const ciphertext=randomBytes(32)
 return {op_id:opId,payload_hash:hash(ciphertext),format_version:1,key_epoch:1,ciphertext:ciphertext.toString('hex')}
}
export function tokenExpiry(token){
 const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'))
 if(!Number.isSafeInteger(payload.exp))throw Error('token_expiry_unavailable')
 return new Date(payload.exp*1000).toISOString()
}
