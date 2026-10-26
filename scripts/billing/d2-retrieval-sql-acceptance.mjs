/**
 * [INPUT]: Root-reviewed immutable D1/D2 plan, matching audit, lease and optional statically reviewed final-gate adapter.
 * [OUTPUT]: Populated forward-migration/retrieval rollback gate with independent hash-only restoration evidence.
 * [POS]: D1-to-D2 database gate only; no persistent migration, worker, HTTP/decryption or lock-race acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {client} from '../hosted-ai/client.mjs'
import {d1Migrations,d1Snapshot,schemaSnapshotSql} from './d1-schema.mjs'
import {retrievalFixture,retrievalIdentitySql,populatedD1FixtureSql,q,json,bytea,sha} from './d2-retrieval-fixtures.mjs'
import {LIMITS,RUNTIME_TABLES,TOUCHED_OLD_TABLES,inventorySql,businessSql,catalogSql,catalogScope,selectSummary,validateInventory,splitBusiness,safetySql,gateSql,isRuntime} from './d2-populated-gate.mjs'

const files=['0025_service_lifecycle.sql','0026_account_deletion.sql','0027_retained_retrieval.sql']
const evidencePath='output/tests/billing/desktop/d1-backend/sql-acceptance.json'
const defaultLifecycleManifest='output/tests/billing/desktop/d2-lifecycle/staging/a156850d280c31fe/manifest.json'
const harness=['scripts/billing/d2-retrieval-sql-acceptance.mjs','scripts/billing/d2-retrieval-fixtures.mjs','scripts/billing/d2-populated-gate.mjs','scripts/billing/d2-sql-parser-audit.mjs','scripts/billing/d1-schema.mjs','scripts/billing/d1-sync-fixtures.mjs','scripts/hosted-ai/client.mjs','scripts/deploy/transport.mjs','packages/contracts/src/canonical.ts']
const methods=['prepare','source','finalize','continue','authorize','read']
/** Returns private SQL in memory only. Do not print or persist its fixture signing keys. */
export function buildRetrievalSql(migrations){
 const f=retrievalFixture(),population=retrievalFixture(),sql=[],names=[]
 const emit=s=>sql.push(s),u=q(f.user),sid=q(f.session),w=q(f.workspace),gen=q(f.generation),dev=q(f.device)
 const call=(method,request,owner=u,session=sid,env="'development'")=>`public.service_retrieval_${method}(${owner},${session},${env},${typeof request==='string'?request:json(request)})`
 const initial={version:1,workspaceId:f.workspace,generation:f.generation,proof:{kind:'recovery'}}
 const initialCall=call('prepare',initial)
 const subject=`(select subject_id from service_private.account_lifecycle where environment='development' and user_id=${u})`
 const now=(time)=>`update public.billing_accounts set test_now=${q(time)} where environment='development' and subject_id=${subject};`
 const probe=(name,body)=>{names.push(name);emit(`select pg_temp.d2_check(${q(name)},${q(`do $probe$ declare c jsonb;a jsonb;r jsonb;b uuid;before_count bigint;after_count bigint;h text;begin ${body} end $probe$;`)});`)}
 const expect=(expression)=>`if (${expression}) is distinct from true then raise exception 'assertion_failed';end if;`
 const open=`c:=pg_temp.d2_open('recovery',${q(f.headHash)});`
 const grant=`a:=pg_temp.d2_grant(c,'recovery');`
 const read=(after='0',cap="a->'capability'")=>call('read',`jsonb_build_object('version',1,'capability',${cap},'afterSeq',${after})`)
 const continuation=(cursor='0')=>call('continue',`jsonb_build_object('version',1,'challengeId',c->'proofBody'->'challengeId','afterRosterVersion',${cursor})`)
 const manifest={version:1,purpose:'retained-copy',environment:'development',projectRef:'asqyvcnxdltzzfutbbqy',workspaceId:f.workspace,generation:f.generation,
  lifecycleVersion:1,accessEndedAt:'2030-01-01T00:00:00.123456Z',retrieveUntil:'2030-01-31T00:00:00.123456Z',headSeq:1,minRetainedSeq:0,operationCount:1,
  headHash:f.headHash,keyEpoch:1,checkpointVersion:1,checkpointHash:sha(canonicalJson(f.checkpoint)),rosterVersion:1,rosterHash:f.rosterHash,
  recoveryKeyId:sha(Buffer.from(f.recoverySignPub,'hex')),envelopeSetHash:sha(canonicalJson([{epoch:1,recipient:'recovery',ciphertext:f.envelopeCiphertext,signature:f.envelopeSig,rosterVersion:1,signerDevice:f.device}])),
  proofKind:'recovery',deviceId:null,initialization:null}
 emit(`create temporary table d2_checks(position integer generated always as identity,name text,ok boolean,state text) on commit drop;
create temporary table d2_evidence(key text primary key,value jsonb) on commit drop;
insert into d2_evidence values('schema',(${schemaSnapshotSql.trim().replace(/;$/,'')}));
insert into d2_evidence values('facades',(select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'body',md5(p.prosrc),'service',has_function_privilege('service_role',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),'anon',has_function_privilege('anon',p.oid,'execute')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'service_retrieval_%'));
insert into d2_evidence values('database',jsonb_build_object('version',version(),'serverTime',clock_timestamp()));
create function pg_temp.d2_check(p_name text,p_sql text) returns void language plpgsql security invoker set search_path='' as $check$
declare good boolean:=false;s text;
begin
 begin execute p_sql;raise exception 'rollback_probe' using errcode='P9998';
 exception when others then get stacked diagnostics s=returned_sqlstate;good:=s='P9998' and sqlerrm='rollback_probe';end;
 insert into pg_temp.d2_checks(name,ok,state) values(p_name,good,case when good then null else s end);
end $check$;
update service_private.lifecycle_policy set enabled=true,independent_ledger_ready=true,restore_admission_ready=true,cleanup_wiring_ready=true where id=1;
${retrievalIdentitySql(f)}
create function pg_temp.d2_open(p_kind text,p_head_hash text) returns jsonb language plpgsql security invoker set search_path='' as $open$
declare p jsonb;r jsonb;m jsonb;cursor bigint;section text;
begin
 p:=${call('prepare',`jsonb_build_object('version',1,'workspaceId',${w},'generation',${gen},'proof',case when p_kind='device' then jsonb_build_object('kind','device','deviceId',${dev}) else jsonb_build_object('kind','recovery') end)`)};
 if p->'ok' is distinct from 'true'::jsonb then raise exception 'prepare_failed';end if;
 foreach section in array array['rosters','metadata'] loop
  cursor:=0;
  loop
   r:=${call('source',`jsonb_build_object('buildId',p->'buildId','section',section,'after',cursor)`)};
   if r->'ok' is distinct from 'true'::jsonb or (r->>'next')::bigint<cursor then raise exception 'source_failed';end if;
   cursor:=(r->>'next')::bigint;exit when (r->>'done')::boolean;
  end loop;
 end loop;
 m:=${json(manifest)}||jsonb_build_object('headHash',p_head_hash,'headSeq',p->'boundary'->'headSeq','operationCount',p->'boundary'->'headSeq',
  'rosterVersion',p->'boundary'->'rosterVersion','rosterHash',(select body_hash from public.device_roster where workspace_id=${w} and version=(p->'boundary'->>'rosterVersion')::integer),
  'lifecycleVersion',p->'boundary'->'lifecycleVersion','initialization',p->'boundary'->'initialization','proofKind',p_kind,'deviceId',case when p_kind='device' then to_jsonb(${dev}::uuid) else 'null'::jsonb end);
 r:=${call('finalize',`jsonb_build_object('buildId',p->'buildId','manifest',m)`)};
 if r->'ok' is distinct from 'true'::jsonb then raise exception 'finalize_failed';end if;
 return r;
end $open$;
create function pg_temp.d2_grant(p_challenge jsonb,p_kind text) returns jsonb language plpgsql security invoker set search_path='' as $grant$
declare signature bytea;r jsonb;
begin
 signature:=pgsodium.crypto_sign_detached(public._sha256(convert_to('goalloom/retrieval-proof/v1|'||public._canonical_json(p_challenge->'proofBody'),'UTF8')),case when p_kind='device' then ${f.sqlSecret('device')} else ${f.sqlSecret('recovery')} end);
 r:=${call('authorize',`jsonb_build_object('version',1,'challengeId',p_challenge->'proofBody'->'challengeId','signature',encode(signature,'hex'))`)};
 if r->'ok' is distinct from 'true'::jsonb then raise exception 'authorize_failed';end if;return r;
end $grant$;`)

 for(const method of methods)probe(`ACL ${method} service only`,expect(`has_function_privilege('service_role','public.service_retrieval_${method}(uuid,uuid,text,jsonb)','execute') and not has_function_privilege('authenticated','public.service_retrieval_${method}(uuid,uuid,text,jsonb)','execute') and not has_function_privilege('anon','public.service_retrieval_${method}(uuid,uuid,text,jsonb)','execute')`))
 probe('Private state and helper deny direct client/Storage bypass',expect(`not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='service_private' and c.relname like 'retrieval_%' and (has_table_privilege('authenticated',c.oid,'select,insert,update,delete') or has_table_privilege('anon',c.oid,'select,insert,update,delete'))) and not has_function_privilege('authenticated','service_private.retrieval_context(uuid,uuid,text,uuid)','execute')`))
 probe('Actual authenticated call cannot bypass trusted facade',`begin set local role authenticated;perform ${initialCall};raise exception 'direct_call_accepted';exception when insufficient_privilege then null;end;reset role;`)
 for(const flag of ['enabled','independent_ledger_ready','restore_admission_ready','cleanup_wiring_ready'])probe(`Readiness ${flag} closes retrieval admission`,`update service_private.lifecycle_policy set ${flag}=false where id=1;r:=${initialCall};${expect("r->>'error'='retrieval_configuration'")}${expect('(select count(*)=0 from service_private.retrieval_builds)')}`)
 for(const [name,req] of [['unknown field',{...initial,ownerId:f.user}],['missing target',{version:1,proof:{kind:'recovery'}}],['null target',{...initial,workspaceId:null}],['wrong proof shape',{...initial,proof:{kind:'recovery',deviceId:f.device}}]])probe(`Bootstrap rejects ${name}`,`r:=${call('prepare',req)};${expect("r->>'error'='invalid_request'")}`)
 probe('Live Auth session required before control',`delete from auth.sessions where id=${sid};r:=${initialCall};${expect("r->>'error'='authentication_failed'")}`)
 probe('Banned Auth identity cannot use retained control',`update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=${u};r:=${initialCall};${expect("r->>'error'='authentication_failed'")}`)
 probe('Foreign session cannot select owner',`r:=${call('prepare',initial,u,q(f.request))};${expect("r->>'error'='authentication_failed'")}`)
 probe('Wrong environment cannot choose another source',`r:=${call('prepare',initial,u,sid,"'production'")};${expect("r->'ok'='false'::jsonb")}`)
 probe('Subject UUID cannot replace live Auth UUID',`r:=${call('prepare',initial,subject)};${expect("r->>'error'='authentication_failed'")}`)
 probe('Unsupported compacted history is preserved',`update public.workspaces set min_retained_seq=1 where id=${w};update service_private.workspace_lifecycle set min_retained_seq=1 where workspace_id=${w};r:=${initialCall};${expect("r->>'reason'='unsupported_profile'")}${expect(`(select count(*)=1 from public.ops where workspace_id=${w})`)}`)
 probe('Actual extra checkpoint rejects a stale enrolled profile',`insert into public.recovery_checkpoints select workspace_id,2,body,rec_sig,dev_signer,dev_sig from public.recovery_checkpoints where workspace_id=${w};r:=${initialCall};${expect("r->>'reason'='unsupported_profile'")}`)
 probe('Actual extra envelope epoch rejects a stale enrolled profile',`insert into public.key_envelopes(workspace_id,epoch,recipient,ciphertext,signer_type,signer_device,roster_version,signature) select workspace_id,2,recipient,ciphertext,signer_type,signer_device,roster_version,signature from public.key_envelopes where workspace_id=${w};r:=${initialCall};${expect("r->>'reason'='unsupported_profile'")}`)
 probe('Missing original receipt refuses complete history',`delete from public.op_receipts where workspace_id=${w};r:=${initialCall};${expect("r->'ok'='true'::jsonb")}r:=${call('source',`jsonb_build_object('buildId',r->'buildId','section','metadata','after',0)`)};${expect("r->>'reason'='incomplete_history'")}`)
 probe('Missing log row refuses complete history',`delete from public.ops where workspace_id=${w};r:=${initialCall};${expect("r->>'reason'='incomplete_history'")}`)
 for(const [name,mutation] of [
  ['operation below first sequence',`update public.ops set seq=0 where workspace_id=${w};`],
  ['operation above fixed head',`update public.ops set seq=2 where workspace_id=${w};`],
  ['receipt below first sequence',`update public.op_receipts set seq=0 where workspace_id=${w};`],
  ['receipt above fixed head',`update public.op_receipts set seq=2 where workspace_id=${w};`],
  ['empty head with original operations',`update public.workspaces set head_seq=0 where id=${w};update service_private.workspace_lifecycle set head_seq=0 where workspace_id=${w};`],
  ['empty head with only an original receipt',`delete from public.ops where workspace_id=${w};update public.workspaces set head_seq=0 where id=${w};update service_private.workspace_lifecycle set head_seq=0 where workspace_id=${w};`],
 ])probe(`Complete copy refuses ${name}`,`${mutation}r:=${initialCall};${expect("r->>'reason'='integrity_failure'")}${expect('(select count(*)=0 from service_private.retrieval_challenges)')}`)
 probe('Blob-bearing history is preserved',`update public.ops set blob_refs=array[${q(f.request)}::uuid] where workspace_id=${w};r:=${initialCall};r:=${call('source',`jsonb_build_object('buildId',r->'buildId','section','metadata','after',0)`)};${expect("r->>'reason'='unsupported_profile'")}`)
 probe('Source cannot skip a metadata prefix',`r:=${initialCall};r:=${call('source',`jsonb_build_object('buildId',r->'buildId','section','metadata','after',1)`)};${expect("r->>'error'='invalid_request'")}`)
 probe('Repeated source page is stable and contains no task bytes',`c:=${initialCall};r:=${call('source',`jsonb_build_object('buildId',c->'buildId','section','metadata','after',0)`)};a:=${call('source',`jsonb_build_object('buildId',c->'buildId','section','metadata','after',0)`)};${expect("r->'rows'=a->'rows' and not(r->'rows'->0?'ciphertext') and r->'done'='true'::jsonb")}`)
 probe('Partial manifest source never creates a challenge',`r:=${initialCall};b:=(r->>'buildId')::uuid;r:=${call('finalize',`jsonb_build_object('buildId',b,'manifest',${json(manifest)})`)};${expect("r->>'reason'='incomplete_history'")}${expect('(select count(*)=0 from service_private.retrieval_challenges)')}`)
 probe('Final CAS rejects a boundary changed after both source sections',`r:=${initialCall};b:=(r->>'buildId')::uuid;r:=${call('source',`jsonb_build_object('buildId',b,'section','rosters','after',0)`)};r:=${call('source',`jsonb_build_object('buildId',b,'section','metadata','after',0)`)};update service_private.workspace_lifecycle set revision=revision+1 where workspace_id=${w};r:=${call('finalize',`jsonb_build_object('buildId',b,'manifest',${json(manifest)})`)};${expect("r->>'error'='retrieval_boundary_changed'")}${expect('(select count(*)=0 from service_private.retrieval_challenges)')}`)
 probe('Final CAS rejects an altered control commitment',`r:=${initialCall};b:=(r->>'buildId')::uuid;r:=${call('source',`jsonb_build_object('buildId',b,'section','rosters','after',0)`)};r:=${call('source',`jsonb_build_object('buildId',b,'section','metadata','after',0)`)};r:=${call('finalize',`jsonb_build_object('buildId',b,'manifest',${json({...manifest,checkpointHash:'a'.repeat(64)})})`)};${expect("r->>'reason'='integrity_failure'")}${expect('(select count(*)=0 from service_private.retrieval_challenges)')}`)
 probe('Recovery challenge canonical shape and five-minute fixed expiry',`${open}${expect("c->'proofBody'->'deviceId'='null'::jsonb and c->'proofBody'->>'challengeExpiresAt'='2030-01-02T00:05:00.123456Z' and c->'manifest'->'initialization'='null'::jsonb and octet_length(c::text)<=4194304")}`)
 probe('Wrong signature cannot consume challenge or mint grant',`${open}r:=${call('authorize',`jsonb_build_object('version',1,'challengeId',c->'proofBody'->'challengeId','signature',repeat('00',64))`)};${expect("r->>'error'='retrieval_proof_invalid'")}${expect('(select count(*)=0 from service_private.retrieval_capabilities)')}${grant}${expect("a->'ok'='true'::jsonb")}`)
 probe('Correct recovery key cannot reuse a different signature domain',`${open}r:=${call('authorize',`jsonb_build_object('version',1,'challengeId',c->'proofBody'->'challengeId','signature',encode(pgsodium.crypto_sign_detached(convert_to('goalloom/recover/v1|'||public._canonical_json(c->'proofBody'),'UTF8'),${f.sqlSecret('recovery')}),'hex'))`)};${expect("r->>'error'='retrieval_proof_invalid'")}`)
 probe('Recovery proof yields exact fixed ciphertext without normal service',`${open}${grant}r:=${read()};${expect(`r->'operations'->0->>'ciphertext'='01020304' and r->'operations'->0->>'payloadHash'=${q(f.operation.payloadHash)} and r->'done'='true'::jsonb and r->'nextAfterSeq'='1'::jsonb`)}`)
 probe('Capability stores digest only and authorization is one-time',`${open}${grant}${expect("(select token_hash=public._sha256(decode(a->>'capability','hex')) from service_private.retrieval_capabilities)")}r:=${call('authorize',`jsonb_build_object('version',1,'challengeId',c->'proofBody'->'challengeId','signature',repeat('00',64))`)};${expect("r->>'error'='retrieval_proof_invalid'")}`)
 probe('Device proof uses frozen authorized session key',`c:=pg_temp.d2_open('device',${q(f.headHash)});a:=pg_temp.d2_grant(c,'device');r:=${read()};${expect("r->'ok'='true'::jsonb")}`)
 probe('Device revocation invalidates existing capability',`c:=pg_temp.d2_open('device',${q(f.headHash)});a:=pg_temp.d2_grant(c,'device');update public.devices set status='revoked' where id=${dev};r:=${read()};${expect("r->>'error'='retrieval_proof_invalid'")}`)
 probe('Session removal invalidates existing capability',`${open}${grant}delete from auth.sessions where id=${sid};r:=${read()};${expect("r->>'error'='authentication_failed'")}`)
 probe('Cross-session continuation/capability cannot release bytes',`${open}${grant}r:=${call('read',`jsonb_build_object('version',1,'capability',a->'capability','afterSeq',0)`,u,q(f.otherSession))};${expect("r->>'error'='retrieval_proof_invalid'")}`)
 for(const cursor of ['null',"'0'",'-1','0.5','9007199254740992','2'])probe(`Read rejects cursor ${cursor}`,`${open}${grant}r:=${read(cursor)};${expect("r->>'error'='invalid_request'")}`)
 probe('Exact head returns empty terminal and repeated read is stable',`${open}${grant}r:=${read('1')};${expect("r->'operations'='[]'::jsonb and r->'done'='true'::jsonb and r->'nextAfterSeq'='1'::jsonb")}r:=${read()};h:=public._canonical_json(r->'operations');r:=${read()};${expect("public._canonical_json(r->'operations')=h")}`)
 probe('Verified legacy empty history is a complete empty copy',`delete from public.ops where workspace_id=${w};delete from public.op_receipts where workspace_id=${w};update public.workspaces set head_seq=0 where id=${w};update service_private.workspace_lifecycle set head_seq=0 where workspace_id=${w};c:=pg_temp.d2_open('recovery',${q(f.emptyHeadHash)});${grant}r:=${read()};${expect("r->'operations'='[]'::jsonb and r->'done'='true'::jsonb and c->'manifest'->'initialization'='null'::jsonb")}`)
 probe('Roster continuation retains challenge and fixed expiry',`${open}r:=${continuation()};${expect("r->'kind'='\"control\"'::jsonb and r->'manifestHash'=c->'manifestHash' and r->'rosterPage'->'done'='true'::jsonb")}r:=${continuation('1')};${expect("r->'rosterPage'->'rosters'='[]'::jsonb")}`)
 const extraRosters=f.extendedRosters(65)
 probe('Signed control chain uses 64-row contiguous pages',`insert into public.device_roster(workspace_id,version,roster,signer_type,signer_device,prev_hash,body_hash,signature) values ${extraRosters.map(r=>`(${w},${r.version},${json(r.roster)},'device',${dev},${q(r.roster.prevHash)},${q(r.hash)},${bytea(r.signature)})`).join(',')};update public.workspaces set roster_version=65 where id=${w};update service_private.workspace_lifecycle set roster_version=65 where workspace_id=${w};${open}${expect("jsonb_array_length(c->'rosterPage'->'rosters')=64 and c->'rosterPage'->'nextAfterRosterVersion'='64'::jsonb and c->'rosterPage'->'done'='false'::jsonb")}r:=${continuation('64')};${expect("jsonb_array_length(r->'rosterPage'->'rosters')=1 and r->'rosterPage'->'done'='true'::jsonb")}`)
 probe('Challenge expires at equality without consumption',`${open}${now('2030-01-02T00:05:00.123456Z')}r:=${continuation()};${expect("r->>'error'='retrieval_capability_expired'")}${expect('(select consumed_at is null from service_private.retrieval_challenges)')}`)
 probe('Capability expires at equality without extension',`${open}${grant}${now('2030-01-02T00:15:00.123456Z')}r:=${read()};${expect("r->>'error'='retrieval_capability_expired'")}`)
 probe('Exact retrieval cutoff materializes committed due fence',`${open}${grant}${now('2030-01-31T00:00:00.123456Z')}r:=${read()};${expect("r->>'error'='retrieval_closed'")}${expect(`(select state='queued' and closed_at=retrieve_until from service_private.workspace_lifecycle where workspace_id=${w})`)}`)
 probe('Lifecycle revision change invalidates frozen capability',`${open}${grant}update service_private.workspace_lifecycle set revision=revision+1 where workspace_id=${w};r:=${read()};${expect("r->>'error'='retrieval_boundary_changed'")}`)
 probe('Pre-cutoff qualification restores original generation and records cancellation',`update public.billing_accounts set trial_request=${q(f.request)},trial_started_at='2030-01-02T00:00:00.123456Z',trial_ends_at='2030-01-10T00:00:00.123456Z' where environment='development' and subject_id=${subject};r:=${initialCall};${expect("r->>'error'='retrieval_closed'")}${expect(`(select state='active' and generation=${gen} from service_private.workspace_lifecycle where workspace_id=${w})`)}${expect(`exists(select 1 from service_private.deletion_outbox where environment='development' and workspace_id=${w} and generation=${gen} and event_kind='ordinary_cancelled')`)}`)
 probe('Explicit deletion wins over a valid capability',`${open}${grant}update service_private.workspace_lifecycle set state='queued',reason='explicit_cloud',revision=revision+1 where workspace_id=${w};r:=${read()};${expect("r->>'error'='retrieval_closed'")}`)
 const seed=`update service_private.workspace_lifecycle set seed_required=true where workspace_id=${w};insert into service_private.initializations(workspace_id,generation,request_id,creator_device_id,final_op_id,final_seq,final_payload_hash,initial_envelopes,created_at) values(${w},${gen},${q(f.request)},${dev},${q(f.finalOp)},1,${q(f.operation.payloadHash)},'[]',clock_timestamp());`
 const suffixHash=sha(canonicalJson({workspaceId:f.workspace,generation:f.generation,headSeq:2,entries:[[1,f.finalOp,f.operation.payloadHash,1,1],[2,f.request,'a'.repeat(64),1,1]]}))
 probe('Missing seed initialization cannot downgrade to legacy',`update service_private.workspace_lifecycle set seed_required=true where workspace_id=${w};r:=${initialCall};${expect("r->>'reason'='integrity_failure'")}`)
 probe('Pending seed without final refuses an empty complete copy',`${seed}delete from public.ops where workspace_id=${w};delete from public.op_receipts where workspace_id=${w};update public.workspaces set head_seq=0 where id=${w};update service_private.workspace_lifecycle set head_seq=0 where workspace_id=${w};update service_private.initializations set final_seq=null,final_payload_hash=null where workspace_id=${w};r:=${initialCall};${expect("r->>'reason'='incomplete_history'")}`)
 probe('Pending valid final permits separate copy without finish',`${seed}${open}${grant}r:=${read()};${expect(`r->'ok'='true'::jsonb and c->'manifest'->'initialization'->>'creatorDeviceId'=${dev}`)}${expect(`(select completed_at is null from service_private.initializations where workspace_id=${w})`)}`)
 probe('Completed seed permits ordinary suffix',`${seed}update service_private.initializations set completed_at=clock_timestamp() where workspace_id=${w};insert into public.ops(workspace_id,seq,op_id,device_id,payload_hash,format_version,key_epoch,ciphertext) select workspace_id,2,${q(f.request)},device_id,repeat('a',64),1,1,decode('05','hex') from public.ops where workspace_id=${w} and seq=1;insert into public.op_receipts values(${w},${q(f.request)},repeat('a',64),2);update public.workspaces set head_seq=2 where id=${w};update service_private.workspace_lifecycle set head_seq=2 where workspace_id=${w};c:=pg_temp.d2_open('recovery',${q(suffixHash)});${grant}r:=${read()};${expect("r->'ok'='true'::jsonb and r->'nextAfterSeq'='2'::jsonb and jsonb_array_length(r->'operations')=2 and c->'manifest'->'initialization'->'finalSeq'='1'::jsonb")}`)
 probe('Pending seed cannot acquire a trailing suffix',`${seed}update public.workspaces set head_seq=2 where id=${w};update service_private.workspace_lifecycle set head_seq=2 where workspace_id=${w};r:=${initialCall};${expect("r->'ok'='false'::jsonb")}`)
 probe('Wrong final creator cannot issue a manifest',`${seed}update service_private.initializations set creator_device_id=${q(f.request)} where workspace_id=${w};r:=${initialCall};${expect("r->>'reason'='integrity_failure'")}`)
 probe('Missing next operation never becomes terminal success',`${open}${grant}delete from public.ops where workspace_id=${w};r:=${read()};${expect("r->>'reason'='incomplete_history'")}`)
 probe('Operation pages retain the 200-row bound before terminal head',`insert into public.ops(workspace_id,seq,op_id,device_id,payload_hash,format_version,key_epoch,ciphertext) select ${w},seq,gen_random_uuid(),${dev},repeat('d',64),1,1,decode('06','hex') from generate_series(2,201) seq;insert into public.op_receipts select workspace_id,op_id,payload_hash,seq from public.ops where workspace_id=${w} and seq>1;update public.workspaces set head_seq=201 where id=${w};update service_private.workspace_lifecycle set head_seq=201 where workspace_id=${w};c:=pg_temp.d2_open('recovery',repeat('e',64));${grant}r:=${read()};${expect("jsonb_array_length(r->'operations')=200 and r->'nextAfterSeq'='200'::jsonb and r->'done'='false'::jsonb")}r:=${read('200')};${expect("jsonb_array_length(r->'operations')=1 and r->'nextAfterSeq'='201'::jsonb and r->'done'='true'::jsonb")}`)
 probe('Byte-limited page is a contiguous short nonterminal prefix',`insert into public.ops(workspace_id,seq,op_id,device_id,payload_hash,format_version,key_epoch,ciphertext) select workspace_id,2,${q(f.request)},device_id,repeat('b',64),1,1,decode(repeat('ab',1048576),'hex') from public.ops where workspace_id=${w} and seq=1;update public.ops set ciphertext=decode(repeat('cd',1048576),'hex') where workspace_id=${w} and seq=1;insert into public.op_receipts values(${w},${q(f.request)},repeat('b',64),2);update public.workspaces set head_seq=2 where id=${w};update service_private.workspace_lifecycle set head_seq=2 where workspace_id=${w};c:=pg_temp.d2_open('recovery',repeat('c',64));${grant}r:=${read()};${expect("jsonb_array_length(r->'operations')=1 and r->'nextAfterSeq'='1'::jsonb and r->'done'='false'::jsonb and octet_length(r::text)<=4194304")}r:=${read('1')};${expect("r->'done'='true'::jsonb and r->'operations'->0->'seq'='2'::jsonb")}`)
 probe('Cleanup removes only exact generation derived authority',`${open}${grant}r:=service_private.cleanup_retrieval(${w},${q(f.request)},200);${expect("r->'builds'='0'::jsonb")}r:=service_private.cleanup_retrieval(${w},${gen},200);${expect("r->'remaining'='0'::jsonb")}${expect('(select count(*)=0 from service_private.retrieval_challenges) and (select count(*)=0 from service_private.retrieval_capabilities)')}`)
 const vectorSql=`do $vector$ declare c jsonb;begin delete from public.ops where workspace_id=${w};delete from public.op_receipts where workspace_id=${w};update public.workspaces set head_seq=0 where id=${w};update service_private.workspace_lifecycle set head_seq=0 where workspace_id=${w};c:=pg_temp.d2_open('recovery',${q(f.emptyHeadHash)});insert into d2_evidence values('proofVector',jsonb_build_object('body',c->'proofBody','canonical',public._canonical_json(c->'proofBody'),'digest',encode(public._sha256(convert_to('goalloom/retrieval-proof/v1|'||public._canonical_json(c->'proofBody'),'UTF8')),'hex')));end $vector$;`
 const resultSql=`select jsonb_build_object('checks',(select jsonb_agg(to_jsonb(c)-'position' order by position) from d2_checks c),'reviewedSchema',(select value from d2_evidence where key='schema'),'facades',(select value from d2_evidence where key='facades'),'database',(select value from d2_evidence where key='database'),'proofVector',(select value from d2_evidence where key='proofVector')) as acceptance;`
 const retrievalSql=sql.join('\n'),populatedSql=populatedD1FixtureSql(population)
 return {sql:`begin;${migrations.map(m=>m.sql).join('\n')}\n${retrievalSql}\n${vectorSql}\n${resultSql}\nrollback;`,retrievalSql,populatedSql,vectorSql,resultSql,fixtureIds:[f.user,population.user],checks:names}
}

