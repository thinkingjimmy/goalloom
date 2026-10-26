/**
 * [INPUT]: Current development0032 metadata, a fresh protected synthetic journal and the existing race callbacks.
 * [OUTPUT]: Cases5–12 selection, current-state preflight and finite readiness closure; no historical proof gate.
 * [POS]: Small fresh remaining8 seam for development-fixtures. Existing auth/isolation/deletion assertions remain unchanged.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,lstat} from 'node:fs/promises'
import {randomUUID,randomBytes} from 'node:crypto'
import {resolve} from 'node:path'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {RACE_CASES} from '../billing/d2-retrieval-concurrency.mjs'
import {normalizedSchemaSql} from '../billing/d2-schema-attestation.mjs'
import {planRaceCases} from './fixture-integration.mjs'
import {sha,json,journalDigest,savePrivate} from './fixture-support.mjs'
export const remainingCaseIds=RACE_CASES.slice(4).map(s=>s.id)
export const remainingStages=['readiness','prepare','integration-remaining','cleanup-races','cleanup','recover']
export const remainingPrefixStages=['integration-remaining','cleanup-races','cleanup','recover']
const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const project='asqyvcnxdltzzfutbbqy',newBody='bd3a66e2fdb8ca893eb96ec0bcac238d0152a445c07b71a51fe1c484afea5c0d'
export async function captureCurrentFixtureState(db,{closed=false}={}){
 const row=(await db.query(`select jsonb_build_object('service',(select to_jsonb(p) from service_private.policy p where id=1),'billing',(select to_jsonb(p) from public.billing_policy p where environment='development'),'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1)) policies,
 (select jsonb_agg(jsonb_build_object('version',version,'sha256',sha256) order by version) from service_private.migrations) history,
 (select encode(pg_catalog.sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='service_private.generation_view(service_private.workspace_lifecycle,timestamp with time zone)'::regprocedure) generation_body,
 (select count(*) from service_private.restore_runs) restore_runs,(select count(*) from service_private.restore_events) restore_events,
 (select count(*) from cron.job where jobname='goalloom-billing-worker-development' and not active) paused_cron,current_setting('server_version') postgresql`))[0]
 const p=row?.policies
 assert(p?.service.environment==='development'&&p.service.project_ref===project&&p.lifecycle.restore_blocked===false,'Fixed development project with no restore barrier required')
 assert(row.generation_body===newBody&&row.history.some(r=>r.version==='0032'&&r.sha256==='9f3dc2e2e05b87ba464d69c57f67eea09e374e4caad514d94ee157c1539bca54'),'Actual0032 installation required')
 assert(Number(row.restore_runs)===0&&Number(row.restore_events)===0&&Number(row.paused_cron)===1,'Restore must be inactive and billing cron paused')
 if(closed)assert(p.service.enabled===false&&p.billing.enabled===false&&['enabled','independent_ledger_ready','restore_admission_ready','cleanup_wiring_ready'].every(k=>p.lifecycle[k]===false),'Initial test window must be closed')
 return{version:1,project,readOnly:true,remoteWrites:0,...row,schema:(await db.query(normalizedSchemaSql))[0].schema_attestation}
}
export async function assertCurrentFixtureInstalled(ctx,plan,{closed=false}={}){
 const before=JSON.parse(await readFile(plan.currentDevelopmentSnapshot.path,'utf8')),now=await captureCurrentFixtureState(ctx.db,{closed})
 assert(same(now.history,before.history),'Installed migration set changed during this test run')
 const withoutConfiguration=value=>Object.fromEntries(Object.entries(value).filter(([k])=>k!=='configuration'))
 assert(same(withoutConfiguration(now.schema),withoutConfiguration(before.schema)),'Installed schema changed during this test run')
 return now.schema
}
export async function createFreshJournal(directory,runtime){
 const privatePath=resolve(directory,'.fixtures-private.json')
 try{await lstat(privatePath);assert.fail('Use a new directory for fresh synthetic fixtures')}catch(e){if(e.code!=='ENOENT')throw e}
 const journal={version:1,project,runId:randomUUID(),createdAt:new Date().toISOString(),fixtures:[],scopes:{},workerRuns:[],quarantine:{held:false},plannedCaseIds:[...remainingCaseIds]}
 for(const label of ['owner','foreign','account','fair-one','fair-two']){
  const ownerId=randomUUID(),count=label==='owner'?2:['foreign','account'].includes(label)?1:0
  journal.fixtures.push({label,ownerId,email:`billing-${ownerId}@goalloom.test`,password:randomBytes(32).toString('base64url')+'aA!',sessionCount:label==='owner'?2:1,sessions:[],devices:Array.from({length:label==='owner'?2:count?1:0},()=>({id:null,secrets:runtime.fixtureSecrets()})),targets:Array.from({length:count},(_,i)=>{const workspaceId=randomUUID(),generation=randomUUID();return{workspaceId,generation,path:`workspaces/${workspaceId}/${generation}/1.bin`,bodyHex:Buffer.from('D2 synthetic ciphertext transport').toString('hex'),transportCase:label==='account'?'known-storage-ack-loss':label==='owner'&&i===1?'known-begin-ack-loss':'deployed-confirmed'}})})
 }
 for(const name of ['work','cleanup'])journal.scopes[name]={id:randomUUID(),secret:randomBytes(32).toString('hex'),registered:false}
 journal.races=planRaceCases(directory);await savePrivate(privatePath,journal);return{journal,privatePath}
}
export function assertFreshRemainingIdentity(journal){
 assert(journal.project===project&&same(journal.plannedCaseIds,remainingCaseIds)&&!journal.cleaned&&!journal.sdk,'Fresh selected synthetic journal required')
 const ids=[...journal.fixtures.map(f=>f.ownerId),...journal.races.map(r=>r.fixture.ownerId)]
 assert(new Set(ids).size===ids.length,'Synthetic identities must be distinct')
}
export async function checkRemainingPlan(plan,{journal,lease}={}){
 assert(plan.currentDevelopmentSnapshot&&plan.remainingRace?.lease===lease&&same(plan.plannedCaseIds,remainingCaseIds)&&same(plan.stages,remainingStages),'Current fresh remaining8 plan/lease required')
 assert(lease&&lease!=='a0d1167d-94f2-40a5-93d1-76447f2b072e','A distinct fresh test lease is required')
 assert(sha(await readFile(plan.currentDevelopmentSnapshot.path))===plan.currentDevelopmentSnapshot.sha256,'Current test snapshot changed')
 if(journal){assert(journalDigest(journal)===plan.identityDigest,'Protected fixture identities changed');assertFreshRemainingIdentity(journal)}
 return plan
}
export async function reviewRemainingEvidence(){throw Error('Historical remaining-evidence gates are retired; use --fresh-remaining')}
export async function closeFreshReadiness(db,journal,privatePath){
 const before=journal.readinessBefore
 if(!before)return{closed:true,activationNeverAttempted:true}
 assert(before.service.environment==='development'&&before.service.project_ref===project&&before.lifecycle.restore_blocked===false,'Only the fresh development window may close')
 const current=(await db.query("select jsonb_build_object('service',(select to_jsonb(p) from service_private.policy p where id=1),'billing',(select to_jsonb(p) from public.billing_policy p where environment='development'),'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1)) value"))[0].value
 const enabled={service:{...before.service,enabled:true},billing:{...before.billing,enabled:true},lifecycle:{...before.lifecycle,enabled:true,independent_ledger_ready:true,restore_admission_ready:true,cleanup_wiring_ready:true}}
 assert(same(current,before)||same(current,enabled),'Protected policy changed outside the fresh test window')
 await db.query(`begin;set local lock_timeout='3s';set local statement_timeout='10s';lock table service_private.policy,public.billing_policy,service_private.lifecycle_policy in share row exclusive mode;
 do $$begin if (select jsonb_build_object('service',(select to_jsonb(p) from service_private.policy p where id=1),'billing',(select to_jsonb(p) from public.billing_policy p where environment='development'),'lifecycle',(select to_jsonb(p) from service_private.lifecycle_policy p where id=1))) is distinct from ${json(current)} then raise exception 'fresh_test_policy_changed';end if;end$$;
 update service_private.policy set enabled=false where id=1 and environment='development' and project_ref='${project}';update public.billing_policy set enabled=false where environment='development';update service_private.lifecycle_policy set enabled=false,independent_ledger_ready=false,restore_admission_ready=false,cleanup_wiring_ready=false where id=1;commit;`,false)
 journal.readinessActive=false;journal.freshWindowClosed=true;await savePrivate(privatePath,journal)
 const after=await captureCurrentFixtureState(db,{closed:true});return{closed:true,postgresql:after.postgresql,originalPoliciesRestored:same(after.policies,before)}
}
