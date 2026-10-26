/**
 * [INPUT]: Final coordinator-owned D2 installation/readiness evidence and signed synthetic retrieval fixtures.
 * [OUTPUT]: Local immutable race plan and in-memory SQL builders; execution stays closed pending exact lifecycle cleanup.
 * [POS]: Retrieval account-fence race preparation; no schema/readiness/provider/Storage/model mutation or import-time network.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {retrievalFixture,retrievalIdentitySql,q,json,sha} from './d2-retrieval-fixtures.mjs'
import {authSql} from './d1-sync-fixtures.mjs'

export const RACE_CASES=Object.freeze([
 ...['prepare','finalize','authorize','read'].map(method=>({id:`${method}-cutoff`,method,transition:'cutoff',error:'retrieval_closed'})),
 {id:'finalize-restoration',method:'finalize',transition:'restoration',error:'retrieval_closed'},
 {id:'authorize-explicit-delete',method:'authorize',transition:'explicit-delete',error:'retrieval_closed'},
 {id:'read-generation',method:'read',transition:'generation',error:'retrieval_closed'},
 {id:'read-revision',method:'read',transition:'revision',error:'retrieval_boundary_changed'},
 {id:'prepare-session-delete',method:'prepare',transition:'session-delete',error:'authentication_failed'},
 {id:'prepare-owner-ban',method:'prepare',transition:'owner-ban',error:'authentication_failed'},
 {id:'authorize-device-revoke',method:'authorize',transition:'device-revoke',error:'retrieval_proof_invalid',proofKind:'device'},
 {id:'authorize-one-grant',method:'authorize',transition:'authorize-once',error:'retrieval_proof_invalid'},
])
export const RACE_LIMITS=Object.freeze({statementMs:25000,lockMs:20000,holderDeadlineMs:18000,barrierMs:12000,pollMs:100})
const project='asqyvcnxdltzzfutbbqy',directory='output/tests/billing/desktop/d2-retrieval/concurrency'
const dependencies=['scripts/billing/d2-retrieval-concurrency.mjs','scripts/billing/d2-retrieval-fixtures.mjs','scripts/billing/d1-sync-fixtures.mjs',
 'scripts/hosted-ai/client.mjs','scripts/deploy/transport.mjs','packages/contracts/src/canonical.ts','package.json','pnpm-lock.yaml',
 'supabase/migrations/0025_service_lifecycle.sql','supabase/migrations/0026_account_deletion.sql','supabase/migrations/0027_retained_retrieval.sql',
 'output/tests/billing/desktop/d2-retrieval/failure-cases.md','output/tests/billing/desktop/d2-retrieval/server-interface.md',
 'output/reviews/desktop-subscription-d1-d3-2026-10-23/d2-lifecycle-implementation-contract.md']
const call=(f,method,request)=>`public.service_retrieval_${method}(${q(f.user)},${q(f.session)},'development',${typeof request==='string'?request:json(request)})`
const subject=f=>`(select subject_id from service_private.account_lifecycle where environment='development' and user_id=${q(f.user)})`
const requireSql=(condition,label)=>`if (${condition}) is distinct from true then raise exception ${q(label)} using errcode='P7201';end if;`
const tx=(name,sql)=>`begin;set local application_name=${q(name)};set local timezone='UTC';set local datestyle='ISO,YMD';set local statement_timeout='${RACE_LIMITS.statementMs}ms';set local lock_timeout='${RACE_LIMITS.lockMs}ms';${sql}\ncommit;`
const digest=expression=>`encode(pg_catalog.sha256(convert_to(${expression},'UTF8')),'hex')`

/** Exact identifiers only. Raw operation bytes and capabilities never leave this snapshot. */
export function raceSnapshotSql(f){return `select jsonb_build_object(
 'workspace',(select jsonb_build_object('generation',generation,'headSeq',head_seq,'rosterVersion',roster_version,'keyEpoch',key_epoch) from public.workspaces where id=${q(f.workspace)} and user_id=${q(f.user)}),
 'lifecycle',(select jsonb_build_object('generation',generation,'revision',revision,'state',state,'reason',reason,'closedAt',closed_at,'retrieveUntil',retrieve_until) from service_private.workspace_lifecycle where environment='development' and workspace_id=${q(f.workspace)} and subject_id=${subject(f)}),
 'ops',(select jsonb_build_object('count',count(*),'hash',${digest("coalesce(string_agg(to_jsonb(o)::text,'' order by seq),'')")}) from public.ops o where workspace_id=${q(f.workspace)}),
 'receipts',(select jsonb_build_object('count',count(*),'hash',${digest("coalesce(string_agg(to_jsonb(r)::text,'' order by seq,op_id),'')")}) from public.op_receipts r where workspace_id=${q(f.workspace)}),
 'builds',(select count(*) from service_private.retrieval_builds where owner_id=${q(f.user)} and workspace_id=${q(f.workspace)}),
 'challenges',(select count(*) from service_private.retrieval_challenges c join service_private.retrieval_builds b on b.id=c.build_id where b.owner_id=${q(f.user)} and b.workspace_id=${q(f.workspace)}),
 'consumed',(select count(*) from service_private.retrieval_challenges c join service_private.retrieval_builds b on b.id=c.build_id where b.owner_id=${q(f.user)} and b.workspace_id=${q(f.workspace)} and c.consumed_at is not null),
 'capabilities',(select count(*) from service_private.retrieval_capabilities c join service_private.retrieval_builds b on b.id=c.build_id where b.owner_id=${q(f.user)} and b.workspace_id=${q(f.workspace)}),
 'ordinaryCancelled',(select count(*) from service_private.deletion_outbox where environment='development' and subject_id=${subject(f)} and workspace_id=${q(f.workspace)} and event_kind='ordinary_cancelled')) as state;`}