const same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const sourceEntry=async(path)=>{const bytes=await readFile(path);return {path,sha256:sha(bytes),bytes:bytes.length}}
const boundedError=(stage,error)=>({stage,type:error?.name==='AssertionError'?'assertion_failed':'operation_failed',
 transportStatus:error?.message?.match(/HTTP \d{3}/)?.[0]??null,networkCode:typeof error?.cause?.code==='string'&&/^[A-Z0-9_]+$/.test(error.cause.code)?error.cause.code:null})
const planMaterial=plan=>({version:plan.version,project:plan.project,migrations:plan.migrations.map(({file,sha256,bytes})=>({file,sha256,bytes})),sources:plan.sources,d1Baseline:plan.d1Baseline,lifecycleManifest:plan.lifecycleManifest,parserAudit:plan.parserAudit})
async function exclusiveWrite(path,bytes){try{await writeFile(path,bytes,{flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error;assert((await readFile(path)).equals(Buffer.from(bytes)),'Immutable staged artifact differs')}}

export async function retrievalAuditInputs({lifecycleManifestPath=defaultLifecycleManifest}={}){
 const lifecycleManifest=await sourceEntry(lifecycleManifestPath),published=JSON.parse(await readFile(lifecycleManifestPath,'utf8'))
 assert(published.sourceOnly===true&&published.project==='asqyvcnxdltzzfutbbqy'&&published.sources?.length===2,'Expected the frozen lifecycle staging manifest')
 const migrations=[]
 for(const file of files){
  const prior=published.sources.find(s=>s.file===file),path=prior?.path??`supabase/migrations/${file}`,bytes=await readFile(path),sha256=sha(bytes)
  if(prior)assert(prior.sha256===sha256&&prior.bytes===bytes.length,'Frozen lifecycle bytes changed')
  migrations.push({file,sha256,bytes:bytes.length,content:bytes})
 }
 const evidence=JSON.parse(await readFile(evidencePath,'utf8'));assert(evidence.ok===true&&evidence.reviewedSchema,'Frozen D1 SQL evidence required')
 for(const entry of published.immutableD1){const actual=await sourceEntry(`supabase/migrations/${entry.file}`);assert.equal(actual.sha256,entry.sha256,'Immutable D1 source drift')}
 const sources=await Promise.all([...harness,...published.immutableD1.map(x=>`supabase/migrations/${x.file}`)].map(sourceEntry))
 const d1Baseline={...await sourceEntry(evidencePath),schemaSha256:sha(canonicalJson(evidence.reviewedSchema)),migrations:evidence.migrations.map(({file,sha256})=>({file,sha256}))}
 return {migrations,sources,d1Baseline,lifecycleManifest}
}
const auditInputIdentity=({migrations,sources,d1Baseline,lifecycleManifest})=>({migrations:migrations.map(({file,sha256,bytes})=>({file,sha256,bytes})),sources,d1Baseline,lifecycleManifest})
async function validateParserAudit(path,inputs){
 const entry=await sourceEntry(path),audit=JSON.parse(await readFile(path,'utf8'))
 assert(audit.version===1&&audit.ok===true&&audit.remoteExecuted===false&&audit.scope==='SQL and PL/pgSQL grammar only','Passing local grammar audit required')
 assert(same(audit.inputs,auditInputIdentity(inputs)),'Parser audit inputs differ from frozen review set')
 assert(audit.parser?.package==='pglast'&&audit.parser?.version==='v6.17'&&audit.dependencies?.length>0&&audit.reports?.length>0,'Parser dependency evidence missing')
 for(const dep of audit.dependencies){const actual=await sourceEntry(dep.path);assert(actual.sha256===dep.sha256&&actual.bytes===dep.bytes,'Parser dependency identity changed')}
 return entry
}
export async function createRetrievalPlan({lifecycleManifestPath=defaultLifecycleManifest,parserAuditPath}={}){
 assert(parserAuditPath,'Use --parser-audit <passing-audit.json> after the complete local grammar audit')
 const inputs=await retrievalAuditInputs({lifecycleManifestPath}),{migrations,sources,d1Baseline,lifecycleManifest}=inputs
 const parserAudit=await validateParserAudit(parserAuditPath,inputs)
 const plan={version:1,status:'FROZEN_SOURCES_REVIEW_REQUIRED',project:'asqyvcnxdltzzfutbbqy',sourceOnly:true,remoteExecuted:false,
  migrations:migrations.map(({file,sha256,bytes})=>({file,sha256,bytes})),sources,d1Baseline,lifecycleManifest,parserAudit,
  limits:LIMITS,rollbackOnly:true,requiresD1Baseline:true,catalogScope,
  runtimeObservability:{tables:RUNTIME_TABLES,sequences:'Only persistent sequences actually owned by these exact three existing tables. Every other sequence/config/business relation is mandatory stable.'},
  effectSafety:{touchedOldTables:TOUCHED_OLD_TABLES,required:'No enabled user trigger, owned persistent sequence or unsafe default on touched old tables; checked read-only before the write and again inside it.',
   callGraph:'Direct explicit UUID fixtures/ops/receipts only; six retrieval service facades, ensure_live_subject, cleanup_retrieval and qualification reconciliation. No ordinary push/register/recovery, control_events insert, persistent nextval, pg_net, Auth API, Storage API or external worker/ledger call. New D2 UUID outbox rows and temporary identity sequence remain transactional.'},
  fingerprintScope:'Hash-only persistent non-system tables/materialized views/sequences. Original-column projection validates staged subject re-key; policy.enabled and min_service_version are excluded only from that intermediate comparison and explicitly required false/2 after DDL. Full pre/post fingerprints include both. Vault encrypted base rows only.',
  requiredInvocation:'--run <this-plan.json> --reviewed-set <reviewedSetSha256> and D2_RETRIEVAL_WRITE_WINDOW=development after Root allocates the lease'}
 plan.reviewedSetSha256=sha(canonicalJson(planMaterial(plan)))
 const directory=`output/tests/billing/desktop/d2-retrieval/staging/${plan.reviewedSetSha256.slice(0,20)}`
 await mkdir(directory,{recursive:true})
 for(let i=0;i<migrations.length;i++){const path=`${directory}/${migrations[i].file}`;await exclusiveWrite(path,migrations[i].content);plan.migrations[i].path=path}
 plan.checks=buildRetrievalSql(migrations.map(m=>({...m,sql:m.content.toString('utf8')}))).checks
 const path=`${directory}/plan.json`;await exclusiveWrite(path,JSON.stringify(plan,null,2)+'\n')
 return {plan,path}
}
async function reviewedPlan(path,reviewedSet){
 const plan=JSON.parse(await readFile(path,'utf8'))
 assert(plan.version===1&&plan.project==='asqyvcnxdltzzfutbbqy'&&plan.rollbackOnly===true&&plan.remoteExecuted===false)
 assert(reviewedSet===plan.reviewedSetSha256&&sha(canonicalJson(planMaterial(plan)))===reviewedSet,'Root-reviewed set hash required')
 for(const entry of [...plan.sources,plan.d1Baseline,plan.lifecycleManifest,plan.parserAudit]){const actual=await sourceEntry(entry.path);assert(actual.sha256===entry.sha256&&actual.bytes===entry.bytes,'Reviewed harness/D1 evidence/audit changed')}
 const migrations=[]
 assert(same(plan.migrations.map(m=>m.file),files),'Exact 0025/0026/0027 order required')
 for(const entry of plan.migrations){const bytes=await readFile(entry.path);assert(sha(bytes)===entry.sha256&&bytes.length===entry.bytes,'Reviewed staged SQL changed');migrations.push({...entry,sql:bytes.toString('utf8')})}
 await validateParserAudit(plan.parserAudit.path,{...plan,migrations})
 return {plan,migrations,evidence:JSON.parse(await readFile(plan.d1Baseline.path,'utf8'))}
}
const readOnly=sql=>`begin read only;set local timezone='UTC';set local datestyle='ISO,YMD';set local statement_timeout='45000ms';set local lock_timeout='3000ms';${sql}\ncommit;`
async function snapshot(db,tables){
 const query=`select jsonb_build_object('catalog',(select fingerprints from (${catalogSql.replace(/;$/,'')}) c),'business',(select fingerprints from (${businessSql(tables).replace(/;$/,'')}) b)) as snapshot;`
 const result=(await db.query(readOnly(query))).find(r=>r.snapshot)?.snapshot;assert(result?.catalog&&result.business,'Missing hash-only state snapshot')
 assert([...Object.values(result.catalog),...Object.values(result.business)].every(x=>x.capped===false),'Fingerprint scope exceeds bounded gate limits')
 return result
}
const digestState=(s,tables)=>({catalog:sha(canonicalJson(s.catalog)),...Object.fromEntries(Object.entries(selectSummary(splitBusiness(s.business,tables).stable)).map(([key,value])=>[key,sha(canonicalJson(value))]))})
const changedKeys=(a,b)=>[...new Set([...Object.keys(a),...Object.keys(b)])].filter(key=>!same(a[key]??null,b[key]??null))
const markersSql="select to_regclass('service_private.account_lifecycle') is not null or to_regclass('service_private.deletion_requests') is not null or to_regclass('service_private.retrieval_builds') is not null as d2_present;"

export async function runRetrievalSql({planPath,reviewedSetSha256,adapter}={}){
 const directory=adapter?.directory??'output/tests/billing/desktop/d2-retrieval',resultPath=`${directory}/sql-acceptance.json`
 const attempt=randomUUID(),applicationName=`d2-rollback:${attempt}`,attemptPath=`${directory}/attempts/${attempt}.json`
 const report={ok:false,attempt,rollbackRequested:true,writeRequests:0,checks:[],stages:[],errors:[],planPath,
  scope:adapter?.scope??'Populated D1 to D2 development PostgreSQL rollback only. Exact frozen25/26/27, synthetic D1 financial/unknown operation/AI facts and73retained-retrieval probes. No28, worker, ledger, provider, Auth API, Storage, model or production acceptance.',
  platform:{node:process.version,os:process.platform,cpu:process.arch},limits:LIMITS,realProviderCalls:0,realModelCalls:0}
 await mkdir(`${directory}/attempts`,{recursive:true})
 let stage='reviewed-source',db,tables,before,prepared,gate,expectedSchema
 try{
  assert.equal(process.env[adapter?.windowEnv??'D2_RETRIEVAL_WRITE_WINDOW'],'development','Root must allocate the exact development transaction lease')
  assert(planPath&&/^[0-9a-f]{64}$/.test(reviewedSetSha256??''),'Explicit reviewed plan/set required')
  const reviewed=await(adapter?.reviewPlan??reviewedPlan)(planPath,reviewedSetSha256),{plan,migrations,evidence}=reviewed
  report.reviewedSetSha256=reviewedSetSha256;report.migrations=migrations.map(({file,path,sha256,bytes})=>({file,path,sha256,bytes}));expectedSchema=evidence.reviewedSchema
  if(plan.probeGroups)report.probeGroups=plan.probeGroups
  prepared=(adapter?.prepare??buildRetrievalSql)(migrations);assert(same(prepared.checks,plan.checks),'Reviewed scenario set changed')
  report.syntheticFixtureIds=prepared.fixtureIds
  await writeFile(attemptPath,JSON.stringify(report,null,2)+'\n')
  stage='D1-baseline';db=await client()
  const history=await d1Migrations(db);assert(history.every(m=>m.installed),'All frozen D1 migrations must already be installed')
  assert(same(history.map(({file,sha256})=>({file,sha256})),plan.d1Baseline.migrations),'D1 migration history/source drift')
  report.d1HistoryMatched=true;assert(same(await d1Snapshot(db),expectedSchema),'Frozen D1 schema/ACL drift');report.d1SchemaMatched=true
  assert(!(await db.query(markersSql))[0].d2_present,'D2 or partial D2 is already installed')
  assert(Number((await db.query("select count(*) as n from pg_stat_activity where application_name like 'd2-rollback:%' and state<>'idle'"))[0].n)===0,'Previous gate transaction remains active')
  tables=validateInventory(await db.query(readOnly(inventorySql)))
  if(adapter?.attestInventory){const attested=await adapter.attestInventory(db,tables);tables=attested.tables;report.runtimeInventoryProofBefore=attested.proof;report.runtimeSequenceObservationsBefore=attested.observations}
  report.effectSafety=(await db.query(readOnly(safetySql))).find(r=>r.safety)?.safety
  assert(report.effectSafety&&Object.values(report.effectSafety).every(value=>Array.isArray(value)&&value.length===0),'Unexpected trigger, persistent sequence or default effect on touched old tables')
  before=await snapshot(db,tables);report.before=digestState(before,tables)
  report.runtimeScope=tables.filter(isRuntime).map(t=>({name:`${t.schema}.${t.name}`,ownedBy:t.owned_by??null,...t.runtime_sequence?{extensionProof:t.runtime_sequence}:{}}))
  report.runtimeObservationsBefore=splitBusiness(before.business,tables).runtime
  stage='populated-rollback-transaction';report.writeRequests=1;report.operationOutcome='unknown'
  await writeFile(attemptPath,JSON.stringify(report,null,2)+'\n')
  const response=await db.query(gateSql({migrations,prepared,tables,applicationName}),false)
  gate=response.find(r=>r.populated_gate)?.populated_gate;assert(gate?.stages,'Missing transaction stage evidence')
  report.stages=gate.stages;report.operationOutcome='response_received'
  if(gate.acceptance)Object.assign(report,gate.acceptance)
  report.insideBaselineMatched=!!gate.catalogBefore&&!!gate.businessBefore&&same(before.catalog,gate.catalogBefore)&&same(splitBusiness(before.business,tables).stable,splitBusiness(gate.businessBefore,tables).stable)
  report.populatedRekeyPreserved=!!gate.populatedBefore&&!!gate.forwardBusiness&&same(gate.populatedBefore,gate.forwardBusiness)
  report.inboxRouting=gate.inboxRoutes??null
  report.inboxRouteViolations=gate.inboxRouteViolations??null
  report.forwardChanges=gate.populatedBefore&&gate.forwardBusiness?changedKeys(gate.populatedBefore,gate.forwardBusiness):null
  if(report.proofVector){report.canonicalBytesMatch=canonicalJson(report.proofVector.body)===report.proofVector.canonical;report.proofDigestMatch=sha(`goalloom/retrieval-proof/v1|${canonicalJson(report.proofVector.body)}`)===report.proofVector.digest}
 }catch(error){report.errors.push(boundedError(stage,error))}
 finally{
  if(db){
   try{
    const active=(await db.query(`select count(*) as n from pg_stat_activity where application_name=${q(applicationName)} and state<>'idle'`))[0].n
    report.activeGateTransactions=Number(active)
    tables??=validateInventory(await db.query(readOnly(inventorySql)))
    if(adapter?.attestInventory){
     report.runtimeInventoryProofMatched=false
     try{const attested=await adapter.attestInventory(db,tables);tables=attested.tables;report.runtimeInventoryProofAfter=attested.proof;report.runtimeSequenceObservationsAfter=attested.observations;report.runtimeInventoryProofMatched=same(report.runtimeInventoryProofBefore,attested.proof)}
     catch(error){report.errors.push(boundedError('independent-runtime-sequence-proof',error))}
    }
    const after=await snapshot(db,tables);report.after=digestState(after,tables)
    report.logicalCatalogRestored=!!before&&same(before.catalog,after.catalog);report.stableBusinessRestored=!!before&&same(splitBusiness(before.business,tables).stable,splitBusiness(after.business,tables).stable)
    report.catalogChanges=before?changedKeys(before.catalog,after.catalog):null;report.stableBusinessChanges=before?changedKeys(splitBusiness(before.business,tables).stable,splitBusiness(after.business,tables).stable):null
    report.runtimeObservationsAfter=splitBusiness(after.business,tables).runtime
    report.backgroundRuntimeChanges=before?changedKeys(splitBusiness(before.business,tables).runtime,report.runtimeObservationsAfter):null
    report.d2Absent=!(await db.query(markersSql))[0].d2_present
    report.d1SchemaRestored=!!expectedSchema&&same(await d1Snapshot(db),expectedSchema)
    report.d1HistoryRestored=!!report.d1HistoryMatched&&(await d1Migrations(db)).every(m=>m.installed)
    if(prepared){const ids=prepared.fixtureIds.map(q).join(',');report.fixturesAbsent=(await db.query(`select not exists(select 1 from auth.users where id in (${ids})) and not exists(select 1 from auth.sessions where user_id in (${ids})) and not exists(select 1 from public.devices where user_id in (${ids})) and not exists(select 1 from public.workspaces where user_id in (${ids})) as absent`))[0].absent}
    report.rollbackVerified=report.writeRequests===1&&Number(active)===0&&report.logicalCatalogRestored&&report.stableBusinessRestored&&report.d2Absent&&report.d1SchemaRestored&&report.d1HistoryRestored&&report.fixturesAbsent&&(!adapter?.attestInventory||report.runtimeInventoryProofMatched===true)
    report.restorationScope='Stable scope restored only when all mandatory comparisons pass; background runtime observations may differ. No all-state equality claim.'
    if(report.rollbackVerified&&report.operationOutcome==='unknown')report.operationOutcome='rollback_verified_without_result'
   }catch(error){report.errors.push(boundedError('independent-read-only-postflight',error));report.rollbackVerified=false}
  }
 }
 report.ok=report.errors.length===0&&report.stages.length===(adapter?.stageCount??10)&&report.stages.every(x=>x.ok)&&report.checks.length===prepared?.checks.length&&report.checks.every(x=>x.ok)&&report.insideBaselineMatched&&report.populatedRekeyPreserved&&report.canonicalBytesMatch&&report.proofDigestMatch&&report.rollbackVerified
 report.evidence=attemptPath
 await writeFile(attemptPath,JSON.stringify(report,null,2)+'\n')
 // Every attempt remains immutable evidence even when this latest-result pointer changes.
 try{const prior=await readFile(resultPath);await exclusiveWrite(`${directory}/attempts/prior-${sha(prior).slice(0,20)}.json`,prior)}catch(error){if(error.code!=='ENOENT')throw error}
 await writeFile(resultPath,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({ok:report.ok,operationOutcome:report.operationOutcome??'not_started',writeRequests:report.writeRequests,checks:report.checks.length,failedStages:report.stages.filter(x=>!x.ok),failedChecks:report.checks.filter(x=>!x.ok).map(x=>({name:x.name,state:x.state})),rollbackVerified:report.rollbackVerified??false,evidence:attemptPath,errors:report.errors}))
 if(!report.ok)process.exitCode=1;return report
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),mode=args[0]??'--plan',flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
 assert(['--plan','--run'].includes(mode),'Use --plan or --run <plan> --reviewed-set <hash>')
 if(mode==='--run')await runRetrievalSql({planPath:args[1],reviewedSetSha256:flag('--reviewed-set')})
 else{const {plan,path}=await createRetrievalPlan({lifecycleManifestPath:flag('--lifecycle-manifest')??defaultLifecycleManifest,parserAuditPath:flag('--parser-audit')});console.log(JSON.stringify({ready:true,remoteExecuted:false,status:plan.status,plan:path,reviewedSetSha256:plan.reviewedSetSha256,parserAudit:plan.parserAudit,checks:plan.checks.length,migrations:plan.migrations,limits:LIMITS,rollbackOnly:true}))}
}
