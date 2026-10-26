-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Installed 0025/26 lifecycle fences, durable deletion intent and 0027 scoped retrieval cleanup.
-- OUTPUT: Bounded online content purge, immutable completion outbox and retention cleanup.
-- POS: D2 integration. Wiring is installed without enabling any admission/readiness flag.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

-- Development fixture workers use an operator-registered immutable capability, never a client selector.
create table service_private.worker_access(id integer primary key check(id=1),development_requires_scope boolean not null default true);
insert into service_private.worker_access(id) values(1);
create table service_private.worker_scopes (
 id uuid primary key,secret_digest bytea not null check(octet_length(secret_digest)=32),manifest jsonb not null,
 created_at timestamptz not null,expires_at timestamptz not null,revoked_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '24 hours'),check(octet_length(manifest::text)<=16384)
);
create function service_private.immutable_worker_scope() returns trigger
language plpgsql set search_path='' as $$
begin
 if (new.id,new.secret_digest,new.manifest,new.created_at,new.expires_at) is distinct from (old.id,old.secret_digest,old.manifest,old.created_at,old.expires_at)
  or old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then raise exception 'worker_scope_conflict';end if;
 return new;
end $$;
create trigger immutable_worker_scope before update on service_private.worker_scopes for each row execute function service_private.immutable_worker_scope();
create function service_private.worker_scope() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare token text;scope_id uuid;row service_private.worker_scopes;env text;value jsonb;
begin
 select environment into env from service_private.policy where id=1;
 token:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-goalloom-lifecycle-scope','');
 if token='' then
  if env='development' and coalesce((select development_requires_scope from service_private.worker_access where id=1),true) then raise exception 'worker_scope_required';end if;
  return null;
 end if;
 if token!~'^[a-f0-9-]{36}\.[a-f0-9]{64}$' then raise exception 'worker_scope_invalid';end if;
 scope_id:=split_part(token,'.',1)::uuid;
 select * into row from service_private.worker_scopes where id=scope_id;
 if row.id is null or row.revoked_at is not null or clock_timestamp()>=row.expires_at
  or row.secret_digest is distinct from public._sha256(decode(split_part(token,'.',2),'hex')) then raise exception 'worker_scope_invalid';end if;
 value:=row.manifest;
 if value->'version' is distinct from '1'::jsonb or value->>'environment' is distinct from env
  or value->>'projectRef' is distinct from (select project_ref from service_private.policy where id=1)
  or jsonb_typeof(value->'subjects') is distinct from 'array' or jsonb_array_length(value->'subjects') not between 1 and 8
  or jsonb_typeof(value->'targets') is distinct from 'array' or jsonb_array_length(value->'targets')>16
  or jsonb_typeof(value->'devices') is distinct from 'array' or jsonb_array_length(value->'devices')>32
  or jsonb_typeof(value->'trialTags') is distinct from 'array' or jsonb_array_length(value->'trialTags')>32 then raise exception 'worker_scope_invalid';end if;
 return value||jsonb_build_object('_scopeId',row.id,'_expiresAt',service_private.format_utc(row.expires_at));
end $$;
create function service_private.scope_subject(p_scope jsonb,p_subject uuid) returns boolean
language sql immutable set search_path='' as $$
 select p_scope is null or exists(select 1 from jsonb_array_elements(p_scope->'subjects') s where s->>'subjectId'=p_subject::text)
$$;
create function service_private.assert_worker_target(p_environment text,p_subject uuid default null,p_workspace uuid default null,p_generation uuid default null,p_owner uuid default null) returns void
language plpgsql volatile security definer set search_path='' as $$
declare value jsonb;subject uuid:=p_subject;a service_private.account_lifecycle;member jsonb;
begin
 if p_environment is distinct from (select environment from service_private.policy where id=1) then raise exception 'worker_scope_invalid';end if;
 value:=service_private.worker_scope();
 if value is null then return;end if;
 if p_workspace is not null then
  select subject_id into subject from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and (p_generation is null or generation=p_generation);
  if subject is null then select (t->>'subjectId')::uuid into subject from jsonb_array_elements(value->'targets') t where t->>'workspaceId'=p_workspace::text and (p_generation is null or t->>'generation'=p_generation::text);end if;
  if subject is null or p_subject is not null and p_subject<>subject or not exists(select 1 from jsonb_array_elements(value->'targets') t
   where t->>'subjectId'=subject::text and t->>'workspaceId'=p_workspace::text and (p_generation is null or t->>'generation'=p_generation::text)) then raise exception 'worker_scope_denied';end if;
 end if;
 select s into member from jsonb_array_elements(value->'subjects') s where s->>'subjectId'=subject::text;
 select * into a from service_private.account_lifecycle where environment=p_environment and subject_id=subject;
 if member is null or a.subject_id is null or member->>'ownerTag' is distinct from encode(a.owner_tag,'hex')
  or a.owner_tag is distinct from service_private.owner_tag((member->>'ownerId')::uuid)
  or p_owner is not null and member->>'ownerId' is distinct from p_owner::text then raise exception 'worker_scope_denied';end if;
 if p_workspace is not null and exists(select 1 from public.workspaces where id=p_workspace and (user_id is distinct from (member->>'ownerId')::uuid or p_generation is not null and generation<>p_generation)) then raise exception 'worker_scope_denied';end if;
 if p_environment='development' and exists(select 1 from auth.users where id=(member->>'ownerId')::uuid and email is distinct from 'billing-'||(member->>'ownerId')||'@goalloom.test') then raise exception 'worker_scope_denied';end if;
 if exists(select 1 from service_private.workspace_lifecycle l where l.environment=p_environment and l.subject_id=subject and not exists(select 1 from jsonb_array_elements(value->'targets') t
   where t->>'subjectId'=subject::text and t->>'workspaceId'=l.workspace_id::text and t->>'generation'=l.generation::text))
  or exists(select 1 from public.workspaces w where w.user_id=(member->>'ownerId')::uuid and not exists(select 1 from jsonb_array_elements(value->'targets') t where t->>'subjectId'=subject::text and t->>'workspaceId'=w.id::text and t->>'generation'=w.generation::text))
  or exists(select 1 from public.devices d where d.user_id=(member->>'ownerId')::uuid and not exists(select 1 from jsonb_array_elements(value->'devices') entry where entry->>'deviceId'=d.id::text and entry->>'ownerId'=d.user_id::text and (d.status='revoked' or entry->>'sessionId' is not distinct from d.auth_session_id::text))) then raise exception 'worker_scope_denied';end if;