function privateSetupSql(f,c){
 const proofKind=c.proofKind??'recovery',proof=proofKind==='device'?{kind:'device',deviceId:f.device}:{kind:'recovery'}
 const initial={version:1,workspaceId:f.workspace,generation:f.generation,proof}
 const manifest={version:1,purpose:'retained-copy',environment:'development',projectRef:project,workspaceId:f.workspace,generation:f.generation,
  lifecycleVersion:1,accessEndedAt:'2030-01-01T00:00:00.123456Z',retrieveUntil:'2030-01-31T00:00:00.123456Z',headSeq:1,minRetainedSeq:0,operationCount:1,
  headHash:f.headHash,keyEpoch:1,checkpointVersion:1,checkpointHash:sha(canonicalJson(f.checkpoint)),rosterVersion:1,rosterHash:f.rosterHash,
  recoveryKeyId:sha(Buffer.from(f.recoverySignPub,'hex')),envelopeSetHash:sha(canonicalJson([{epoch:1,recipient:'recovery',ciphertext:f.envelopeCiphertext,signature:f.envelopeSig,rosterVersion:1,signerDevice:f.device}])),
  proofKind,deviceId:proofKind==='device'?f.device:null,initialization:null}
 let prepare=`request:=${json(initial)};`
 if(c.method!=='prepare')prepare+=`
 p:=${call(f,'prepare',initial)};${requireSql("p->'ok'='true'::jsonb",'setup_prepare_denied')}
 foreach section in array array['rosters','metadata'] loop
  cursor:=0;loop
   r:=${call(f,'source',"jsonb_build_object('buildId',p->'buildId','section',section,'after',cursor)")};
   ${requireSql("r->'ok'='true'::jsonb and (r->>'next')::bigint>=cursor",'setup_source_denied')}
   cursor:=(r->>'next')::bigint;exit when r->'done'='true'::jsonb;
  end loop;
 end loop;
 request:=jsonb_build_object('buildId',p->'buildId','manifest',${json(manifest)}||jsonb_build_object('lifecycleVersion',p->'boundary'->'lifecycleVersion'));`
 if(c.method==='authorize'||c.method==='read')prepare+=`
 c:=${call(f,'finalize','request')};${requireSql("c->'ok'='true'::jsonb",'setup_finalize_denied')}
 signature:=pgsodium.crypto_sign_detached(pg_catalog.sha256(convert_to('goalloom/retrieval-proof/v1|'||public._canonical_json(c->'proofBody'),'UTF8')),${f.sqlSecret(proofKind)});
 request:=jsonb_build_object('version',1,'challengeId',c->'proofBody'->'challengeId','signature',encode(signature,'hex'));`
 if(c.method==='read')prepare+=`
 a:=${call(f,'authorize','request')};${requireSql("a->'ok'='true'::jsonb",'setup_authorize_denied')}
 request:=jsonb_build_object('version',1,'capability',a->'capability','afterSeq',0);`
 return tx(`d2-race-setup:${f.user}`,`
 do $guard$ begin
 ${requireSql(`not exists(select 1 from auth.users where id=${q(f.user)}) and not exists(select 1 from public.workspaces where id=${q(f.workspace)})`,'fixture_collision')}
 ${requireSql(`exists(select 1 from service_private.policy where id=1 and environment='development' and project_ref=${q(project)}) and exists(select 1 from service_private.lifecycle_policy where id=1 and enabled and independent_ledger_ready and restore_admission_ready and cleanup_wiring_ready)`,'coordinator_readiness_required')}
 end $guard$;
 ${retrievalIdentitySql(f)}
 create temporary table d2_race_private(request jsonb) on commit drop;
 do $setup$ declare p jsonb;r jsonb;c jsonb;a jsonb;request jsonb;signature bytea;section text;cursor bigint;begin ${prepare}
 insert into pg_temp.d2_race_private values(request);end $setup$;
 select request as private_request from pg_temp.d2_race_private;`)
}

