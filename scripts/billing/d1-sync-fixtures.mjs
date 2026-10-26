/**
 * [INPUT]: Optional synthetic UUIDs and the shared canonical JSON contract.
 * [OUTPUT]: Public fixture proofs and SQL literals; private signing seeds stay in memory.
 * [POS]: D1 rollback-only SQL acceptance fixtures, not a server authorization implementation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { canonicalJson } from '../../packages/contracts/src/canonical.ts'

export const literal = value => value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`
export const json = value => `${literal(JSON.stringify(value))}::jsonb`
export const bytea = value => `decode(${literal(value)},'hex')`
const hex = bytes => Buffer.from(bytes).toString('hex')
const hash = text => createHash('sha256').update(text).digest('hex')

export function syncFixture(input = {}) {
  const ids = Object.fromEntries(['user','session','otherSession','device','workspace','generation','op','request','challenge'].map(key => [key,input[key] ?? randomUUID()]))
  const deviceSeed = randomBytes(32), recoverySeed = randomBytes(32)
  const keys = { signPub:hex(ed25519.getPublicKey(deviceSeed)), boxPub:hex(x25519.getPublicKey(randomBytes(32))),
    recoverySignPub:hex(ed25519.getPublicKey(recoverySeed)), recoveryBoxPub:hex(x25519.getPublicKey(randomBytes(32))) }
  const sign = (message, seed=deviceSeed) => hex(ed25519.sign(Buffer.from(message,'hex'),seed))
  const roster = { workspaceId:ids.workspace,version:1,epoch:1,prevHash:null,
    devices:[{id:ids.device,signPub:keys.signPub,boxPub:keys.boxPub}],recoverySignPub:keys.recoverySignPub,recoveryBoxPub:keys.recoveryBoxPub }
  const rosterHash = hash(canonicalJson(roster))
  const checkpoint = { workspaceId:ids.workspace,cpVersion:1,rosterVersion:1,rosterHash,epoch:1,
    recoverySignPub:keys.recoverySignPub,recoveryBoxPub:keys.recoveryBoxPub,prevCpHash:null }
  const checkpointMessage = hash(`goalloom/recovery-cp/v1|${canonicalJson(checkpoint)}`)
  const nextRoster = {...roster,version:2,prevHash:rosterHash}
  const rebindMessage = hex(Buffer.from(`goalloom/d1-fixture/rebind|${ids.device}|${ids.otherSession}`))
  const fixture = { ...ids,...keys,roster,rosterHash,checkpoint,
    rosterSig:sign(hash(`goalloom/roster/v1|${canonicalJson(roster)}`)),
    recSig:sign(checkpointMessage,recoverySeed),devSig:sign(checkpointMessage),
    nextRoster,nextRosterHash:hash(canonicalJson(nextRoster)),nextRosterSig:sign(hash(`goalloom/roster/v1|${canonicalJson(nextRoster)}`)),
    rebindMessage,
    payloadHash:hash(`opaque-ciphertext-fixture:${ids.op}`),ciphertext:'01020304',
    snapshotHash:hash(Buffer.from([1,2,3,4])),badSig:'00'.repeat(64) }
  fixture.rebindSig=hex(ed25519.sign(Buffer.from(rebindMessage,'hex'),deviceSeed))
  fixture.recoveryNonce=hex(randomBytes(32))
  fixture.recoverySig=hex(ed25519.sign(Buffer.from(`goalloom/recover/v1|${ids.workspace}|${ids.device}|${fixture.recoveryNonce}|${rosterHash}`),recoverySeed))
  fixture.recoveryRosterSig=sign(hash(`goalloom/roster/v1|${canonicalJson(nextRoster)}`),recoverySeed)
  fixture.rotatedRoster={...nextRoster,epoch:2}
  fixture.rotatedRosterHash=hash(canonicalJson(fixture.rotatedRoster))
  fixture.rotatedRosterSig=sign(hash(`goalloom/roster/v1|${canonicalJson(fixture.rotatedRoster)}`))
  fixture.nextCheckpoint={...checkpoint,cpVersion:2,rosterVersion:2,rosterHash:fixture.nextRosterHash,prevCpHash:hash(canonicalJson(checkpoint))}
  const nextCpMessage=hash(`goalloom/recovery-cp/v1|${canonicalJson(fixture.nextCheckpoint)}`)
  fixture.nextRecSig=sign(nextCpMessage,recoverySeed)
  fixture.nextDevSig=sign(nextCpMessage)
  fixture.snapshotPath=`workspaces/${ids.workspace}/${ids.generation}/1.bin`
  fixture.legacySnapshotPath=`workspaces/${ids.workspace}/2.bin`
  fixture.operation={op_id:ids.op,payload_hash:fixture.payloadHash,format_version:1,key_epoch:1,ciphertext:fixture.ciphertext}
  fixture.workspaceArguments=[literal(ids.device),literal(ids.workspace),literal(ids.generation),json(roster),literal(rosterHash),bytea(fixture.rosterSig),json(checkpoint),bytea(fixture.recSig),bytea(fixture.devSig)].join(',')
  return fixture
}

export function authSql(fixture, { session=fixture.session,user=fixture.user,version='1',issuer='https://asqyvcnxdltzzfutbbqy.supabase.co/auth/v1' } = {}) {
  const claims={sub:user,role:'authenticated',session_id:session,iss:issuer}
  const headers=version===null?{}:{'x-goalloom-service-version':version}
  return `select set_config('request.jwt.claims',${literal(JSON.stringify(claims))},true),set_config('request.headers',${literal(JSON.stringify(headers))},true);`
}

export function identitySql(fixture) {
  return `insert into auth.users(id,email) values(${literal(fixture.user)},${literal(`billing-${fixture.user}@goalloom.test`)});
insert into auth.sessions(id,user_id) values(${literal(fixture.session)},${literal(fixture.user)}),(${literal(fixture.otherSession)},${literal(fixture.user)});
insert into public.devices(id,user_id,name,platform,sign_pub,box_pub,status,auth_session_id,protocol_version,service_version)
values(${literal(fixture.device)},${literal(fixture.user)},'D1 synthetic SQL','macos',${bytea(fixture.signPub)},${bytea(fixture.boxPub)},'registered',${literal(fixture.session)},1,1);`
}

export function ordinaryCalls(fixture) {
  const f=fixture,w=literal(f.workspace),d=literal(f.device),g=literal(f.generation),r=json(f.roster),sig=bytea(f.rosterSig),h=literal(f.rosterHash)
  return [
    ['register_device',`public.register_device('D1 admission','macos',${bytea(f.signPub)},${bytea(f.boxPub)},1)`],
    ['bootstrap_workspace',`public.bootstrap_workspace(${f.workspaceArguments})`],
    ['create_new_workspace',`public.create_new_workspace(${f.workspaceArguments})`],
    ['list_account',`public.list_account(${w})`],
    ['get_sync_status',`public.get_sync_status(${w},${d})`],
    ['push_ops',`public.push_ops(${w},${d},${g},'[]'::jsonb)`],
    ['pull_ops',`public.pull_ops(${w},${d},0,10)`],
    ['commit_roster',`public.commit_roster(${w},${d},1,${h},${r},${h},${sig},'device')`],
    ['rotate_epoch',`public.rotate_epoch(${w},${d},1,${r},${h},${sig})`],
    ['start_recovery',`public.start_recovery(${w},${d})`],
    ['complete_recovery',`public.complete_recovery(${w},${d},${literal(f.challenge)},${sig},${r},${h},${sig})`],
    ['regenerate_recovery',`public.regenerate_recovery(${w},${d},1,${h},${r},${h},${sig},${json(f.checkpoint)},${bytea(f.recSig)},${bytea(f.devSig)})`],
    ['get_latest_checkpoint',`public.get_latest_checkpoint(${w},${d})`],
    ['get_roster',`public.get_roster(${w},${d})`],
    ['get_key_envelopes',`public.get_key_envelopes(${w},${d})`],
    ['put_key_envelopes',`public.put_key_envelopes(${w},${d},'[]'::jsonb)`],
    ['snapshot_transfer_access',`public.snapshot_transfer_access(${d},${w},${g},1,${literal(f.snapshotPath)},'download')`],
  ]
}
