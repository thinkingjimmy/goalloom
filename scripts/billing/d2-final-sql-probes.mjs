/**
 * [INPUT]: Installed final 0025–0028 candidates, pg_temp.d2_check and existing signed retrieval fixture builders.
 * [OUTPUT]: Additional isolated rollback SQL probes, ordered check names and exact synthetic Auth UUIDs.
 * [POS]: Final lifecycle SQL supplement; no remote execution, operational drain proof or external ledger/Auth/Storage claim.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {retrievalFixture,retrievalIdentitySql,q,json,sha} from './d2-retrieval-fixtures.mjs'
import {randomBytes,randomUUID} from 'node:crypto'

const check=condition=>`if (${condition}) is distinct from true then raise exception 'final_probe_assertion';end if;`
const rejects=(expression,message)=>`begin perform ${expression};raise exception 'expected_rejection_missing';exception when raise_exception then if sqlerrm<>${q(message)} then raise;end if;end;`
const rejectsState=(statement,state)=>`begin ${statement}raise exception 'expected_rejection_missing';exception when sqlstate ${q(state)} then null;end;`
const owner=f=>q(f.user),workspace=f=>q(f.workspace),generation=f=>q(f.generation)
const scope=f=>`where environment='development' and workspace_id=${workspace(f)} and generation=${generation(f)}`
const subject=f=>`(select subject_id from service_private.account_lifecycle where environment='development' and user_id=${owner(f)})`
const args=f=>`'development',${workspace(f)},${generation(f)},rev,lease_token`
const path=f=>`workspaces/${f.workspace}/${f.generation}/1.bin`
const producer=sha('final-sql-controlled-producer-v1')
const base=f=>`${retrievalIdentitySql(f).replace('select service_private.ensure_live_subject(','perform service_private.ensure_live_subject(')}
 perform set_config('request.jwt.claims',${q(JSON.stringify({sub:f.user,role:'authenticated',session_id:f.session,iss:'https://asqyvcnxdltzzfutbbqy.supabase.co/auth/v1'}))},true);
 perform set_config('request.headers','{"x-goalloom-service-version":"2"}',true);
 select subject_id into s from service_private.account_lifecycle where environment='development' and user_id=${owner(f)};
 ${bindScope([f])}`
function bindScope(fixtures,{expired=false,incomplete=false}={}){
 const id=randomUUID(),secret=randomBytes(32).toString('hex'),ids=fixtures.map(owner).join(',')
 const subjects=`select jsonb_agg(jsonb_build_object('subjectId',scope_account.subject_id,'ownerId',scope_owner.owner_id,'ownerTag',encode(scope_account.owner_tag,'hex')) order by scope_owner.owner_id)
  from service_private.account_lifecycle scope_account join (values ${fixtures.map(f=>`(${owner(f)}::uuid)`).join(',')}) scope_owner(owner_id) on scope_account.owner_tag=service_private.owner_tag(scope_owner.owner_id) where scope_account.environment='development'`
 const manifest=`jsonb_build_object('version',1,'environment','development','projectRef','asqyvcnxdltzzfutbbqy','subjects',(${subjects}),
  'targets',${incomplete?`'[]'::jsonb`:`(select coalesce(jsonb_agg(jsonb_build_object('subjectId',scope_target.subject_id,'workspaceId',scope_target.workspace_id,'generation',scope_target.generation) order by scope_target.workspace_id),'[]'::jsonb) from service_private.workspace_lifecycle scope_target join service_private.account_lifecycle scope_account on scope_account.subject_id=scope_target.subject_id where scope_target.environment='development' and scope_account.user_id in (${ids}))`},
  'devices',${incomplete?`'[]'::jsonb`:`(select coalesce(jsonb_agg(jsonb_build_object('deviceId',scope_device.id,'ownerId',scope_device.user_id,'sessionId',scope_device.auth_session_id) order by scope_device.id),'[]'::jsonb) from public.devices scope_device where scope_device.user_id in (${ids}))`},'trialTags','[]'::jsonb)`
 return `insert into service_private.worker_scopes(id,secret_digest,manifest,created_at,expires_at)
  values(${q(id)},pg_catalog.sha256(decode(${q(secret)},'hex')),${manifest},clock_timestamp()-interval '${expired?'2 hours':'1 second'}',clock_timestamp()+interval '${expired?'-1 hour':'1 hour'}');
  perform set_config('request.headers',${q(JSON.stringify({'x-goalloom-service-version':'2','x-goalloom-lifecycle-scope':`${id}.${secret}`}))},true);`
}
function prepareDeletion(f,type='cloud'){
 return `select ${type==='cloud'?'l.revision':'a.revision'} into rev from ${type==='cloud'?`service_private.workspace_lifecycle l ${scope(f)}`:`service_private.account_lifecycle a where a.environment='development' and a.subject_id=${subject(f)}`};
 r:=public.lifecycle_prepare_delete(jsonb_build_object('version',1,'requestId',${q(f.request)},'scope',${q(type)},'target',${type==='cloud'?`jsonb_build_object('workspaceId',${workspace(f)},'generation',${generation(f)})`:`'null'::jsonb`},'expectedRevision',rev,'receiptDigest',${q(f.receiptDigest)}));
 ${check(`r->>'requestId'=${q(f.request)} and not(r?'error')`)}`
}
const confirmDeletion=f=>`
 r:=public.lifecycle_confirm_delete(jsonb_build_object('version',1,'requestId',${q(f.request)},'expectedRevision',rev,'acknowledge',true));
 ${check("r->'accepted'='true'::jsonb")}`
const deletion=(f,type='cloud')=>prepareDeletion(f,type)+confirmDeletion(f)
// Controlled SQL ledger acknowledgements exercise database fencing only. They
// do not establish independent persistent-ledger or hosted Storage evidence.
const ackAndLease=f=>`
 work:=public.lifecycle_take_work('development',5);
 for e in select o.event_id,o.lease,o.digest from service_private.deletion_outbox o where o.environment='development' and o.subject_id=${subject(f)} and o.event_kind='intent' and o.acknowledged_at is null loop
  r:=public.lifecycle_ack_export('development',e.event_id,e.lease,e.digest,'controlled-sql-ledger',e.event_id::text);${check("r->'ok'='true'::jsonb")}
 end loop;
 select l.revision,l.lease into rev,lease_token from service_private.workspace_lifecycle l ${scope(f)};
 ${check('lease_token is not null')}
 r:=public.lifecycle_prepare_job(${args(f)});${check("r->>'phase'='inventory'")}
 r:=public.lifecycle_inventory_page(${args(f)},'[]'::jsonb,null,true);${check("r->'ok'='true'::jsonb")}
 r:=public.lifecycle_delete_batch(${args(f)});${check("r->'ok'='true'::jsonb")}`
const emptyScan=f=>`r:=public.lifecycle_storage_scan_page(${args(f)},'[]'::jsonb,null,true);${check("r->'ok'='true'::jsonb")}`
const purge=f=>`for i in 1..32 loop r:=public.lifecycle_purge_content(${args(f)});exit when r->>'phase'='deleted';end loop;${check("r->>'phase'='deleted'")}`
function transfer(f,method='upload',dispatch=false){return `
 update service_private.policy set enabled=true where id=1;
 update public.billing_accounts set trial_request=${q(f.request)},trial_started_at='2030-01-02T00:00:00.123456Z',trial_ends_at='2030-01-10T00:00:00.123456Z' where environment='development' and subject_id=${subject(f)};
 perform service_private.reconcile_lifecycle_locked(${subject(f)},'development',service_private.lifecycle_now('development',${subject(f)}));
 insert into public.snapshots(workspace_id,upto_seq,format_version,key_epoch,object_path,sha256,size,state,created_by)
 values(${workspace(f)},1,1,1,${q(path(f))},${q(sha('opaque-snapshot-fixture'))},4,'published',${q(f.device)});
 r:=public.lifecycle_transfer_begin(${q(f.device)},${workspace(f)},${generation(f)},1,${q(path(f))},${q(method)},${q(producer)});
 ticket:=(r->>'ticketId')::uuid;${check('ticket is not null')}
 ${dispatch?`r:=public.lifecycle_transfer_dispatch(ticket);${check("r->'ok'='true'::jsonb and r->'current'='true'::jsonb")}`:''}`}
const drainPolicy=(hash=producer)=>`update service_private.transfer_drain_policy set verified=true,producer_sha256=${q(hash)},producer_max_seconds=1,storage_max_seconds=1,evidence_reference='controlled-sql-operational-proof',verified_at=clock_timestamp() where id=1;`
const pastUpload=`update service_private.cloud_transfers set created_at=clock_timestamp()-interval '3 seconds' where ticket_id=ticket;`
const transferClosed=(f,method='upload',dispatch=true)=>`${base(f)}${transfer(f,method,dispatch)}${deletion(f)}${ackAndLease(f)}`
const finalNoObject=f=>`r:=public.lifecycle_object_result(${args(f)},${q(path(f))},true);${check("r->'ok'='true'::jsonb")}`
const keyHash=`select encode(pg_catalog.sha256(key),'hex') into key_hash from service_private.lifecycle_keys where id=1;`
const restoreBegin=(f,through='1')=>`${keyHash}r:=public.lifecycle_restore_begin('development',${q(`sql-final-${f.user}`)},${q(through)},key_hash);run:=(r->>'runId')::uuid;${check('run is not null')}`
const eventPayload=f=>`select o.record into payload from service_private.deletion_outbox o where o.environment='development' and o.workspace_id=${workspace(f)} and o.generation=${generation(f)} and o.event_kind='intent';${check('payload is not null')}`
const entry=`digest:=encode(pg_catalog.sha256(convert_to(public._canonical_json(payload),'UTF8')),'hex');entry:=jsonb_build_object('cursor','1','eventId',payload->'eventId','digest',digest,'record',payload);`
const capture=f=>`public.lifecycle_restore_capture(run,${q(`sql-final-${f.user}`)},'0',jsonb_build_array(entry))`
const restoreComplete=`for i in 1..8 loop r:=public.lifecycle_restore_project(run);exit when r->>'phase'='replayed';${check("r->>'phase'='project'")}end loop;${check("r->>'phase'='replayed'")}`
const immutableFacts=`jsonb_build_object('financial',(select encode(pg_catalog.sha256(convert_to(coalesce(string_agg(to_jsonb(financial_fact)::text,'' order by environment,invoice_id),''),'UTF8')),'hex') from public.billing_transactions financial_fact),'ai',(select encode(pg_catalog.sha256(convert_to(coalesce(string_agg(to_jsonb(action_fact)::text,'' order by environment,subject_id,action_id),''),'UTF8')),'hex') from public.ai_actions action_fact))`
const backupIdentity=f=>`
 select to_jsonb(account_row) into backup_account from service_private.account_lifecycle account_row where environment='development' and subject_id=s;
 select to_jsonb(workspace_row) into backup_workspace from service_private.workspace_lifecycle workspace_row ${scope(f)};
 select jsonb_agg(to_jsonb(session_row) order by session_row.id) into backup_sessions from auth.sessions session_row where session_row.user_id=${owner(f)};`
// Restore only rows owned by this probe from their actual pre-confirm snapshots.
// The confirmation record remains in memory as the independent replay input.
const restoreIdentity=f=>`
 delete from service_private.deletion_outbox where environment='development' and subject_id=s;
 delete from service_private.deletion_requests where environment='development' and request_id=${q(f.request)} and subject_id=s;
 delete from service_private.workspace_lifecycle ${scope(f)};
 insert into service_private.workspace_lifecycle select * from jsonb_populate_record(null::service_private.workspace_lifecycle,backup_workspace);
 update service_private.account_lifecycle set state=backup_account->>'state',user_id=(backup_account->>'user_id')::uuid,
  revision=(backup_account->>'revision')::bigint,confirmed_at=(backup_account->>'confirmed_at')::timestamptz,
  online_delete_by=(backup_account->>'online_delete_by')::timestamptz,delete_request_id=(backup_account->>'delete_request_id')::uuid,
  provider_user_id=(backup_account->>'provider_user_id')::uuid,provider_identity_until=(backup_account->>'provider_identity_until')::timestamptz,
  work_retry_at=(backup_account->>'work_retry_at')::timestamptz,work_lease=(backup_account->>'work_lease')::uuid,
  work_lease_until=(backup_account->>'work_lease_until')::timestamptz,work_attempts=(backup_account->>'work_attempts')::integer
  where environment='development' and subject_id=s;
 delete from auth.sessions where user_id=${owner(f)} and id in (${q(f.session)},${q(f.otherSession)});
 insert into auth.sessions select * from jsonb_populate_recordset(null::auth.sessions,backup_sessions);
 update public.billing_accounts set test_now='2030-01-03T00:00:00.123456Z' where environment='development' and subject_id=s;`
const receiptAssertions=(f,type)=>`
 ${check(`(select scope=${q(type)} and receipt_digest=decode(${q(f.receiptDigest)},'hex') and receipt_digest<>decode(repeat('00',32),'hex')
  and prepared_at=(payload->'deletionReceipt'->>'preparedAt')::timestamptz and prepare_expires_at=prepared_at+interval '24 hours'
  and confirmed_at=(payload->'deletionReceipt'->>'confirmedAt')::timestamptz and online_delete_by=confirmed_at+interval '168 hours'
  and status_expires_at=confirmed_at+interval '720 hours' and intent='durable' from service_private.deletion_requests where environment='development' and request_id=${q(f.request)})`)}
 r:=public.lifecycle_receipt_status('development',${q(f.request)},${q(f.receiptDigest)});
 ${check(`r->'accepted'='true'::jsonb and r->>'scope'=${q(type)} and r->>'confirmedAt'=payload->'deletionReceipt'->>'confirmedAt'
  and (r->>'onlineDeleteBy')::timestamptz=(payload->'deletionReceipt'->>'confirmedAt')::timestamptz+interval '168 hours'
  and (r->>'statusExpiresAt')::timestamptz=(payload->'deletionReceipt'->>'confirmedAt')::timestamptz+interval '720 hours'`)}
 update public.billing_accounts set test_now=(select status_expires_at from service_private.deletion_requests where environment='development' and request_id=${q(f.request)}) where environment='development' and subject_id=s;
 r:=public.lifecycle_receipt_status('development',${q(f.request)},${q(f.receiptDigest)});${check("r->>'error'='deletion_receipt_unavailable'")}`

export function buildFinalSqlProbes(){
 const sql=[],checks=[],fixtureIds=[]
 const fresh=()=>{const f=retrievalFixture();f.receiptDigest=sha(randomBytes(32));fixtureIds.push(f.user);return f}
 const probe=(name,f,body)=>{checks.push(name);sql.push(`select pg_temp.d2_check(${q(name)},${q(`do $final_probe$ declare r jsonb;a jsonb;b jsonb;c jsonb;work jsonb;payload jsonb;entry jsonb;budget jsonb;backup_account jsonb;backup_workspace jsonb;backup_request jsonb;backup_sessions jsonb;e record;s uuid;ticket uuid;lease_token uuid;run uuid;rev bigint;i integer;key_hash text;digest text;begin ${body} end $final_probe$;`)});`)}

 {const f=fresh();probe('Final ACL private state/helpers and cleanup/restore service facades',f,`
 ${check(`not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='service_private' and c.relname in ('restore_runs','restore_events','transfer_drain_policy','cloud_transfers','deletion_requests','worker_access','worker_scopes') and (has_table_privilege('authenticated',c.oid,'select,insert,update,delete') or has_table_privilege('anon',c.oid,'select,insert,update,delete') or has_table_privilege('service_role',c.oid,'select,insert,update,delete')))`)}
 ${check(`not exists(select 1 from pg_proc p where p.pronamespace='service_private'::regnamespace and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute')))`)}
 ${check(`not exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('lifecycle_reconcile_transfers','lifecycle_purge_content','lifecycle_restore_begin','lifecycle_restore_capture','lifecycle_restore_project','lifecycle_restore_status','lifecycle_cleanup_retention','lifecycle_scope_check') and (not has_function_privilege('service_role',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute')))`)}
 `)}
 for(const violation of ['missing','incorrect-secret','expired','revoked','incomplete-owned-manifest']){
  const f=fresh();probe(`Development worker scope rejects ${violation} capability before mutation`,f,`${base(f)}
   ${violation==='missing'?`perform set_config('request.headers','{"x-goalloom-service-version":"2"}',true);`:violation==='incorrect-secret'?`perform set_config('request.headers',jsonb_set(current_setting('request.headers')::jsonb,'{x-goalloom-lifecycle-scope}',to_jsonb(split_part(current_setting('request.headers')::jsonb->>'x-goalloom-lifecycle-scope','.',1)||'.'||repeat('00',32)))::text,true);`:violation==='expired'?bindScope([f],{expired:true}):violation==='revoked'?`update service_private.worker_scopes set revoked_at=clock_timestamp() where id=split_part(current_setting('request.headers')::jsonb->>'x-goalloom-lifecycle-scope','.',1)::uuid;`:bindScope([f],{incomplete:true})}
   ${rejects(`public.lifecycle_scope_check('development',s,${workspace(f)},${generation(f)},${owner(f)})`,violation==='missing'?'worker_scope_required':violation==='incomplete-owned-manifest'?'worker_scope_denied':'worker_scope_invalid')}
   ${violation==='incomplete-owned-manifest'?'':rejects("public.lifecycle_take_work('development',1)",violation==='missing'?'worker_scope_required':'worker_scope_invalid')}
   ${check(`exists(select 1 from public.ops where workspace_id=${workspace(f)}) and (select state='retained' from service_private.workspace_lifecycle ${scope(f)})`)}`)
 }
 {const f=fresh(),other=fresh();const foreignState=`jsonb_build_object(
  'account',(select to_jsonb(foreign_account) from service_private.account_lifecycle foreign_account where environment='development' and subject_id=${subject(other)}),
  'workspace',(select to_jsonb(foreign_workspace) from service_private.workspace_lifecycle foreign_workspace ${scope(other)}),
  'exports',(select jsonb_agg(to_jsonb(foreign_export) order by event_id) from service_private.deletion_outbox foreign_export where environment='development' and subject_id=${subject(other)}),
  'billing',(select to_jsonb(foreign_billing) from public.billing_accounts foreign_billing where environment='development' and subject_id=${subject(other)}),
  'inbox',(select jsonb_agg(to_jsonb(foreign_inbox) order by provider,event_id) from public.billing_inbox foreign_inbox where environment='development' and subject_id=${subject(other)}))`
 probe('Valid worker capability denies a foreign synthetic subject',f,`${base(other)}${deletion(other,'account')}${base(f)}${deletion(f)}
  update service_private.workspace_lifecycle set next_due_at='2000-01-01T00:00:00Z' ${scope(other)};
  update service_private.account_lifecycle set work_retry_at='2000-01-01T00:00:00Z' where environment='development' and subject_id=${subject(other)};
  update public.billing_accounts set reconcile_at='2000-01-01T00:00:00Z' where environment='development' and subject_id=${subject(other)};
  insert into public.billing_inbox(environment,provider,event_id,event_type,subject_id,occurred_at,status,retry_at)
   values('development','stripe',${q(`evt_SQLFinal${other.user.replaceAll('-','')}`)},'invoice.paid',${subject(other)},clock_timestamp(),'pending','2000-01-01T00:00:00Z');
  a:=${foreignState};
  ${rejects(`public.lifecycle_scope_check('development',${subject(other)},${workspace(other)},${generation(other)},${owner(other)})`,'worker_scope_denied')}
  ${rejects(`public.lifecycle_reconcile_transfers('development',${workspace(other)},${generation(other)},1,${q(other.request)})`,'worker_scope_denied')}
  work:=public.lifecycle_take_work('development',5);
  ${check(`exists(select 1 from jsonb_array_elements(work->'generations') own_work where own_work->>'subjectId'=s::text)
   and not exists(select 1 from jsonb_array_elements((work->'exports')||(work->'generations')||(work->'accounts')) claimed where coalesce(claimed->>'subjectId',claimed->'record'->>'subjectId')=${subject(other)}::text) and a=${foreignState}`)}
  r:=public.billing_take_work('development',5);
  ${check(`not exists(select 1 from jsonb_array_elements_text(r->'accounts') account_work where account_work=${subject(other)}::text)
   and not exists(select 1 from jsonb_array_elements(r->'events') inbox_work where inbox_work->>'subject_id'=${subject(other)}::text) and a=${foreignState}`)}
  ${check(`exists(select 1 from public.ops where workspace_id=${workspace(other)})`)}`)}
 {const f=fresh();probe('Registered worker scope cannot broaden its immutable authority',f,`${base(f)}
  begin update service_private.worker_scopes set manifest=manifest||'{"broadened":true}'::jsonb where id=split_part(current_setting('request.headers')::jsonb->>'x-goalloom-lifecycle-scope','.',1)::uuid;
   raise exception 'expected_rejection_missing';exception when raise_exception then if sqlerrm<>'worker_scope_conflict' then raise;end if;end;
  r:=public.lifecycle_scope_check('development',s,${workspace(f)},${generation(f)},${owner(f)});${check("r->'ok'='true'::jsonb and r->'scoped'='true'::jsonb")}`)}
 {const f=fresh();probe('Prepared actual upload cannot dispatch after closure and is withdrawn',f,`${transferClosed(f,'upload',false)}
 r:=public.lifecycle_transfer_dispatch(ticket);${check("r->'current'='false'::jsonb")}
 r:=public.lifecycle_reconcile_transfers(${args(f)});${check("r->>'phase'='ready'")}
 ${check("(select state='withdrawn' from service_private.cloud_transfers where ticket_id=ticket)")}
 ${check(`(select state<>'absent' from service_private.cloud_objects where object_path=${q(path(f))} and environment='development')`)}`)}
 for(const state of ['dispatched','unknown'])for(const reason of ['unverified','mismatched','before-boundary']){
  const f=fresh();probe(`Upload ${state} remains pending with ${reason} drain proof`,f,`${transferClosed(f)}
   ${state==='unknown'?`r:=public.lifecycle_transfer_finish(ticket,'unknown');${check("r->'ok'='true'::jsonb")}`:''}
   ${reason==='unverified'?pastUpload:reason==='mismatched'?drainPolicy(sha('other-producer'))+pastUpload:drainPolicy()+`update service_private.transfer_drain_policy set producer_max_seconds=3600,storage_max_seconds=3600 where id=1;update service_private.cloud_transfers set created_at=clock_timestamp() where ticket_id=ticket;`}
   r:=public.lifecycle_reconcile_transfers(${args(f)});${check(`r->>'phase'=${q(reason==='before-boundary'?'draining':'awaiting_producer_evidence')}`)}
   ${check(`(select state=${q(state)} from service_private.cloud_transfers where ticket_id=ticket)`)}
   ${finalNoObject(f)}
   ${rejects(`public.lifecycle_storage_scan_page(${args(f)},'[]',null,true)`,'lifecycle_conflict')}
   ${rejects(`public.lifecycle_purge_content(${args(f)})`,'lifecycle_conflict')}
   ${check(`exists(select 1 from public.ops where workspace_id=${workspace(f)})`)}`)
 }
 for(const state of ['dispatched','unknown']){const f=fresh();probe(`Proven post-boundary ${state} upload drains without object-absence claim`,f,`${transferClosed(f)}
  ${state==='unknown'?`r:=public.lifecycle_transfer_finish(ticket,'unknown');`:''}${drainPolicy()}${pastUpload}${finalNoObject(f)}
  update service_private.workspace_lifecycle set storage_verified_at=clock_timestamp(),verification_cursor='{"fixture":"prior-scan"}' ${scope(f)};
  r:=public.lifecycle_reconcile_transfers(${args(f)});${check("r->>'phase'='ready'")}
  ${check("(select state='drained' and drain_evidence='controlled-sql-operational-proof' from service_private.cloud_transfers where ticket_id=ticket)")}
  ${check(`(select state='delete_pending' and verified_absent_at is null from service_private.cloud_objects where environment='development' and object_path=${q(path(f))})`)}
  ${check(`(select storage_verified_at is null and verification_cursor is null from service_private.workspace_lifecycle ${scope(f)})`)}
  ${rejects(`public.lifecycle_storage_scan_page(${args(f)},'[]',null,true)`,'lifecycle_conflict')}
  r:=public.lifecycle_transfer_finish(ticket,'complete');${check("r->'ok'='false'::jsonb")}
  ${finalNoObject(f)}${emptyScan(f)}${purge(f)}`)}
 {const f=fresh();probe('Drain policy rejects null/malformed verified producer evidence',f,`${base(f)}
  ${rejectsState("update service_private.transfer_drain_policy set verified=true where id=1;",'23514')}
  ${rejectsState("update service_private.transfer_drain_policy set verified=true,producer_sha256='bad',producer_max_seconds=1,storage_max_seconds=1,evidence_reference='controlled',verified_at=clock_timestamp() where id=1;",'23514')}
  ${check('(select not verified from service_private.transfer_drain_policy where id=1)')}`)}
 {const f=fresh();probe('Upload drain continues after bounded sixteen-ticket batch',f,`${transferClosed(f)}${drainPolicy()}${pastUpload}
  insert into service_private.cloud_transfers(environment,subject_id,workspace_id,generation,producer_sha256,device_id,session_id,lifecycle_revision,bucket,object_path,method,state,created_at)
   select environment,subject_id,workspace_id,generation,producer_sha256,device_id,session_id,lifecycle_revision,bucket,object_path,'upload','unknown',clock_timestamp()-interval '3 seconds' from service_private.cloud_transfers cross join generate_series(1,16) where ticket_id=ticket;
  r:=public.lifecycle_reconcile_transfers(${args(f)});${check("r->>'phase'='draining'")}
  ${check(`(select count(*)=1 from service_private.cloud_transfers ${scope(f)} and state in ('dispatched','unknown'))`)}
  r:=public.lifecycle_reconcile_transfers(${args(f)});${check("r->>'phase'='ready'")}
  ${check(`(select count(*)=17 from service_private.cloud_transfers ${scope(f)} and state='drained')`)}`)}
 {const f=fresh();probe('Unknown download never blocks verified scan and full content purge',f,`${transferClosed(f,'download',false)}
  r:=public.lifecycle_transfer_finish(ticket,'unknown');${check("r->'ok'='true'::jsonb")}
  ${finalNoObject(f)}${emptyScan(f)}${purge(f)}
  ${check(`not exists(select 1 from public.workspaces where id=${workspace(f)})`)}`)}
 {const f=fresh();probe('Late actual upload completion invalidates inventory and absence, terminal stays immutable',f,`${transferClosed(f)}
  ${finalNoObject(f)}
  r:=public.lifecycle_transfer_finish(ticket,'complete');${check("r->'ok'='true'::jsonb and r->'current'='false'::jsonb")}
  ${check(`(select state='delete_pending' and verified_absent_at is null from service_private.cloud_objects where object_path=${q(path(f))} and environment='development')`)}
  ${check(`(select inventory_completed_at is null and storage_verified_at is null from service_private.workspace_lifecycle ${scope(f)})`)}
  r:=public.lifecycle_transfer_finish(ticket,'unknown');${check("r->'ok'='false'::jsonb")}
  ${rejects(`public.lifecycle_purge_content(${args(f)})`,'lifecycle_conflict')}`)}
 for(const condition of ['wrong-lease','expired-lease','unacknowledged-intent','new-object']){
  const f=fresh();probe(`Final purge denies ${condition} and preserves original operations`,f,`${base(f)}${deletion(f)}${ackAndLease(f)}${emptyScan(f)}
   ${condition==='wrong-lease'?`lease_token:=${q(f.otherSession)}::uuid;`:condition==='expired-lease'?`update service_private.workspace_lifecycle set lease_until=clock_timestamp()-interval '1 second' ${scope(f)};`:condition==='unacknowledged-intent'?`update service_private.deletion_outbox set acknowledged_at=null where environment='development' and workspace_id=${workspace(f)} and event_kind='intent';`:`insert into service_private.cloud_objects(environment,workspace_id,generation,bucket,object_path,source,state) values('development',${workspace(f)},${generation(f)},'snapshots',${q(path(f))},'inventory','present');`}
   ${rejects(`public.lifecycle_purge_content(${args(f)})`,'lifecycle_conflict')}
   ${check(`exists(select 1 from public.ops where workspace_id=${workspace(f)}) and exists(select 1 from public.op_receipts where workspace_id=${workspace(f)})`)}`)
 }
 {const f=fresh(),other=fresh();probe('Partial purge keeps exact revision and preserves foreign workspace and immutable facts',f,`${base(other)}${base(f)}${bindScope([other,f])}${deletion(f)}${ackAndLease(f)}${emptyScan(f)}
  b:=${immutableFacts};
  r:=public.lifecycle_purge_content(${args(f)});${check("r->>'phase'='purging'")}
  ${check(`(select revision=rev from service_private.workspace_lifecycle ${scope(f)}) and exists(select 1 from public.workspaces where id=${workspace(f)})`)}
  ${check(`exists(select 1 from public.workspaces where id=${workspace(other)} and user_id=${owner(other)}) and exists(select 1 from public.ops where workspace_id=${workspace(other)})`)}
  ${purge(f)}${check(`exists(select 1 from public.ops where workspace_id=${workspace(other)}) and b=${immutableFacts}`)}`)}
 {const f=fresh();probe('Auth lost acknowledgement keeps exact durable target after mapping clears',f,`${base(f)}${deletion(f,'account')}${ackAndLease(f)}${emptyScan(f)}${purge(f)}
  r:=public.lifecycle_account_ready('development',s);${check(`r->'ready'='true'::jsonb and r->>'ownerId'=${owner(f)}`)}
  delete from auth.users where id=${owner(f)};
  ${check(`(select user_id is null from service_private.account_lifecycle where environment='development' and subject_id=s) and (select auth_target=${owner(f)}::uuid from service_private.deletion_requests where environment='development' and request_id=${q(f.request)})`)}
  r:=public.lifecycle_account_ready('development',s);${check(`r->'ready'='true'::jsonb and r->>'ownerId'=${owner(f)}`)}
  r:=public.lifecycle_account_deleted('development',s,${owner(f)});${check("r->'ok'='true'::jsonb")}
  r:=public.lifecycle_account_deleted('development',s,${owner(f)});${check("r->'ok'='true'::jsonb")}
  ${check(`(select state='deleted' and user_id is null from service_private.account_lifecycle where environment='development' and subject_id=s) and (select auth_state='deleted' and auth_target is null from service_private.deletion_requests where request_id=${q(f.request)} and environment='development')`)}`)}
 {const f=fresh(),second=fresh(),third=fresh();probe('Account work bounded queue advances past live lease and retried subject',f,`${base(f)}${deletion(f,'account')}${base(second)}${deletion(second,'account')}${base(third)}${deletion(third,'account')}${bindScope([f,second,third])}
  update service_private.account_lifecycle set work_retry_at=case user_id when ${owner(f)}::uuid then '2000-01-01T00:00:00Z'::timestamptz when ${owner(second)}::uuid then '2001-01-01T00:00:00Z'::timestamptz else '2002-01-01T00:00:00Z'::timestamptz end where user_id in (${owner(f)},${owner(second)},${owner(third)});
  a:=public.lifecycle_take_work('development',1);${check(`a->'accounts'->0->>'subjectId'=(select subject_id::text from service_private.account_lifecycle where user_id=${owner(f)})`)}
  r:=public.lifecycle_account_work_done('development',(a->'accounts'->0->>'subjectId')::uuid,${q(f.otherSession)},600);${check("r->'ok'='false'::jsonb")}
  b:=public.lifecycle_take_work('development',1);${check(`b->'accounts'->0->>'subjectId'=(select subject_id::text from service_private.account_lifecycle where user_id=${owner(second)})`)}
  r:=public.lifecycle_account_work_done('development',(a->'accounts'->0->>'subjectId')::uuid,(a->'accounts'->0->>'lease')::uuid,600);${check("r->'ok'='true'::jsonb")}
  c:=public.lifecycle_take_work('development',1);${check(`c->'accounts'->0->>'subjectId'=(select subject_id::text from service_private.account_lifecycle where user_id=${owner(third)})`)}`)}

 const invoice=f=>`in_SQLFinal${f.user.replaceAll('-','')}`
 const financial=f=>`${base(f)}
  insert into public.billing_customers(environment,subject_id,customer_id) values('development',s,${q(`cus_SQLFinal${f.user.replaceAll('-','')}`)});
  insert into public.billing_subscriptions(environment,subject_id,subscription_id,customer_id,status,price_id,period_start,period_end,cancel_at_period_end,verified_at)
   values('development',s,${q(`sub_SQLFinal${f.user.replaceAll('-','')}`)},${q(`cus_SQLFinal${f.user.replaceAll('-','')}`)},'canceled','price_SQLFinal','2000-02-29T00:00:00Z','2000-03-29T00:00:00Z',true,clock_timestamp());
  insert into public.billing_transactions(environment,invoice_id,subject_id,subscription_id,price_id,starts_at,ends_at,paid_at,amount_cents,refunded_cents,disposition,rc_verified,verified_at,financial_at)
   values('development',${q(invoice(f))},s,${q(`sub_SQLFinal${f.user.replaceAll('-','')}`)},'price_SQLFinal','2000-02-29T00:00:00Z','2000-03-29T00:00:00Z','2000-02-29T00:00:00Z',899,0,'paid',true,clock_timestamp(),'2000-02-29T00:00:00Z');
  select to_jsonb(budget_row) into budget from public.ai_budget budget_row where id='integration-shared';`
 const budgetSame=check("(select to_jsonb(budget_row)=budget from public.ai_budget budget_row where id='integration-shared')")
 {const f=fresh();probe('Seven calendar-year deadline and two released holds make multi-call FK progress within rollback',f,`${financial(f)}
  ${check(`(select retain_until='2007-02-28T00:00:00Z'::timestamptz from public.billing_transactions where invoice_id=${q(invoice(f))} and environment='development')`)}
  insert into service_private.financial_holds(environment,invoice_id,reason,reference,started_at,review_at,released_at) values
   ('development',${q(invoice(f))},'fixture','a',clock_timestamp(),clock_timestamp(),clock_timestamp()),('development',${q(invoice(f))},'fixture','b',clock_timestamp(),clock_timestamp(),clock_timestamp());
  r:=public.lifecycle_cleanup_retention('development',1);set constraints all immediate;
  ${check(`(select count(*)=1 from service_private.financial_holds where environment='development' and invoice_id=${q(invoice(f))}) and exists(select 1 from public.billing_transactions where environment='development' and invoice_id=${q(invoice(f))})`)}
  r:=public.lifecycle_cleanup_retention('development',1);set constraints all immediate;
  ${check(`not exists(select 1 from service_private.financial_holds where environment='development' and invoice_id=${q(invoice(f))}) and not exists(select 1 from public.billing_transactions where environment='development' and invoice_id=${q(invoice(f))})`)}${budgetSame}`)}
 for(const protection of ['active-hold','pending-compensation']){const f=fresh();probe(`Expired financial fact survives ${protection} without AI budget mutation`,f,`${financial(f)}
  ${protection==='active-hold'?`insert into service_private.financial_holds(environment,invoice_id,reason,reference,started_at,review_at) values('development',${q(invoice(f))},'fixture','active',clock_timestamp(),clock_timestamp());`:`insert into public.billing_compensations(environment,subject_id,invoice_id,reason) values('development',s,${q(invoice(f))},'refund');`}
  for i in 1..3 loop r:=public.lifecycle_cleanup_retention('development',1);set constraints all immediate;end loop;
  ${check(`exists(select 1 from public.billing_transactions where environment='development' and invoice_id=${q(invoice(f))})`)}${budgetSame}`)}
 {const f=fresh(),other=fresh();probe('Scoped retention deletes only permitted expired financial fixture',f,`${financial(other)}${financial(f)}
  r:=public.lifecycle_cleanup_retention('development',1);set constraints all immediate;
  ${check(`not exists(select 1 from public.billing_transactions where environment='development' and invoice_id=${q(invoice(f))}) and exists(select 1 from public.billing_transactions where environment='development' and invoice_id=${q(invoice(other))})`)}${budgetSame}`)}

 {const f=fresh();probe('Completed empty SQL restore status retains key checkpoint and closed admission barrier',f,`${base(f)}${restoreBegin(f,'0')}
  r:=public.lifecycle_restore_capture(run,${q(`sql-final-${f.user}`)},'0','[]');${check("r->>'phase'='project'")}
  r:=public.lifecycle_restore_project(run);${check("r->>'phase'='replayed' and r->'admissionBlocked'='true'::jsonb")}
  r:=public.lifecycle_restore_project(run);${check("r->>'phase'='replayed'")}
  r:=public.lifecycle_restore_status(run);${check(`r->>'runId'=run::text and r->>'environment'='development' and r->>'storeId'=${q(`sql-final-${f.user}`)} and r->>'keyDigest'=key_hash and r->'keyMatches'='true'::jsonb and r->>'after'='0' and r->>'through'='0' and r->>'phase'='replayed' and r->'admissionBlocked'='true'::jsonb`)}
  r:=public.service_retrieval_prepare(${owner(f)},${q(f.session)},'development',${json({version:1,workspaceId:f.workspace,generation:f.generation,proof:{kind:'recovery'}})});${check("r->>'error'='retrieval_configuration'")}`)}
 {const f=fresh();probe('Restore begin rejects wrong key with no accepted run or barrier mutation',f,`${base(f)}${keyHash}
  ${rejects(`public.lifecycle_restore_begin('development','controlled-final','0',case left(key_hash,1) when '0' then '1' else '0' end||substr(key_hash,2))`,'restore_key_mismatch')}
  ${check("not exists(select 1 from service_private.restore_runs where environment='development') and (select not restore_blocked from service_private.lifecycle_policy where id=1)")}`)}
 for(const violation of ['current-key-change','opened-barrier','wrong-run']){const f=fresh();probe(`Completed SQL restore status exposes ${violation} without successful resume`,f,`${base(f)}${restoreBegin(f,'0')}
  r:=public.lifecycle_restore_capture(run,${q(`sql-final-${f.user}`)},'0','[]');r:=public.lifecycle_restore_project(run);${check("r->>'phase'='replayed'")}
  ${violation==='current-key-change'?`update service_private.lifecycle_keys set key=set_byte(key,0,get_byte(key,0)#1) where id=1;
   r:=public.lifecycle_restore_status(run);${check("r->'keyMatches'='false'::jsonb and r->>'keyDigest'=key_hash and r->>'through'='0'")}
   ${rejects(`public.lifecycle_restore_begin('development',${q(`sql-final-${f.user}`)},'0',key_hash)`,'restore_key_mismatch')}`:violation==='opened-barrier'?`update service_private.lifecycle_policy set restore_blocked=false,restore_admission_ready=true where id=1;
   r:=public.lifecycle_restore_status(run);${check("r->'admissionBlocked'='false'::jsonb")}
   ${rejects('public.lifecycle_restore_project(run)','restore_checkpoint_conflict')}`:`r:=public.lifecycle_restore_status(${q(f.otherSession)});${check('r is null')}`}`)}
 for(const violation of ['wrong-store','wrong-after','skipped-cursor','missing-prefix','bad-digest','event-id','project','environment','missing-barrier','missing-kind','null-kind']){
  const f=fresh();probe(`Restore capture atomically rejects ${violation}`,f,`${base(f)}${deletion(f)}${eventPayload(f)}${restoreBegin(f)}${entry}
   ${violation==='skipped-cursor'?`entry:=jsonb_set(entry,'{cursor}','"2"');`:violation==='bad-digest'?`entry:=jsonb_set(entry,'{digest}',to_jsonb(case left(digest,1) when '0' then '1' else '0' end||substr(digest,2)));`:violation==='event-id'?`entry:=jsonb_set(entry,'{eventId}',${json(f.otherSession)});`:['project','environment'].includes(violation)?`payload:=jsonb_set(payload,'{${violation==='project'?'projectRef':'environment'}}',${json(violation==='project'?'wrong-project':'production')});${entry}`:violation==='missing-barrier'?`update service_private.lifecycle_policy set restore_blocked=false where id=1;`:violation==='missing-kind'?`payload:=payload-'kind';${entry}`:violation==='null-kind'?`payload:=jsonb_set(payload,'{kind}','null');${entry}`:''}
   ${rejects(`public.lifecycle_restore_capture(run,${q(violation==='wrong-store'?'wrong-store':`sql-final-${f.user}`)},${q(violation==='wrong-after'?'1':'0')},${violation==='missing-prefix'?`'[]'::jsonb`:'jsonb_build_array(entry)'})`,['wrong-store','wrong-after','skipped-cursor','missing-barrier'].includes(violation)?'restore_checkpoint_conflict':violation==='missing-prefix'?'restore_prefix_missing':'restore_event_invalid')}
   ${check("(select after_cursor=0 and phase='capture' from service_private.restore_runs where id=run) and not exists(select 1 from service_private.restore_events where run_id=run)")}`)
 }
 for(const conflict of ['owner-tag','generation']){const f=fresh();probe(`Restore projection rejects existing ${conflict} identity conflict`,f,`${base(f)}${deletion(f)}${eventPayload(f)}${restoreBegin(f)}
  ${conflict==='owner-tag'?`payload:=jsonb_set(payload,'{ownerTag}',to_jsonb(encode(set_byte(decode(payload->>'ownerTag','hex'),0,get_byte(decode(payload->>'ownerTag','hex'),0)#1),'hex')));`:`payload:=jsonb_set(payload,'{target,generation}',${json(f.otherSession)});`}${entry}
  a:=jsonb_build_object('workspace',(select to_jsonb(w) from public.workspaces w where id=${workspace(f)}),
   'ops',(select jsonb_agg(to_jsonb(o) order by seq) from public.ops o where workspace_id=${workspace(f)}),
   'receipts',(select jsonb_agg(to_jsonb(o) order by op_id) from public.op_receipts o where workspace_id=${workspace(f)}));
  ${conflict==='generation'?`${rejects(capture(f),'worker_scope_denied')}
   ${check("(select after_cursor=0 and phase='capture' from service_private.restore_runs where id=run) and not exists(select 1 from service_private.restore_events where run_id=run)")}`:`r:=${capture(f)};${rejects('public.lifecycle_restore_project(run)','restore_identity_conflict')}`}
  ${check(`(select generation=${generation(f)}::uuid from public.workspaces where id=${workspace(f)}) and not exists(select 1 from service_private.restore_events where run_id=run and projected)
   and a=jsonb_build_object('workspace',(select to_jsonb(w) from public.workspaces w where id=${workspace(f)}),
    'ops',(select jsonb_agg(to_jsonb(o) order by seq) from public.ops o where workspace_id=${workspace(f)}),
    'receipts',(select jsonb_agg(to_jsonb(o) order by op_id) from public.op_receipts o where workspace_id=${workspace(f)}))`)}`)}
 {const f=fresh();probe('Valid SQL restore projects immutable closure deadline and completes without activation',f,`${base(f)}${deletion(f)}${eventPayload(f)}${restoreBegin(f)}${entry}
  r:=${capture(f)};${check("r->>'phase'='project' and r->>'after'='1'")}
  ${restoreComplete}
  ${check(`(select closed_at=(payload->>'closedAt')::timestamptz and online_delete_by=(payload->>'onlineDeleteBy')::timestamptz and retrieve_until=(payload->>'retrieveUntil')::timestamptz from service_private.workspace_lifecycle ${scope(f)})`)}
  r:=public.lifecycle_restore_status(run);${check("r->>'after'='1' and r->>'through'='1' and r->'keyMatches'='true'::jsonb and r->'admissionBlocked'='true'::jsonb")}`)}
 {const f=fresh();probe('Restore newer ordinary cancellation suppresses old intent without authenticating qualification',f,`${base(f)}
  update public.billing_accounts set test_now='2030-01-31T00:00:00.123456Z' where environment='development' and subject_id=s;
  perform service_private.reconcile_lifecycle_locked(s,'development',service_private.lifecycle_now('development',s));
  ticket:=service_private.enqueue_deletion((select l from service_private.workspace_lifecycle l ${scope(f)}),null,service_private.lifecycle_now('development',s));
  ${eventPayload(f)}${entry}a:=entry;
  update public.billing_accounts set trial_request=${q(f.request)},trial_started_at='2030-01-25T00:00:00.123456Z',trial_ends_at='2030-02-02T00:00:00.123456Z' where environment='development' and subject_id=s;
  perform service_private.reconcile_lifecycle_locked(s,'development',service_private.lifecycle_now('development',s));
  select o.record into payload from service_private.deletion_outbox o where o.environment='development' and o.workspace_id=${workspace(f)} and o.generation=${generation(f)} and o.event_kind='ordinary_cancelled';${check('payload is not null')}${entry}entry:=jsonb_set(entry,'{cursor}','"2"');
  ${restoreBegin(f,'2')}
  r:=public.lifecycle_restore_capture(run,${q(`sql-final-${f.user}`)},'0',jsonb_build_array(a,entry));${check("r->>'phase'='project'")}
  r:=public.lifecycle_restore_project(run);${check("r->>'phase'='project'")}
  ${check(`(select state='active' and not boundary_verified and not profile_verified from service_private.workspace_lifecycle ${scope(f)})`)}
  r:=public.lifecycle_restore_project(run);${check("r->>'phase'='replayed'")}
  ${check("exists(select 1 from service_private.restore_events where run_id=run and record->>'kind'='ordinary_cancelled' and projected) and exists(select 1 from service_private.restore_events where run_id=run and record->>'kind'='intent' and not projected)")}`)}
 {const f=fresh();probe('Restore barrier denies ordinary dispatch while permitting closed-subject settlement lease',f,`${base(f)}${restoreBegin(f,'0')}
  ${rejects(`public.billing_lock('development',s)`,'lifecycle_unavailable')}
  ${rejects('service_private.require_version()','lifecycle_unavailable')}
  update service_private.lifecycle_policy set restore_blocked=false,restore_admission_ready=true where id=1;
  ${deletion(f,'account')}
  update service_private.lifecycle_policy set restore_blocked=true,restore_admission_ready=false where id=1;
  r:=public.billing_lock('development',s);${check("r->>'lease' is not null and r->>'mode'='settlement'")}
  perform public.billing_unlock('development',s,(r->>'lease')::uuid);
  ${check("(select restore_blocked and not restore_admission_ready from service_private.lifecycle_policy where id=1)")}`)}
 {const f=fresh();probe('Restore receipt from backup before preparation preserves original digest and TTL',f,`${base(f)}${backupIdentity(f)}${deletion(f)}${eventPayload(f)}
  ${check(`payload->'deletionReceipt'->>'scope'='cloud' and payload->'deletionReceipt'->>'receiptDigest'=${q(f.receiptDigest)} and payload->'target'=${json({workspaceId:f.workspace,generation:f.generation})}`)}
  ${restoreIdentity(f)}${check(`not exists(select 1 from service_private.deletion_requests where environment='development' and request_id=${q(f.request)})`)}
  ${restoreBegin(f)}${entry}r:=${capture(f)};${restoreComplete}
  ${check(`(select workspace_id=${workspace(f)}::uuid and generation=${generation(f)}::uuid from service_private.deletion_requests where environment='development' and request_id=${q(f.request)})`)}
  ${receiptAssertions(f,'cloud')}`)}
 {const f=fresh();probe('Restore prepared-only backup becomes confirmed and claimable',f,`${base(f)}${backupIdentity(f)}${prepareDeletion(f,'account')}
  select to_jsonb(prepared_row) into backup_request from service_private.deletion_requests prepared_row where environment='development' and request_id=${q(f.request)};
  ${check("backup_request->'confirmed_at'='null'::jsonb")}${confirmDeletion(f)}
  select o.record into payload from service_private.deletion_outbox o where o.environment='development' and o.subject_id=s and o.workspace_id is null and o.event_kind='intent';
  ${check(`payload->'target'='null'::jsonb and payload->'deletionReceipt'->>'scope'='account' and payload->'deletionReceipt'->>'receiptDigest'=${q(f.receiptDigest)}`)}
  ${restoreIdentity(f)}
  insert into service_private.deletion_requests select * from jsonb_populate_record(null::service_private.deletion_requests,backup_request);
  ${restoreBegin(f)}${entry}r:=${capture(f)};${restoreComplete}
  ${check(`(select user_id is null and state='deleting' and delete_request_id=${q(f.request)}::uuid from service_private.account_lifecycle where environment='development' and subject_id=s)
   and (select auth_target=${owner(f)}::uuid and auth_state='pending' and renewal='pending' and confirmed_at is not null from service_private.deletion_requests where environment='development' and request_id=${q(f.request)})`)}
  work:=public.lifecycle_take_work('development',5);
  ${check("exists(select 1 from jsonb_array_elements(work->'accounts') account_work where account_work->>'subjectId'=s::text and account_work->>'lease' is not null)")}
  ${receiptAssertions(f,'account')}`)}
 return {sql:sql.join('\n'),checks,fixtureIds}
}