function transitionSql(f,c,request){
 const scope=subject(f),where=`where environment='development' and subject_id=${scope}`
 const reconcile=`perform service_private.reconcile_lifecycle_locked(${scope},'development',service_private.lifecycle_now('development',${scope}));`
 switch(c.transition){
  case 'cutoff':return `update public.billing_accounts set test_now=(select retrieve_until from service_private.workspace_lifecycle where workspace_id=${q(f.workspace)}) ${where};${reconcile}
   ${requireSql(`exists(select 1 from service_private.workspace_lifecycle where workspace_id=${q(f.workspace)} and generation=${q(f.generation)} and state='queued' and closed_at=retrieve_until)`,'cutoff_fence_missing')}`
  case 'restoration':return `update public.billing_accounts set trial_request=${q(f.request)},trial_started_at='2030-01-02T00:00:00.123456Z',trial_ends_at='2030-01-10T00:00:00.123456Z' ${where};${reconcile}
   ${requireSql(`exists(select 1 from service_private.workspace_lifecycle where workspace_id=${q(f.workspace)} and generation=${q(f.generation)} and state='active') and exists(select 1 from service_private.deletion_outbox where workspace_id=${q(f.workspace)} and generation=${q(f.generation)} and event_kind='ordinary_cancelled')`,'restoration_fence_missing')}`
  case 'explicit-delete':return `
   select l.revision into revision from service_private.workspace_lifecycle l where l.environment='development' and l.workspace_id=${q(f.workspace)} and l.generation=${q(f.generation)};
   r:=public.lifecycle_prepare_delete(jsonb_build_object('version',1,'requestId',${q(f.request)},'scope','cloud','target',jsonb_build_object('workspaceId',${q(f.workspace)},'generation',${q(f.generation)}),'expectedRevision',revision,'receiptDigest',${q(sha(`race-delete:${f.request}`))}));
   ${requireSql("r->>'requestId'="+q(f.request)+" and not(r?'error')",'delete_prepare_denied')}
   r:=public.lifecycle_confirm_delete(jsonb_build_object('version',1,'requestId',${q(f.request)},'expectedRevision',revision,'acknowledge',true));
   ${requireSql("r->'accepted'='true'::jsonb",'delete_confirm_denied')}
   ${requireSql(`exists(select 1 from service_private.workspace_lifecycle where workspace_id=${q(f.workspace)} and generation=${q(f.generation)} and state='queued' and reason='explicit_cloud')`,'explicit_fence_missing')}`
  // This is an exact fixture metadata transition, not a resetWorkspace journey.
  case 'generation':return `update public.workspaces set generation=${q(f.finalOp)} where id=${q(f.workspace)} and user_id=${q(f.user)};
   update service_private.workspace_lifecycle as l set generation=${q(f.finalOp)},revision=l.revision+1 where environment='development' and workspace_id=${q(f.workspace)} and subject_id=${scope};
   update service_private.account_lifecycle as a set revision=a.revision+1 ${where};`
  case 'revision':return `update service_private.workspace_lifecycle as l set revision=l.revision+1 where environment='development' and workspace_id=${q(f.workspace)} and subject_id=${scope};
   update service_private.account_lifecycle as a set revision=a.revision+1 ${where};`
  case 'session-delete':return `delete from auth.sessions where id=${q(f.session)} and user_id=${q(f.user)};`
  case 'owner-ban':return `update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=${q(f.user)};`
  case 'device-revoke':return `update public.devices set status='revoked' where id=${q(f.device)} and user_id=${q(f.user)} and auth_session_id=${q(f.session)};`
  case 'authorize-once':return `r:=${call(f,'authorize',request)};
   ${requireSql("r->'ok'='true'::jsonb",'first_authorize_denied')}
   ${requireSql(`(select count(*)=1 from service_private.retrieval_capabilities a join service_private.retrieval_builds b on b.id=a.build_id where b.owner_id=${q(f.user)} and b.workspace_id=${q(f.workspace)})`,'first_grant_count')}`
  default:throw Error('Unknown frozen race transition')
 }
}