end $$;
create function public.lifecycle_scope_check(p_environment text,p_subject uuid default null,p_workspace uuid default null,p_generation uuid default null,p_owner uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare value jsonb;
begin
 if p_environment is distinct from (select environment from service_private.policy where id=1) then raise exception 'worker_scope_invalid';end if;
 if p_subject is not null or p_workspace is not null or p_owner is not null then perform service_private.assert_worker_target(p_environment,p_subject,p_workspace,p_generation,p_owner);end if;
 value:=service_private.worker_scope();
 return jsonb_build_object('ok',true,'scoped',value is not null,'scopeId',value->'_scopeId','expiresAt',value->'_expiresAt');
end $$;

alter table service_private.workspace_lifecycle add column verification_cursor jsonb,add column storage_verified_at timestamptz;
alter table service_private.cloud_transfers drop constraint cloud_transfers_state_check;
alter table service_private.cloud_transfers add check(state in ('prepared','dispatched','complete','failed','unknown','withdrawn','drained'));
alter table service_private.cloud_transfers add column drain_evidence text;
create table service_private.transfer_drain_policy (
 id integer primary key,verified boolean not null default false,producer_sha256 text unique,producer_max_seconds integer,
 storage_max_seconds integer,evidence_reference text,verified_at timestamptz,
 check(not verified or (producer_sha256 is not null and producer_sha256~'^[a-f0-9]{64}$' and producer_max_seconds is not null and producer_max_seconds between 1 and 3600
  and storage_max_seconds is not null and storage_max_seconds between 1 and 3600 and evidence_reference is not null and length(evidence_reference) between 1 and 200 and verified_at is not null))
);
insert into service_private.transfer_drain_policy(id) values(1);
create function public.lifecycle_reconcile_transfers(p_environment text,p_workspace uuid,p_generation uuid,p_revision bigint,p_lease uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare subject uuid;row service_private.workspace_lifecycle;removed bigint;
begin
 select subject_id into subject from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 perform service_private.lock_account(subject,p_environment);perform service_private.lock_workspace_row(subject,p_environment,p_workspace);
 select * into row from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 if row.revision is distinct from p_revision or row.lease is distinct from p_lease or row.lease_until<=clock_timestamp() or row.state not in ('queued','deleting') then raise exception 'lifecycle_conflict';end if;
 -- Prepared uploads cannot pass their mandatory dispatch fence after closure, even if a producer wakes later.
 update service_private.cloud_transfers set state='withdrawn',finished_at=clock_timestamp() where environment=p_environment and workspace_id=p_workspace and generation=p_generation and method='upload' and state='prepared';
 if not exists(select 1 from service_private.cloud_transfers where environment=p_environment and workspace_id=p_workspace and generation=p_generation and method='upload' and state in ('dispatched','unknown')) then
  return jsonb_build_object('ok',true,'phase','ready','resolved',0);end if;
 if exists(select 1 from service_private.cloud_transfers t where t.environment=p_environment and t.workspace_id=p_workspace and t.generation=p_generation and t.method='upload' and t.state in ('dispatched','unknown')
  and not exists(select 1 from service_private.transfer_drain_policy p where p.verified and p.producer_sha256=t.producer_sha256)) then return jsonb_build_object('ok',true,'phase','awaiting_producer_evidence','resolved',0);end if;
 -- The producer and Storage bounds are independently proved operational limits, not request timeouts.
 -- Drained asserts no future write, never that the original write failed or that the object is absent.
 with terminal as (
  update service_private.cloud_transfers t set state='drained',finished_at=clock_timestamp(),drain_evidence=p.evidence_reference
   from service_private.transfer_drain_policy p where p.verified and p.producer_sha256=t.producer_sha256 and t.ticket_id in(
    select x.ticket_id from service_private.cloud_transfers x join service_private.transfer_drain_policy proof on proof.producer_sha256=x.producer_sha256 and proof.verified
    where x.environment=p_environment and x.workspace_id=p_workspace and x.generation=p_generation and x.method='upload' and x.state in ('dispatched','unknown')
     and x.created_at+make_interval(secs=>proof.producer_max_seconds+proof.storage_max_seconds)<clock_timestamp()
    order by x.created_at,x.ticket_id limit 16) returning t.object_path
 ) update service_private.cloud_objects o set state='delete_pending',verified_absent_at=null where o.environment=p_environment and o.workspace_id=p_workspace and o.generation=p_generation
  and o.bucket='snapshots' and o.object_path in(select object_path from terminal);
 get diagnostics removed=row_count;
 return jsonb_build_object('ok',true,'phase',case when exists(select 1 from service_private.cloud_transfers where environment=p_environment and workspace_id=p_workspace and generation=p_generation
  and method='upload' and state in ('dispatched','unknown')) then 'draining' else 'ready' end,'resolved',removed);
end $$;
create function service_private.lock_cleanup_job(p_environment text,p_workspace uuid,p_generation uuid,p_revision bigint,p_lease uuid)
returns service_private.workspace_lifecycle language plpgsql volatile security definer set search_path='' as $$
declare subject uuid;row service_private.workspace_lifecycle;
begin
 select subject_id into subject from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 if subject is null then raise exception 'lifecycle_conflict';end if;
 perform service_private.lock_account(subject,p_environment);perform service_private.lock_workspace_row(subject,p_environment,p_workspace);
 select * into row from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 if row.revision is distinct from p_revision or row.lease is distinct from p_lease or row.lease_until<=clock_timestamp() or row.state<>'deleting'
  or row.destructive_started_at is null or row.inventory_completed_at is null then raise exception 'lifecycle_conflict';end if;
 if not coalesce((select enabled and independent_ledger_ready and restore_admission_ready and cleanup_wiring_ready from service_private.lifecycle_policy where id=1),false) then raise exception 'retrieval_configuration';end if;
 if not exists(select 1 from service_private.deletion_outbox where environment=p_environment and workspace_id=p_workspace and generation=p_generation
  and lifecycle_revision=p_revision and event_kind='intent' and acknowledged_at is not null) then raise exception 'lifecycle_conflict';end if;
 perform service_private.assert_worker_target(p_environment,null,p_workspace,p_generation);
 return row;
end $$;
create function service_private.invalidate_storage_verification() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if (TG_OP='INSERT' and new.state<>'absent') or (TG_OP='UPDATE' and (new.state<>'absent' or new.verified_absent_at is null)) then
  update service_private.workspace_lifecycle set verification_cursor=null,storage_verified_at=null
   where environment=new.environment and workspace_id=new.workspace_id and generation=new.generation;
 end if;
 return new;
end $$;
create trigger invalidate_storage_verification after insert or update on service_private.cloud_objects for each row execute function service_private.invalidate_storage_verification();

create function public.lifecycle_storage_scan_status(p_environment text,p_workspace uuid,p_generation uuid,p_revision bigint,p_lease uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare row service_private.workspace_lifecycle;
begin
 row:=service_private.lock_cleanup_job(p_environment,p_workspace,p_generation,p_revision,p_lease);
 return jsonb_build_object('ok',true,'verified',row.storage_verified_at is not null,'cursor',row.verification_cursor);
end $$;
create function public.lifecycle_storage_scan_page(p_environment text,p_workspace uuid,p_generation uuid,p_revision bigint,p_lease uuid,p_paths jsonb,p_cursor jsonb,p_done boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare row service_private.workspace_lifecycle;path text;
begin
 row:=service_private.lock_cleanup_job(p_environment,p_workspace,p_generation,p_revision,p_lease);
 if jsonb_typeof(p_paths) is distinct from 'array' or jsonb_array_length(p_paths)>50 or p_done is null
  or octet_length(coalesce(p_cursor,'null')::text)>8192 then raise exception 'invalid_request';end if;
 if exists(select 1 from service_private.cloud_objects where environment=p_environment and workspace_id=p_workspace and generation=p_generation and state<>'absent')
  or exists(select 1 from service_private.cloud_transfers where environment=p_environment and workspace_id=p_workspace and generation=p_generation and method='upload' and state in ('dispatched','unknown')) then raise exception 'lifecycle_conflict';end if;
 if jsonb_array_length(p_paths)>0 then
  for path in select jsonb_array_elements_text(p_paths) loop
   if path is null or length(path)>1024 or path not like 'workspaces/'||p_workspace::text||'/%' or position('..' in path)>0 then raise exception 'object_scope_invalid';end if;
   if exists(select 1 from service_private.cloud_objects where environment=p_environment and bucket='snapshots' and object_path=path and (workspace_id<>p_workspace or generation<>p_generation)) then raise exception 'object_scope_invalid';end if;
   insert into service_private.cloud_objects(environment,workspace_id,generation,bucket,object_path,source,state)
    values(p_environment,p_workspace,p_generation,'snapshots',path,'inventory','present') on conflict(environment,bucket,object_path) do update set state='present',verified_absent_at=null;
  end loop;
  update service_private.workspace_lifecycle set verification_cursor=null,storage_verified_at=null where environment=p_environment and workspace_id=p_workspace;
 else
  update service_private.workspace_lifecycle set verification_cursor=p_cursor,storage_verified_at=case when p_done then clock_timestamp() end
   where environment=p_environment and workspace_id=p_workspace;
 end if;
 return jsonb_build_object('ok',true);
end $$;

create function public.lifecycle_purge_content(p_environment text,p_workspace uuid,p_generation uuid,p_revision bigint,p_lease uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare row service_private.workspace_lifecycle;removed bigint;table_name text;retrieval jsonb;at_time timestamptz;request uuid;
begin
 row:=service_private.lock_cleanup_job(p_environment,p_workspace,p_generation,p_revision,p_lease);
 if row.storage_verified_at is null or exists(select 1 from service_private.cloud_objects where environment=p_environment and workspace_id=p_workspace and generation=p_generation and state<>'absent')
  or exists(select 1 from service_private.cloud_transfers where environment=p_environment and workspace_id=p_workspace and generation=p_generation and method='upload' and state in ('dispatched','unknown')) then raise exception 'lifecycle_conflict';end if;
 if exists(select 1 from public.workspaces where id=p_workspace and generation<>p_generation) then raise exception 'lifecycle_conflict';end if;
 -- Refuse a future unreviewed cascade instead of silently purging an unknown content category.
 if exists(select 1 from pg_constraint where contype='f' and confrelid='public.workspaces'::regclass and conrelid not in (
  'public.ops'::regclass,'public.op_receipts'::regclass,'public.device_roster'::regclass,'public.key_envelopes'::regclass,
  'public.pairing_requests'::regclass,'public.recovery_challenges'::regclass,'public.recovery_checkpoints'::regclass,
  'public.snapshots'::regclass,'public.op_blobs'::regclass,'service_private.retrieval_builds'::regclass)) then raise exception 'cleanup_scope_unresolved';end if;
 retrieval:=service_private.cleanup_retrieval(p_workspace,p_generation,200);
 if (retrieval->>'builds')::bigint>0 then return jsonb_build_object('ok',true,'phase','purging','removed',(retrieval->>'builds')::bigint);end if;
 foreach table_name in array array['ops','op_receipts','snapshots','op_blobs','key_envelopes','device_roster','pairing_requests','recovery_challenges','recovery_checkpoints'] loop
  execute format('delete from public.%I where ctid in(select ctid from public.%I where workspace_id=$1 limit 200)',table_name,table_name) using p_workspace;
  get diagnostics removed=row_count;
  if removed>0 then return jsonb_build_object('ok',true,'phase','purging','removed',removed);end if;
 end loop;
 delete from service_private.cloud_transfers where ticket_id in(select ticket_id from service_private.cloud_transfers where environment=p_environment and workspace_id=p_workspace and generation=p_generation limit 200);
 get diagnostics removed=row_count;
 if removed>0 then return jsonb_build_object('ok',true,'phase','purging','removed',removed);end if;
 delete from service_private.cloud_objects where (environment,bucket,object_path) in(select environment,bucket,object_path from service_private.cloud_objects
  where environment=p_environment and workspace_id=p_workspace and generation=p_generation and state='absent' limit 200);
 get diagnostics removed=row_count;
 if removed>0 then return jsonb_build_object('ok',true,'phase','purging','removed',removed);end if;
 delete from service_private.initializations where workspace_id=p_workspace and generation=p_generation;
 delete from public.workspaces where id=p_workspace and generation=p_generation;
 at_time:=service_private.lifecycle_now(p_environment,row.subject_id);
 update service_private.workspace_lifecycle set state='deleted',revision=revision+1,online_deleted_at=coalesce(online_deleted_at,at_time),backup_purge_by=coalesce(backup_purge_by,at_time+interval '840 hours'),
  head_seq=null,min_retained_seq=null,key_epoch=null,roster_version=null,checkpoint_version=null,inventory_cursor=null,verification_cursor=null,
  lease=null,lease_until=null,next_due_at=null where environment=p_environment and workspace_id=p_workspace returning * into row;
 update service_private.account_lifecycle set revision=revision+1 where environment=p_environment and subject_id=row.subject_id;
 select request_id into request from service_private.deletion_requests where environment=p_environment and subject_id=row.subject_id and confirmed_at is not null
  and (scope='account' or workspace_id=p_workspace) order by confirmed_at desc limit 1;
 perform service_private.enqueue_deletion(row,request,at_time,'online_deleted');
 update service_private.deletion_requests d set content='deleted' where d.environment=p_environment and d.subject_id=row.subject_id and d.confirmed_at is not null
  and not exists(select 1 from service_private.workspace_lifecycle l where l.environment=p_environment and l.subject_id=row.subject_id and l.state<>'deleted'
   and (d.scope='account' or (l.workspace_id=d.workspace_id and l.generation=d.generation)));
 return jsonb_build_object('ok',true,'phase','deleted');
end $$;

-- Account completion remains metadata only; it can be exported after Auth no longer exists.
create function service_private.record_account_deleted() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare event uuid;payload jsonb;at_time timestamptz;
begin
 if old.state='deleted' or new.state<>'deleted' then return new;end if;
 event:=gen_random_uuid();at_time:=service_private.lifecycle_now(new.environment,new.subject_id);
 payload:=jsonb_build_object('version',1,'eventId',event,'environment',new.environment,'projectRef',(select project_ref from service_private.policy where id=1),
  'subjectId',new.subject_id,'ownerTag',encode(new.owner_tag,'hex'),'requestId',new.delete_request_id,'target',null,
  'lifecycleVersion',new.revision,'reason','account_delete','kind','account_deleted','closedAt',service_private.format_utc(new.confirmed_at),
  'retrieveUntil',null,'onlineDeleteBy',service_private.format_utc(new.online_delete_by),'onlineDeletedAt',service_private.format_utc(at_time),
  'deletionReceipt',service_private.receipt_metadata(new.environment,new.delete_request_id,new.subject_id));
 insert into service_private.deletion_outbox(event_id,environment,subject_id,request_id,lifecycle_revision,event_kind,record,digest,created_at)
  values(event,new.environment,new.subject_id,new.delete_request_id,new.revision,'account_deleted',payload,
   encode(public._sha256(convert_to(public._canonical_json(payload),'UTF8')),'hex'),at_time);
 return new;
end $$;
create trigger account_deleted_outbox after update on service_private.account_lifecycle for each row execute function service_private.record_account_deleted();

-- This barrier supplements, and cannot replace, quarantine outside a restored database.
alter table service_private.lifecycle_policy add column restore_blocked boolean not null default false;
create table service_private.restore_runs (
 id uuid primary key default gen_random_uuid(),environment text not null,store_id text not null,through_cursor bigint not null check(through_cursor>=0),
 after_cursor bigint not null default 0,phase text not null default 'capture' check(phase in ('capture','project','replayed')),
 key_digest text not null,created_at timestamptz not null default clock_timestamp()
);
create unique index one_restore_run on service_private.restore_runs(environment) where phase<>'replayed';
create table service_private.restore_events (
 run_id uuid not null references service_private.restore_runs(id),cursor bigint not null,event_id uuid not null,digest text not null,
 record jsonb not null,projected boolean not null default false,receipt_projected boolean not null default false,primary key(run_id,cursor),unique(run_id,event_id)
);
create function public.lifecycle_restore_begin(p_environment text,p_store text,p_through text,p_key_digest text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare run service_private.restore_runs;actual text;
begin
 perform service_private.worker_scope();
 if p_environment is distinct from (select environment from service_private.policy where id=1) or coalesce(p_store,'')='' or length(p_store)>200
  or coalesce(p_through,'')!~'^(0|[1-9][0-9]{0,18})$' or p_through::numeric>9223372036854775807 then raise exception 'invalid_request';end if;
 select encode(public._sha256(key),'hex') into actual from service_private.lifecycle_keys where id=1;
 if actual is distinct from p_key_digest then raise exception 'restore_key_mismatch';end if;
 perform pg_advisory_xact_lock(hashtextextended('lifecycle-restore:'||p_environment,27));
 update service_private.lifecycle_policy set restore_blocked=true,restore_admission_ready=false where id=1;
 select * into run from service_private.restore_runs where environment=p_environment and phase<>'replayed';
 if run.id is not null then
  if run.store_id<>p_store or run.through_cursor<>p_through::bigint or run.key_digest<>p_key_digest then raise exception 'restore_checkpoint_conflict';end if;
 else
  insert into service_private.restore_runs(environment,store_id,through_cursor,key_digest) values(p_environment,p_store,p_through::bigint,p_key_digest) returning * into run;
 end if;
 return jsonb_build_object('ok',true,'runId',run.id,'after',run.after_cursor::text,'through',run.through_cursor::text,'phase',run.phase);
end $$;
create function public.lifecycle_restore_capture(p_run uuid,p_store text,p_after text,p_entries jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare run service_private.restore_runs;entry jsonb;payload jsonb;cursor bigint;digest text;
begin
 select * into run from service_private.restore_runs where id=p_run for update;
 if run.id is null or run.phase<>'capture' or run.store_id is distinct from p_store or run.after_cursor::text is distinct from p_after
  or not exists(select 1 from service_private.lifecycle_policy where restore_blocked and not restore_admission_ready) then raise exception 'restore_checkpoint_conflict';end if;
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)>100 then raise exception 'invalid_request';end if;
 cursor:=run.after_cursor;
 for entry in select jsonb_array_elements(p_entries) loop
  if coalesce(entry->>'cursor','')!~'^[1-9][0-9]{0,18}$' or (entry->>'cursor')::numeric<>cursor::numeric+1 or cursor>=run.through_cursor then raise exception 'restore_checkpoint_conflict';end if;
  cursor:=cursor+1;payload:=entry->'record';digest:=encode(public._sha256(convert_to(public._canonical_json(payload),'UTF8')),'hex');
  if octet_length(entry::text)>8192 or entry->>'digest' is distinct from digest or payload->>'eventId' is distinct from entry->>'eventId'
   or payload->'version' is distinct from '1'::jsonb or payload->>'environment' is distinct from run.environment
   or payload->>'projectRef' is distinct from (select project_ref from service_private.policy where id=1)
   or coalesce(payload->>'ownerTag','')!~'^[a-f0-9]{64}$' or coalesce(payload->>'kind','') not in ('intent','ordinary_cancelled','online_deleted','account_deleted')
   or coalesce(payload->>'lifecycleVersion','')!~'^[0-9]{1,16}$' or (payload->>'lifecycleVersion')::numeric>9007199254740991 then raise exception 'restore_event_invalid';end if;
  perform service_private.assert_worker_target(run.environment,(payload->>'subjectId')::uuid,
   (payload->'target'->>'workspaceId')::uuid,(payload->'target'->>'generation')::uuid);
  insert into service_private.restore_events(run_id,cursor,event_id,digest,record) values(p_run,cursor,(entry->>'eventId')::uuid,digest,payload);
 end loop;
 if cursor=run.after_cursor and cursor<run.through_cursor then raise exception 'restore_prefix_missing';end if;
 update service_private.restore_runs set after_cursor=cursor,phase=case when cursor=through_cursor then 'project' else 'capture' end where id=p_run returning * into run;
 return jsonb_build_object('ok',true,'after',run.after_cursor::text,'through',run.through_cursor::text,'phase',run.phase);
end $$;
create function service_private.restore_receipt(p_environment text,p_subject uuid,p_request uuid,p_target jsonb,p_metadata jsonb,p_owner uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare existing service_private.deletion_requests;receipt_scope text;prepared timestamptz;confirmed timestamptz;expected bigint;digest bytea;target_workspace uuid;target_generation uuid;
begin
 if p_request is null then
  if p_metadata is distinct from 'null'::jsonb and p_metadata is not null then raise exception 'restore_event_invalid';end if;
  return;
 end if;
 if jsonb_typeof(p_metadata) is distinct from 'object'
  or (select array_agg(key order by key) from jsonb_object_keys(p_metadata) key) is distinct from array['confirmedAt','expectedRevision','preparedAt','receiptDigest','scope']
  or coalesce(p_metadata->>'scope','') not in ('account','cloud') or coalesce(p_metadata->>'receiptDigest','')!~'^[a-f0-9]{64}$'
  or jsonb_typeof(p_metadata->'expectedRevision') is distinct from 'number' or coalesce(p_metadata->>'expectedRevision','')!~'^[0-9]{1,16}$'
  or (p_metadata->>'expectedRevision')::numeric>9007199254740991 or p_metadata->>'preparedAt' is null or p_metadata->>'confirmedAt' is null then raise exception 'restore_event_invalid';end if;
 receipt_scope:=p_metadata->>'scope';prepared:=(p_metadata->>'preparedAt')::timestamptz;confirmed:=(p_metadata->>'confirmedAt')::timestamptz;
 expected:=(p_metadata->>'expectedRevision')::bigint;digest:=decode(p_metadata->>'receiptDigest','hex');
 if confirmed<prepared or confirmed>=prepared+interval '24 hours' then raise exception 'restore_event_invalid';end if;
 if receipt_scope='cloud' then
  if jsonb_typeof(p_target) is distinct from 'object' or (select array_agg(key order by key) from jsonb_object_keys(p_target) key) is distinct from array['generation','workspaceId'] then raise exception 'restore_event_invalid';end if;
  target_workspace:=(p_target->>'workspaceId')::uuid;target_generation:=(p_target->>'generation')::uuid;
  if target_workspace is null or target_generation is null then raise exception 'restore_event_invalid';end if;
 end if;
 select * into existing from service_private.deletion_requests where environment=p_environment and request_id=p_request for update;
 if existing.request_id is not null then
  if (existing.subject_id,existing.scope,existing.workspace_id,existing.generation,existing.expected_revision,existing.prepared_at)
   is distinct from (p_subject,receipt_scope,target_workspace,target_generation,expected,prepared)
   or (existing.receipt_digest is distinct from digest and not(existing.receipt_digest=decode(repeat('00',32),'hex') and clock_timestamp()>=confirmed+interval '720 hours'))
   or existing.confirmed_at is not null and (existing.confirmed_at is distinct from confirmed or existing.status_expires_at is distinct from confirmed+interval '720 hours'
    or existing.online_delete_by is distinct from confirmed+interval '168 hours') then raise exception 'restore_receipt_conflict';end if;
 end if;
 insert into service_private.deletion_requests(environment,request_id,subject_id,session_id,scope,workspace_id,generation,expected_revision,receipt_digest,auth_target,
  prepared_at,prepare_expires_at,confirmed_at,online_delete_by,status_expires_at,intent,content,auth_state,renewal)
 values(p_environment,p_request,p_subject,coalesce(existing.session_id,'00000000-0000-4000-8000-000000000000'),receipt_scope,target_workspace,target_generation,expected,digest,
  case when receipt_scope='account' then p_owner end,prepared,prepared+interval '24 hours',confirmed,confirmed+interval '168 hours',confirmed+interval '720 hours','durable','pending',
  case when receipt_scope='cloud' then 'not_applicable' when p_owner is null then 'deleted' else 'pending' end,case when receipt_scope='account' then 'pending' else 'not_applicable' end)
 on conflict(environment,request_id) do update set receipt_digest=excluded.receipt_digest,confirmed_at=excluded.confirmed_at,prepare_expires_at=excluded.prepare_expires_at,
  online_delete_by=excluded.online_delete_by,status_expires_at=excluded.status_expires_at,intent='durable',content='pending',auth_target=excluded.auth_target,auth_state=excluded.auth_state,renewal=excluded.renewal;
end $$;
create function public.lifecycle_restore_project(p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare run service_private.restore_runs;event service_private.restore_events;payload jsonb;a service_private.account_lifecycle;l service_private.workspace_lifecycle;
 subject uuid;owner uuid;workspace uuid;target_generation uuid;request uuid;closed timestamptz;ended timestamptz;until_at timestamptz;deadline timestamptz;v bigint;receipt_step boolean:=false;
begin
 select * into run from service_private.restore_runs where id=p_run;
 if run.id is null or run.phase not in ('project','replayed') or not exists(select 1 from service_private.lifecycle_policy where restore_blocked and not restore_admission_ready) then raise exception 'restore_checkpoint_conflict';end if;
 if run.phase='replayed' then return jsonb_build_object('ok',true,'phase','replayed','admissionBlocked',true);end if;
 -- Restore each original request independently; reducing latest generation fences must not lose older live receipts.
 select e.* into event from service_private.restore_events e where e.run_id=p_run and not e.receipt_projected and e.record->>'requestId' is not null order by e.cursor limit 1;
 receipt_step:=event.event_id is not null;
 if not receipt_step then
 -- Reduce the full immutable prefix first. An older ordinary intent cannot beat a newer cancellation.
 select e.* into event from service_private.restore_events e where e.run_id=p_run and not e.projected and not exists(
  select 1 from service_private.restore_events later where later.run_id=p_run and later.record->>'subjectId'=e.record->>'subjectId'
   and later.record->'target'=e.record->'target' and ((later.record->>'lifecycleVersion')::bigint>(e.record->>'lifecycleVersion')::bigint
    or ((later.record->>'lifecycleVersion')::bigint=(e.record->>'lifecycleVersion')::bigint and later.cursor>e.cursor)))
  order by case when e.record->'target'='null'::jsonb then 0 else 1 end,e.record->>'subjectId',e.cursor limit 1;
 end if;
 if event.event_id is null then
  update service_private.restore_runs set phase='replayed' where id=p_run;
  return jsonb_build_object('ok',true,'phase','replayed','admissionBlocked',true);
 end if;
 payload:=event.record;subject:=(payload->>'subjectId')::uuid;request:=(payload->>'requestId')::uuid;v:=(payload->>'lifecycleVersion')::bigint;
 perform service_private.assert_worker_target(run.environment,subject,(payload->'target'->>'workspaceId')::uuid,(payload->'target'->>'generation')::uuid);
 perform pg_advisory_xact_lock(hashtextextended('subject:'||subject::text,9));
 select * into a from service_private.account_lifecycle where environment=run.environment and subject_id=subject;
 if a.subject_id is not null and a.owner_tag is distinct from decode(payload->>'ownerTag','hex') then raise exception 'restore_identity_conflict';end if;
 if exists(select 1 from service_private.account_lifecycle where environment=run.environment and owner_tag=decode(payload->>'ownerTag','hex') and subject_id<>subject) then raise exception 'restore_identity_conflict';end if;
 if a.subject_id is null then
  insert into service_private.account_lifecycle(environment,subject_id,owner_tag) values(run.environment,subject,decode(payload->>'ownerTag','hex')) returning * into a;
 end if;
 perform service_private.lock_account(subject,run.environment);
 select * into run from service_private.restore_runs where id=p_run for update;
 if run.phase<>'project' then raise exception 'restore_checkpoint_conflict';end if;
 owner:=a.user_id;
 if owner is null then select id into owner from auth.users where service_private.owner_tag(id)=a.owner_tag;end if;
 if receipt_step then
  if exists(select 1 from service_private.restore_events e where e.run_id=p_run and e.record->>'requestId'=request::text and (
   (e.record->'deletionReceipt')-'receiptDigest' is distinct from (payload->'deletionReceipt')-'receiptDigest'
   or (e.record->'deletionReceipt'->>'receiptDigest' is distinct from payload->'deletionReceipt'->>'receiptDigest' and not(
    e.record->'deletionReceipt'->>'receiptDigest'=repeat('00',32) and clock_timestamp()>=(payload->'deletionReceipt'->>'confirmedAt')::timestamptz+interval '720 hours'))
   or payload->'deletionReceipt'->>'scope'='cloud' and e.record->'target' is distinct from payload->'target')) then raise exception 'restore_receipt_conflict';end if;
  perform service_private.restore_receipt(run.environment,subject,request,payload->'target',payload->'deletionReceipt',owner);
  update service_private.restore_events set receipt_projected=true where run_id=p_run and record->>'requestId'=request::text;
  return jsonb_build_object('ok',true,'phase','project','admissionBlocked',true);
 end if;
 if payload->'target'='null'::jsonb then
  if payload->>'reason' is distinct from 'account_delete' or request is null then raise exception 'restore_event_invalid';end if;
  closed:=(payload->>'closedAt')::timestamptz;deadline:=(payload->>'onlineDeleteBy')::timestamptz;
  if closed is null or deadline is distinct from closed+interval '168 hours' then raise exception 'restore_event_invalid';end if;
  -- A pre-deletion backup still has its original trial fact and Auth provider identities.
  -- Recreate protection at the original deletion time; never restart its 180-day period.
  if owner is not null and exists(select 1 from public.billing_accounts where environment=run.environment and subject_id=subject and trial_started_at is not null) then
   insert into service_private.trial_protection(tag,claimed,reason,deleted_at,expires_at)
    values(service_private.owner_tag(owner,'trial-owner'),true,'trial_claimed',closed,closed+interval '180 days') on conflict(tag) do nothing;
   insert into service_private.trial_protection(tag,claimed,reason,deleted_at,expires_at)
    select service_private.tag_value(provider||'|'||(identity_data->>'sub'),'trial-provider'),true,'trial_claimed',closed,closed+interval '180 days'
     from auth.identities where user_id=owner and identity_data->>'sub' is not null on conflict(tag) do nothing;
  end if;
  update service_private.account_lifecycle set state=case when owner is null then 'deleted' else 'deleting' end,user_id=null,
   revision=greatest(revision,v),confirmed_at=coalesce(confirmed_at,closed),online_delete_by=least(coalesce(online_delete_by,deadline),deadline),delete_request_id=request,
   provider_user_id=coalesce(provider_user_id,owner),work_retry_at=clock_timestamp() where environment=run.environment and subject_id=subject;
  for l in select * from service_private.workspace_lifecycle where environment=run.environment and subject_id=subject order by workspace_id loop
   perform service_private.lock_workspace_row(subject,run.environment,l.workspace_id);
   update service_private.workspace_lifecycle set state='queued',reason='account_delete',revision=greatest(revision,v),closed_at=least(coalesce(closed_at,closed),closed),
    online_delete_by=least(coalesce(online_delete_by,deadline),deadline),inventory_completed_at=null,inventory_cursor=null,storage_verified_at=null,verification_cursor=null,
    next_due_at=closed,lease=null,lease_until=null where environment=run.environment and workspace_id=l.workspace_id returning * into l;
   perform service_private.enqueue_deletion(l,request,clock_timestamp());
  end loop;
  update service_private.deletion_requests set content='deleted' where environment=run.environment and request_id=request
   and not exists(select 1 from service_private.workspace_lifecycle where environment=run.environment and subject_id=subject and state<>'deleted');
  delete from auth.sessions where user_id=owner;
 else
  workspace:=(payload->'target'->>'workspaceId')::uuid;target_generation:=(payload->'target'->>'generation')::uuid;
  if workspace is null or target_generation is null then raise exception 'restore_event_invalid';end if;
  if exists(select 1 from public.workspaces where id=workspace and (public.workspaces.generation<>target_generation or user_id is distinct from owner)) then raise exception 'restore_identity_conflict';end if;
  perform service_private.lock_workspace_row(subject,run.environment,workspace);
  select * into l from service_private.workspace_lifecycle where environment=run.environment and workspace_id=workspace;
  if l.workspace_id is not null and (l.subject_id<>subject or l.generation<>target_generation) then raise exception 'restore_identity_conflict';end if;
  if payload->>'kind'='ordinary_cancelled' then
   -- A cancellation suppresses old destructive intent but cannot authenticate restored qualification.
   update service_private.workspace_lifecycle set boundary_verified=false,profile_verified=false,lease=null,lease_until=null where environment=run.environment and workspace_id=workspace and destructive_started_at is null;
  else
   closed:=(payload->>'closedAt')::timestamptz;ended:=(payload->>'accessEndedAt')::timestamptz;until_at:=(payload->>'retrieveUntil')::timestamptz;deadline:=(payload->>'onlineDeleteBy')::timestamptz;
   if closed is null or deadline is null or payload->>'reason' not in ('ordinary_expiry','explicit_cloud','account_delete','reset_sync') then raise exception 'restore_event_invalid';end if;
   insert into service_private.workspace_lifecycle(environment,subject_id,workspace_id,generation,revision,state,reason,closed_at,access_ended_at,retrieve_until,online_delete_by,
    scheduled_access_end,online_deleted_at,backup_purge_by,boundary_verified,next_due_at,destructive_started_at)
    values(run.environment,subject,workspace,target_generation,v,'queued',payload->>'reason',closed,ended,until_at,deadline,(payload->>'scheduledAccessEnd')::timestamptz,
     (payload->>'onlineDeletedAt')::timestamptz,(payload->>'onlineDeletedAt')::timestamptz+interval '840 hours',true,closed,
     case when payload->>'kind'='online_deleted' then closed end)
    on conflict(environment,workspace_id,generation) do update set state='queued',reason=excluded.reason,revision=greatest(service_private.workspace_lifecycle.revision,excluded.revision),
     closed_at=least(coalesce(service_private.workspace_lifecycle.closed_at,excluded.closed_at),excluded.closed_at),access_ended_at=excluded.access_ended_at,retrieve_until=excluded.retrieve_until,
     online_delete_by=least(coalesce(service_private.workspace_lifecycle.online_delete_by,excluded.online_delete_by),excluded.online_delete_by),
     online_deleted_at=coalesce(service_private.workspace_lifecycle.online_deleted_at,excluded.online_deleted_at),backup_purge_by=coalesce(service_private.workspace_lifecycle.backup_purge_by,excluded.backup_purge_by),
     destructive_started_at=coalesce(service_private.workspace_lifecycle.destructive_started_at,excluded.destructive_started_at),boundary_verified=true,
     inventory_completed_at=null,inventory_cursor=null,storage_verified_at=null,verification_cursor=null,next_due_at=excluded.next_due_at,lease=null,lease_until=null returning * into l;
   perform service_private.enqueue_deletion(l,request,clock_timestamp());
  end if;
 end if;
 update service_private.restore_events set projected=true where run_id=p_run and event_id=event.event_id;
 return jsonb_build_object('ok',true,'phase','project','admissionBlocked',true);
end $$;
create function public.lifecycle_restore_status(p_run uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'runId',id,'environment',environment,'storeId',store_id,'keyDigest',key_digest,
  'keyMatches',(select encode(public._sha256(key),'hex')=key_digest from service_private.lifecycle_keys where id=1),
  'after',after_cursor::text,'through',through_cursor::text,'phase',phase,'admissionBlocked',
  (select restore_blocked and not restore_admission_ready from service_private.lifecycle_policy where id=1)) from service_private.restore_runs where id=p_run
$$;

-- Block normal sync, AI admission/delivery and billing provider dispatch during replay.
do $restore_fence$
declare fn record;body text;
begin
 for fn in select oid,prosrc,proname from pg_proc where (pronamespace='service_private'::regnamespace and proname='require_version')
   or (pronamespace='public'::regnamespace and proname='billing_lock') loop
  body:=regexp_replace(fn.prosrc,'\mbegin\M',case when fn.proname='billing_lock' then
   'begin if exists(select 1 from service_private.lifecycle_policy where restore_blocked) and exists(select 1 from service_private.account_lifecycle where environment=p_environment and subject_id=p_user and state=''active'') then raise exception ''lifecycle_unavailable'';end if;'
   else 'begin if exists(select 1 from service_private.lifecycle_policy where restore_blocked) then raise exception ''lifecycle_unavailable'';end if;' end,'');
  execute replace(pg_get_functiondef(fn.oid),fn.prosrc,body);
 end loop;
 select oid,prosrc into fn from pg_proc where pronamespace='service_private'::regnamespace and proname='identity_active';
 body:='select not exists(select 1 from service_private.lifecycle_policy where restore_blocked) and ('||fn.prosrc||')';
 execute replace(pg_get_functiondef(fn.oid),fn.prosrc,body);
 select oid,prosrc into fn from pg_proc where pronamespace='service_private'::regnamespace and proname='lock_retained_boundary';
 body:=regexp_replace(fn.prosrc,'\mbegin\M','begin if exists(select 1 from service_private.lifecycle_policy where restore_blocked) then return jsonb_build_object(''ok'',false,''error'',''retrieval_configuration'');end if;','');
 execute replace(pg_get_functiondef(fn.oid),fn.prosrc,body);
end $restore_fence$;

-- Persist only provider-verified currency/tax; an absent tax value stays unknown.
do $financial_fields$
declare fn record;body text;
begin
 select oid,prosrc into fn from pg_proc where pronamespace='public'::regnamespace and proname='billing_commit';
 body:=replace(fn.prosrc,'-- A successful purchase consumes eligibility even if this reconciliation first sees its refund.',
  'if x->>''currency'' is distinct from ''usd'' or (x->>''tax_cents'' is not null and ((x->>''tax_cents'')!~''^[0-9]{1,10}$'' or (x->>''tax_cents'')::numeric>2147483647)) then raise exception ''billing_source_mismatch'';end if;
   update public.billing_transactions set currency=''usd'',tax_cents=(x->>''tax_cents'')::integer where environment=p_environment and subject_id=p_user and invoice_id=x->>''invoice_id'';
   -- A successful purchase consumes eligibility even if this reconciliation first sees its refund.');
 if body=fn.prosrc then raise exception 'billing_commit_integration_mismatch';end if;
 execute replace(pg_get_functiondef(fn.oid),fn.prosrc,body);
end $financial_fields$;

create index lifecycle_receipt_expiry on service_private.deletion_requests(status_expires_at);
create index lifecycle_financial_expiry on public.billing_transactions(retain_until);
create function public.lifecycle_cleanup_retention(p_environment text,p_limit integer default 100) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare worker_scope_value jsonb;member jsonb;n integer:=least(greatest(coalesce(p_limit,100),1),200);receipts bigint;trials bigint;ai bigint;financial bigint;t timestamptz:=clock_timestamp();
begin
 if p_environment is distinct from (select environment from service_private.policy where id=1) then raise exception 'lifecycle_configuration';end if;
 worker_scope_value:=service_private.worker_scope();
 if worker_scope_value is not null then for member in select value from jsonb_array_elements(worker_scope_value->'subjects') loop perform service_private.assert_worker_target(p_environment,(member->>'subjectId')::uuid);end loop;end if;
 -- Budget-first applies before receipt or other owned child locks too.
 perform 1 from public.ai_budget where id='integration-shared' for update;
 -- Expired receipts no longer authenticate. Pending private work keeps its separate authority.
 update service_private.deletion_requests set receipt_digest=decode(repeat('00',32),'hex') where (environment,request_id) in(
  select environment,request_id from service_private.deletion_requests where environment=p_environment and service_private.scope_subject(worker_scope_value,subject_id) and status_expires_at<=t
   and receipt_digest<>decode(repeat('00',32),'hex') order by status_expires_at limit n);
 get diagnostics receipts=row_count;
 delete from service_private.trial_protection where tag in(select tag from service_private.trial_protection where expires_at<=t
  and (worker_scope_value is null or tag in(select decode(value#>>'{}','hex') from jsonb_array_elements(worker_scope_value->'trialTags'))) order by expires_at limit n);get diagnostics trials=row_count;
 delete from public.ai_actions where ctid in(select ctid from public.ai_actions where environment=p_environment and service_private.scope_subject(worker_scope_value,subject_id) and created_at<t-interval '90 days'
  order by created_at limit n);get diagnostics ai=row_count;
 delete from public.ai_limit_events where ctid in(select ctid from public.ai_limit_events where environment=p_environment and service_private.scope_subject(worker_scope_value,subject_id) and created_at<t-interval '90 days' order by created_at limit n);
 delete from public.ai_protection p where p.subject_id in(select a.subject_id from service_private.account_lifecycle a where a.environment=p_environment and a.state='deleted'
  and service_private.scope_subject(worker_scope_value,a.subject_id) and a.confirmed_at+interval '180 days'<=t order by a.confirmed_at limit n);
 delete from service_private.financial_holds h where (h.environment,h.invoice_id,h.reference) in(select x.environment,x.invoice_id,x.reference from service_private.financial_holds x
  join public.billing_transactions f on f.environment=x.environment and f.invoice_id=x.invoice_id where x.environment=p_environment and service_private.scope_subject(worker_scope_value,f.subject_id) and x.released_at is not null and f.retain_until<=t limit n);
 delete from public.billing_transactions x where (x.environment,x.invoice_id) in(select f.environment,f.invoice_id from public.billing_transactions f
  where f.environment=p_environment and service_private.scope_subject(worker_scope_value,f.subject_id) and f.retain_until<=t and not exists(select 1 from service_private.financial_holds h where h.environment=f.environment and h.invoice_id=f.invoice_id)
   and not exists(select 1 from public.billing_compensations c where c.environment=f.environment and c.invoice_id=f.invoice_id and c.status<>'complete')
  order by f.retain_until limit n);
 get diagnostics financial=row_count;
 return jsonb_build_object('ok',true,'receipts',receipts,'trialProtection',trials,'aiReceipts',ai,'financialFacts',financial);
end $$;

-- Guard scoped claims and every later write; a final cleanup filter alone is insufficient.
do $worker_scope_wiring$
declare fn record;body text;guard text;
begin
 select oid,prosrc into fn from pg_proc where pronamespace='public'::regnamespace and proname='billing_take_work';
 body:=replace(fn.prosrc,'declare jobs jsonb;','declare selected_scope jsonb;jobs jsonb;');
 body:=regexp_replace(body,'\mbegin\M','begin selected_scope:=service_private.worker_scope();','');
 body:=replace(body,'where environment=p_environment and ','where environment=p_environment and service_private.scope_subject(selected_scope,subject_id) and ');
 execute replace(pg_get_functiondef(fn.oid),fn.prosrc,body);
 select oid,prosrc into fn from pg_proc where pronamespace='public'::regnamespace and proname='lifecycle_take_work';
 body:=replace(fn.prosrc,'declare exports jsonb;','declare selected_scope jsonb;exports jsonb;');
 body:=regexp_replace(body,'\mbegin\M','begin selected_scope:=service_private.worker_scope();','');
 body:=replace(body,'where environment=p_environment and ','where environment=p_environment and service_private.scope_subject(selected_scope,subject_id) and ');
 body:=replace(body,'where a.environment=p_environment and ','where a.environment=p_environment and service_private.scope_subject(selected_scope,a.subject_id) and ');
 body:=replace(body,'loop perform service_private.lock_account(subject,p_environment);end loop;',
  'loop perform service_private.assert_worker_target(p_environment,subject); perform service_private.lock_account(subject,p_environment); perform service_private.assert_worker_target(p_environment,subject);end loop;');
 execute replace(pg_get_functiondef(fn.oid),fn.prosrc,body);
 for fn in select oid,prosrc,proname from pg_proc where pronamespace='public'::regnamespace and proname in (
  'lifecycle_prepare_job','lifecycle_inventory_page','lifecycle_delete_batch','lifecycle_object_result','lifecycle_storage_scan_status','lifecycle_storage_scan_page','lifecycle_purge_content','lifecycle_reconcile_transfers',
  'lifecycle_ack_export','lifecycle_retry_work','lifecycle_account_ready','lifecycle_account_deleted','lifecycle_account_work_done','lifecycle_renewal_result','lifecycle_settlement_operation',
  'billing_lock','billing_assert_lease','billing_finish_work','lifecycle_transfer_dispatch','lifecycle_transfer_finish') loop
  if fn.proname in ('lifecycle_prepare_job','lifecycle_inventory_page','lifecycle_delete_batch','lifecycle_object_result','lifecycle_storage_scan_status','lifecycle_storage_scan_page','lifecycle_purge_content','lifecycle_reconcile_transfers') then
   guard:='perform service_private.assert_worker_target(p_environment,null,p_workspace,p_generation);';
  elsif fn.proname='lifecycle_ack_export' then
   guard:='perform service_private.assert_worker_target(p_environment,(select subject_id from service_private.deletion_outbox where event_id=p_event and environment=p_environment));';
  elsif fn.proname='lifecycle_retry_work' then
   guard:='perform service_private.assert_worker_target(p_environment,case when p_kind=''export'' then (select subject_id from service_private.deletion_outbox where event_id=p_id and environment=p_environment) else (select subject_id from service_private.workspace_lifecycle where workspace_id=p_id and environment=p_environment) end);';
  elsif fn.proname='billing_finish_work' then
   guard:='perform service_private.assert_worker_target(p_environment,(select subject_id from public.billing_inbox where environment=p_environment and provider=p_provider and event_id=p_event));';
  elsif fn.proname in ('lifecycle_transfer_dispatch','lifecycle_transfer_finish') then
   guard:='if coalesce(nullif(current_setting(''request.headers'',true),'''')::jsonb?''x-goalloom-lifecycle-scope'',false) then perform service_private.assert_worker_target((select environment from service_private.cloud_transfers where ticket_id=p_ticket),(select subject_id from service_private.cloud_transfers where ticket_id=p_ticket),(select workspace_id from service_private.cloud_transfers where ticket_id=p_ticket),(select generation from service_private.cloud_transfers where ticket_id=p_ticket));end if;';
  elsif fn.proname='lifecycle_account_deleted' then
   guard:='perform service_private.assert_worker_target(p_environment,p_subject,null,null,p_owner);';
  elsif fn.proname in ('lifecycle_settlement_operation','billing_lock','billing_assert_lease') then
   guard:=case when fn.proname='lifecycle_settlement_operation' then '' else 'if coalesce(nullif(current_setting(''request.headers'',true),'''')::jsonb?''x-goalloom-lifecycle-scope'',false) or exists(select 1 from service_private.account_lifecycle where environment=p_environment and subject_id=p_user and state<>''active'') then ' end
    ||'perform service_private.assert_worker_target(p_environment,p_user);'||case when fn.proname='lifecycle_settlement_operation' then '' else ' end if;' end;
  else guard:='perform service_private.assert_worker_target(p_environment,p_subject);';end if;
  if fn.proname='billing_finish_work' then
   body:='begin '||guard||regexp_replace(fn.prosrc,';\s*$','')||';end;';
   execute replace(replace(pg_get_functiondef(fn.oid),fn.prosrc,body),'LANGUAGE sql','LANGUAGE plpgsql');
   continue;
  end if;
  body:=regexp_replace(fn.prosrc,'\mbegin\M','begin '||guard,'');
  body:=regexp_replace(body,'(perform service_private.lock_account\([^;]+;)',E'\\1 '||guard,'g');
  execute replace(pg_get_functiondef(fn.oid),fn.prosrc,body);
 end loop;
end $worker_scope_wiring$;

do $acl$
declare fn record;
begin
 alter table service_private.restore_runs enable row level security;
 alter table service_private.restore_events enable row level security;
 alter table service_private.transfer_drain_policy enable row level security;
 alter table service_private.worker_access enable row level security;
 alter table service_private.worker_scopes enable row level security;
 revoke all on service_private.restore_runs,service_private.restore_events from public,anon,authenticated,service_role;
 revoke all on service_private.transfer_drain_policy from public,anon,authenticated,service_role;
 revoke all on service_private.worker_access,service_private.worker_scopes from public,anon,authenticated,service_role;
 for fn in select oid::regprocedure name from pg_proc where pronamespace='service_private'::regnamespace loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.name);
 end loop;
 for fn in select oid::regprocedure name from pg_proc where pronamespace='public'::regnamespace and proname in
  ('lifecycle_storage_scan_status','lifecycle_storage_scan_page','lifecycle_purge_content','lifecycle_cleanup_retention',
   'lifecycle_restore_begin','lifecycle_restore_capture','lifecycle_restore_project','lifecycle_restore_status','lifecycle_reconcile_transfers','lifecycle_scope_check') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.name);
  execute format('grant execute on function %s to service_role',fn.name);
 end loop;
end $acl$;
-- An operator must separately prove independent ledger, restore admission and scheduler readiness.
-- Installing a hook is not proof that a scheduled worker or supplier backup disposal exists.
notify pgrst,'reload schema';