/** SQL strings contain private fixture keys/request tokens. Keep them in memory only. */
export function buildRetrievalRace(f,c){
 assert(RACE_CASES.some(x=>canonicalJson(x)===canonicalJson(c)),'Unknown reviewed race')
 const holderName=`d2-race-holder:${f.user}`,waiterName=`d2-race-waiter:${f.user}`
 return {holderName,waiterName,setupSql:privateSetupSql(f,c),snapshotSql:raceSnapshotSql(f),
  fixture:{ownerId:f.user,workspaceId:f.workspace,generation:f.generation,deviceId:f.device,sessionId:f.session,signalSessionId:f.otherSession},
  signalSql:`update auth.sessions set not_after=clock_timestamp() where id=${q(f.otherSession)} and user_id=${q(f.user)} and not_after is null returning id;`,
  holderSql(request){return tx(holderName,`${authSql(f,{version:'2'})}
   do $holder$ declare deadline timestamptz;revision bigint;r jsonb;begin
    perform service_private.lock_account(${subject(f)},'development');deadline:=clock_timestamp()+interval '${RACE_LIMITS.holderDeadlineMs} milliseconds';
    loop
     ${requireSql(`exists(select 1 from auth.sessions where id=${q(f.otherSession)} and user_id=${q(f.user)})`,'release_session_missing')}
     exit when exists(select 1 from auth.sessions where id=${q(f.otherSession)} and user_id=${q(f.user)} and not_after is not null);
     if clock_timestamp()>=deadline then raise exception 'release_barrier_timeout' using errcode='P7202';end if;
     perform pg_sleep(0.05);
    end loop;
    ${transitionSql(f,c,request)}
   end $holder$;
   select true as transition_committed_after_observed_block;`)},
  waiterSql(request){return tx(waiterName,`select ${call(f,c.method,request)} as private_result;`)},
  expected:{error:c.error,operationsAndReceiptsUnchanged:true,newAuthority:c.transition==='authorize-once'?{builds:1,challenges:1,consumed:1,capabilities:1}:'No added builds/challenges/capabilities; denied response has no operations or capability',
   generationTransition:c.transition==='generation'?'Exact synthetic metadata only, not a resetWorkspace product acceptance':null},
 }
}

/** Exact PID blocking is the barrier. Poll intervals are scheduling only. No writes. */
export async function observeRaceLock(db,name,blocker=null){
 assert(/^d2-race-(holder|waiter):[0-9a-f-]{36}$/.test(name),'Unexpected race application name')
 const until=Date.now()+RACE_LIMITS.barrierMs
 while(Date.now()<until){
  const rows=await db.query(`select pid,wait_event_type,pg_blocking_pids(pid) as blockers from pg_stat_activity where application_name=${q(name)} and state='active'`)
  const row=rows.find(r=>blocker===null||r.wait_event_type==='Lock'&&r.blockers.map(Number).includes(Number(blocker)))
  if(row)return {pid:Number(row.pid),blockers:row.blockers.map(Number),waitEventType:row.wait_event_type}
  await new Promise(resolve=>setTimeout(resolve,RACE_LIMITS.pollMs))
 }
 throw Error(blocker===null?'holder_not_observed':'exact_holder_block_not_observed')
}

async function entries(paths){return Promise.all(paths.map(async path=>{const bytes=await readFile(path);return {path,sha256:sha(bytes),bytes:bytes.length}}))}
const parserProgram=String.raw`
import sys,json,pathlib,hashlib,platform
sys.path.insert(0,sys.argv[1]);import pglast
from pglast import ast,parse_sql,parse_plpgsql
assert pglast.__version__=='v6.17'
reports=[]
for item in json.load(sys.stdin):
 s=item['sql'];r={'name':item['name'],'sha256':hashlib.sha256(s.encode()).hexdigest(),'bytes':len(s.encode()),'statements':0,'plpgsql':0,'errors':[]};reports.append(r)
 try:statements=parse_sql(s);r['statements']=len(statements)
 except Exception as e:r['errors'].append({'type':type(e).__name__,'stage':'outer'});continue
 for raw in statements:
  if isinstance(raw.stmt,ast.DoStmt):
   text=s[raw.stmt_location:raw.stmt_location+raw.stmt_len] if raw.stmt_len else s[raw.stmt_location:]
   try:parse_plpgsql(text);r['plpgsql']+=1
   except Exception as e:r['errors'].append({'type':type(e).__name__,'stage':'plpgsql'})
paths=[pathlib.Path(sys.executable)]
for folder in ['pglast','pglast-6.17.dist-info']:
 paths.extend(p for p in sorted((pathlib.Path(sys.argv[1])/folder).rglob('*')) if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc')
deps=[{'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':len(p.read_bytes())} for p in paths]
print(json.dumps({'ok':not any(r['errors'] for r in reports),'parser':{'package':'pglast','version':pglast.__version__,'postgresqlGrammar':pglast.parser.get_postgresql_version(),'python':platform.python_version()},'dependencies':deps,'reports':reports}))
`
export async function createRetrievalRacePlan({parserRoot='/private/tmp/goalloom-d2-sql-parser',python='/Applications/Xcode.app/Contents/Developer/usr/bin/python3'}={}){
 const sources=await entries(dependencies),sql=[]
 for(const c of RACE_CASES){
  const f=retrievalFixture(),builder=buildRetrievalRace(f,c)
  // Grammar placeholders never establish a valid proof/capability. Execution
  // must use private_request returned by the actual setup transaction.
  const request=c.method==='prepare'?{version:1,workspaceId:f.workspace,generation:f.generation,proof:{kind:'recovery'}}
   :c.method==='finalize'?{buildId:f.request,manifest:{}}:c.method==='authorize'?{version:1,challengeId:f.request,signature:'00'.repeat(64)}:{version:1,capability:'00'.repeat(32),afterSeq:0}
  for(const [name,text] of Object.entries({setup:builder.setupSql,holder:builder.holderSql(request),waiter:builder.waiterSql(request),signal:builder.signalSql,snapshot:builder.snapshotSql}))sql.push({name:`${c.id}/${name}`,sql:text})
 }
 const result=spawnSync(python,['-c',parserProgram,parserRoot],{input:JSON.stringify(sql),encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024})
 assert(result.status===0&&!result.error,'Local pinned parser unavailable; no remote action attempted')
 const audit={version:1,scope:'SQL and PL/pgSQL grammar only',remoteExecuted:false,sources,...JSON.parse(result.stdout)}
 const auditBytes=JSON.stringify(audit,null,2)+'\n',auditHash=sha(auditBytes)
 await mkdir(directory+'/parser-audits',{recursive:true})
 const auditPath=`${directory}/parser-audits/${auditHash}.json`;await immutable(auditPath,auditBytes)
 const plan={version:1,project,sourceOnly:true,remoteExecuted:false,status:'PREPARED_EXECUTION_BLOCKED',executionReady:false,sources,cases:RACE_CASES,limits:RACE_LIMITS,
  parserAudit:{path:auditPath,sha256:auditHash,bytes:Buffer.byteLength(auditBytes),ok:audit.ok},
  requiredBeforeExecution:['Explicit Root lease for this reviewed set and only the synthetic manifest.','Coordinator attestation of exact final installed D2 migration/function/ACL hashes and all four already-established readiness flags; no harness activation.','Published reusable exact lifecycle fixture cleanup interface with identity proof, subject/lifecycle/billing/retrieval/Auth absence and finite failure artifact.','Coordinator controls concurrent worker effects on this exact synthetic fixture; retrieval denial cannot be used to claim worker/content preservation.'],
  cleanup:{status:'INTERFACE_PENDING',legacyGenericCleanupAllowed:false,requiredProof:['Exact Auth UUID and billing-<uuid>@goalloom.test identity before any deletion','Exact subject mapping, workspace generation and device/session ownership','No original invoice/protection/budget/provider/Storage rows in fixture scope','Exact post-cleanup Auth/session/device/workspace, subject/lifecycle/billing/deletion/retrieval authority absence']},
  choreography:['Setup actual signed control records and prepare/source/finalize/proof as required; keep returned private request only in memory.','A holds service_private.lock_account, including billing_accounts. Observe active A PID.','B calls the real service facade. Observe B waiting on Lock with A in pg_blocking_pids(B).','After that evidence only, set unused otherSession.not_after. A observes that signal, performs transition under its existing fence, then commits.','Await bounded A/B requests without retries; require exact typed denial, no returned bytes/grant, unchanged op/receipt hashes and winning lifecycle fence.','Same-challenge case: A authorizes once before commit; B must deny, and exact synthetic consumed/capability counts are one.','Always run the future reviewed exact cleanup after bounded requests settle; retain failure and unknown outcomes.'],
  scope:'Future real independent PostgreSQL transactions only. Synthetic SQL Auth/session rows are not hosted Auth/HTTP acceptance; generation metadata revision is not resetWorkspace acceptance. No provider/model/Storage/grants/schema/readiness/source/worker action.',
  artifactPrivacy:'Hashes, finite errors/PIDs, synthetic UUIDs, scoped counts and booleans only. No SQL strings, seeds, raw capability, JWT, email or ciphertext.'}
 plan.reviewedSetSha256=sha(canonicalJson(plan))
 const path=`${directory}/plans/${plan.reviewedSetSha256.slice(0,20)}.json`;await mkdir(directory+'/plans',{recursive:true});await immutable(path,JSON.stringify(plan,null,2)+'\n')
 return {plan,path}
}
async function immutable(path,bytes){try{await writeFile(path,bytes,{flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(await readFile(path,'utf8'),bytes,'Immutable artifact changed')}}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),mode=args[0]??'--plan',flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
 assert(['--plan','--run'].includes(mode),'Use --plan; --run stays closed pending reviewed coordinator contracts')
 if(mode==='--run'){
  assert.equal(process.env.D2_RETRIEVAL_RACE_WINDOW,'development','Explicit future Root race lease required')
  throw Error('Execution blocked: final installed D2/readiness attestation and reusable exact lifecycle fixture cleanup interface are not published. No client was created.')
 }
 const {plan,path}=await createRetrievalRacePlan({parserRoot:flag('--parser-root'),python:flag('--python')})
 console.log(JSON.stringify({ok:plan.parserAudit.ok,executionReady:false,remoteExecuted:false,status:plan.status,plan:path,reviewedSetSha256:plan.reviewedSetSha256,cases:plan.cases.length,parserAudit:plan.parserAudit}))
 if(!plan.parserAudit.ok)process.exitCode=1
}
