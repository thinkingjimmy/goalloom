-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Immutable D1 through 0024, verified Auth, original billing/AI facts and server UTC.
-- OUTPUT: Auth-independent subjects, canonical fences, fixed retained boundary and creator-only seed admission.
-- POS: D2 foundation. No retrieval/deletion dependency on a later migration; deployment enables no environment.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

-- Admission is paused by the leased deployer; the budget row serializes existing AI accounting.
do $guard$ begin
 if exists(select 1 from service_private.policy where enabled) then raise exception 'Pause sync admission before D2 migration';end if;
 perform 1 from public.ai_budget where id='integration-shared' for update;
end $guard$;

create table service_private.lifecycle_policy (
 id integer primary key check(id=1), enabled boolean not null default false,
 independent_ledger_ready boolean not null default false,
 restore_admission_ready boolean not null default false,
 cleanup_wiring_ready boolean not null default false
);
insert into service_private.lifecycle_policy(id) values(1);
create table service_private.lifecycle_keys (
 id integer primary key check(id=1), key bytea not null check(octet_length(key)=32)
);
create function service_private.secure_random(p_bytes integer) returns bytea
language plpgsql volatile security definer set search_path='' as $$
declare value bytea;
begin
 if p_bytes is null or p_bytes<1 or p_bytes>64 then raise exception 'invalid_request';end if;
 if to_regprocedure('extensions.gen_random_bytes(integer)') is not null then
  execute 'select extensions.gen_random_bytes($1)' into value using p_bytes;
 elsif to_regprocedure('public.gen_random_bytes(integer)') is not null then
  execute 'select public.gen_random_bytes($1)' into value using p_bytes;
 else raise exception 'lifecycle_configuration';end if;
 return value;
end $$;
insert into service_private.lifecycle_keys values(1,service_private.secure_random(32));
create function service_private.owner_tag(p_owner uuid,p_purpose text default 'owner-route') returns bytea
language plpgsql stable security definer set search_path='' as $$
declare result bytea; secret bytea;
begin
 select key into strict secret from service_private.lifecycle_keys where id=1;
 if to_regprocedure('extensions.hmac(bytea,bytea,text)') is not null then
  execute 'select extensions.hmac($1,$2,''sha256'')' into result using convert_to(p_purpose||'|'||p_owner::text,'UTF8'),secret;
 elsif to_regprocedure('public.hmac(bytea,bytea,text)') is not null then
  execute 'select public.hmac($1,$2,''sha256'')' into result using convert_to(p_purpose||'|'||p_owner::text,'UTF8'),secret;
 else raise exception 'lifecycle_configuration';end if;
 return result;
end $$;
create table service_private.account_lifecycle (
 environment text not null check(environment in ('development','production')),
 subject_id uuid not null default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
 owner_tag bytea not null, state text not null default 'active' check(state in ('active','deleting','deleted')),
 revision bigint not null default 0 check(revision between 0 and 9007199254740991),
 confirmed_at timestamptz, online_delete_by timestamptz, delete_request_id uuid,
 provider_user_id uuid, provider_identity_until timestamptz,
 primary key(environment,subject_id),unique(subject_id),unique(environment,user_id),unique(environment,owner_tag)
);
create table service_private.workspace_lifecycle (
 environment text not null,subject_id uuid not null,workspace_id uuid not null,generation uuid not null,
 revision bigint not null default 1 check(revision between 1 and 9007199254740991),
 state text not null default 'active' check(state in ('active','retained','queued','deleting','deleted')),
 reason text check(reason in ('ordinary_expiry','explicit_cloud','account_delete','reset_sync')),
 scheduled_access_end timestamptz,access_ended_at timestamptz,retrieve_until timestamptz,
 closed_at timestamptz,online_delete_by timestamptz,destructive_started_at timestamptz,
 online_deleted_at timestamptz,backup_purge_by timestamptz,
 head_seq bigint,min_retained_seq bigint,key_epoch integer,roster_version integer,checkpoint_version integer,
 profile_verified boolean not null default false,seed_required boolean not null default true,
 next_due_at timestamptz,lease uuid,lease_until timestamptz,attempts integer not null default 0,
 primary key(environment,workspace_id,generation),unique(workspace_id),
 foreign key(environment,subject_id) references service_private.account_lifecycle(environment,subject_id),
 check(retrieve_until is null or retrieve_until=access_ended_at+interval '720 hours'),
 check(backup_purge_by is null or backup_purge_by=online_deleted_at+interval '840 hours')
);
create index lifecycle_due on service_private.workspace_lifecycle(next_due_at) where state<>'deleted';
create table service_private.initializations (
 workspace_id uuid primary key,generation uuid not null,request_id uuid not null,creator_device_id uuid not null,
 final_op_id uuid not null,final_seq bigint,final_payload_hash text,initial_envelopes jsonb not null,
 created_at timestamptz not null,completed_at timestamptz,
 unique(request_id),check((final_seq is null)=(final_payload_hash is null)),
 check(final_seq is null or final_seq between 1 and 9007199254740991),
 check(final_payload_hash is null or final_payload_hash~'^[a-f0-9]{64}$'),
 check(completed_at is null or final_seq is not null)
);

-- One subject per existing account, including retained AI accounting. No body data is read.
insert into service_private.account_lifecycle(environment,user_id,owner_tag,provider_user_id)
 select environment,user_id,service_private.owner_tag(user_id),user_id from (
  select environment,user_id from public.billing_accounts union
  select environment,user_id from public.ai_actions union
  select environment,user_id from public.ai_limit_events union
  select (select environment from public.ai_budget where id='integration-shared'),user_id from public.ai_protection union
  select (select environment from service_private.policy where id=1),user_id from public.workspaces union
  select (select environment from service_private.policy where id=1),user_id from public.devices
 ) owners where environment is not null;

-- Re-key the original tables in one deferred-FK transaction, retaining fact/operation identities.
do $subjects$
declare row record;name text;definition text;body text;
begin
 for row in select c.oid,c.conrelid::regclass tab,c.conname from pg_constraint c
  where c.contype='f' and c.conrelid in (
   'public.billing_accounts'::regclass,'public.billing_customers'::regclass,'public.billing_subscriptions'::regclass,
   'public.billing_transactions'::regclass,'public.billing_grace'::regclass,'public.billing_operations'::regclass,
   'public.billing_compensations'::regclass,'service_private.continuations'::regclass,
   'service_private.operation_aliases'::regclass,'public.ai_actions'::regclass,'public.ai_protection'::regclass,'public.ai_limit_events'::regclass)
 loop
  if (select confrelid from pg_constraint where oid=row.oid)='auth.users'::regclass then
   execute format('alter table %s drop constraint %I',row.tab,row.conname);
  else execute format('alter table %s alter constraint %I deferrable initially deferred',row.tab,row.conname);end if;
 end loop;
 set constraints all deferred;
 foreach name in array array['public.billing_accounts','public.billing_customers','public.billing_subscriptions',
  'public.billing_transactions','public.billing_grace','public.billing_operations','public.billing_compensations',
  'public.billing_inbox','service_private.continuations','service_private.operation_aliases',
  'public.ai_actions','public.ai_protection','public.ai_limit_events'] loop
  execute format('alter table %s rename column user_id to subject_id',name);
  if name='public.ai_protection' then
   execute format('update %s t set subject_id=a.subject_id from service_private.account_lifecycle a where a.user_id=t.subject_id and a.environment=(select environment from public.ai_budget where id=''integration-shared'')',name);
  else
   execute format('update %s t set subject_id=a.subject_id from service_private.account_lifecycle a where a.user_id=t.subject_id and a.environment=t.environment',name);
  end if;
 end loop;
 set constraints all immediate;
 alter table public.billing_accounts add foreign key(environment,subject_id) references service_private.account_lifecycle(environment,subject_id);
 alter table public.ai_actions add foreign key(environment,subject_id) references service_private.account_lifecycle(environment,subject_id);
 alter table public.ai_limit_events add foreign key(environment,subject_id) references service_private.account_lifecycle(environment,subject_id);
 alter table public.ai_protection add foreign key(subject_id) references service_private.account_lifecycle(subject_id);
 -- Preserve D0/R18 algorithms while replacing their private ownership column, not migration history.
 for row in select p.oid,p.proname,n.nspname,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'billing_%' or p.proname in
    ('service_continuation','service_operation_alias','service_reject_operation','service_resolve_operation',
     'ai_receipt_metadata','ai_admit','ai_settle','ai_receipt','ai_service_status'))
 loop
  body:=regexp_replace(row.prosrc,'\muser_id\M','subject_id','g');
  -- Auth-session ownership is still the live Auth UUID, never the internal billing subject.
  body:=replace(body,'from auth.sessions where id=p_session and subject_id=p_user',
   'from auth.sessions where id=p_session and user_id=service_private.live_user(p_environment,p_user)');
  definition:=pg_get_functiondef(row.oid);
  definition:=replace(definition,row.prosrc,body);
  execute definition;
 end loop;
end $subjects$;

create function service_private.subject_for_identity(p_environment text,p_identity uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select subject_id from service_private.account_lifecycle where environment=p_environment and
  (subject_id=p_identity or user_id=p_identity or owner_tag=service_private.owner_tag(p_identity)) limit 1
$$;
create function service_private.live_user(p_environment text,p_subject uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select user_id from service_private.account_lifecycle where environment=p_environment and subject_id=p_subject and state='active'
$$;
create function service_private.format_utc(p_value timestamptz) returns text
language sql immutable set search_path='' as $$
 select to_char(p_value at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;
create function service_private.lifecycle_now(p_environment text,p_subject uuid) returns timestamptz
language sql volatile security definer set search_path='' as $$
 select coalesce((select test_now from public.billing_accounts where environment=p_environment and subject_id=p_subject and environment='development'),clock_timestamp())
$$;
create function service_private.lock_account(p_subject uuid,p_environment text) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if p_subject is null then raise exception 'authentication_failed' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('subject:'||p_subject::text,9));
 perform 1 from service_private.account_lifecycle where environment=p_environment and subject_id=p_subject for update;
 if not found then raise exception 'authentication_failed' using errcode='42501';end if;
 perform 1 from public.billing_accounts where environment=p_environment and subject_id=p_subject for update;
end $$;
create function service_private.ensure_live_subject(p_environment text,p_owner uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare subject uuid;
begin
 select a.subject_id into subject from service_private.account_lifecycle a where a.environment=p_environment and a.user_id=p_owner and a.state='active';
 if subject is not null then return subject;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,9));
 if not exists(select 1 from auth.users where id=p_owner and deleted_at is null)
  or exists(select 1 from service_private.account_lifecycle where environment=p_environment and owner_tag=service_private.owner_tag(p_owner) and state<>'active') then
  raise exception 'authentication_failed' using errcode='42501';end if;
 insert into service_private.account_lifecycle(environment,user_id,owner_tag,provider_user_id)
  values(p_environment,p_owner,service_private.owner_tag(p_owner),p_owner) on conflict(environment,user_id) do nothing;
 select a.subject_id into strict subject from service_private.account_lifecycle a where a.environment=p_environment and a.user_id=p_owner and a.state='active';
 return subject;
end $$;
create function public.lifecycle_identity(p_environment text,p_owner uuid,p_create boolean default false) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare subject uuid; row service_private.account_lifecycle;
begin
 subject:=service_private.subject_for_identity(p_environment,p_owner);
 if subject is null and p_create then subject:=service_private.ensure_live_subject(p_environment,p_owner);end if;
 select * into row from service_private.account_lifecycle where environment=p_environment and subject_id=subject;
 return case when row.subject_id is null then null else jsonb_build_object('subjectId',row.subject_id,'mode',case when row.state='active' then 'active' else 'settlement' end,'providerUserId',row.provider_user_id,'revision',row.revision) end;
end $$;
revoke all on function public.lifecycle_identity(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.lifecycle_identity(text,uuid,boolean) to service_role;

alter table service_private.workspace_lifecycle add column boundary_verified boolean not null default false;
create function service_private.qualification_window(p_environment text,p_subject uuid,p_now timestamptz) returns jsonb
language sql stable security definer set search_path='' as $$
 with windows as (
  select trial_started_at first_at,trial_ends_at last_at from public.billing_accounts
   where environment=p_environment and subject_id=p_subject and trial_consumed_at is null and trial_started_at is not null
  union all select greatest(starts_at,paid_at),ends_at from public.billing_transactions
   where environment=p_environment and subject_id=p_subject and disposition='paid' and rc_verified and greatest(starts_at,paid_at)<ends_at
  union all select starts_at,ends_at from public.billing_grace where environment=p_environment and subject_id=p_subject and active
 ), merged as(select range_agg(tstzrange(first_at,last_at,'[)')) spans from windows)
 select jsonb_build_object('startsAt',lower(span),'endsAt',upper(span)) from merged,unnest(spans) span where span @> p_now
$$;
create function service_private.lock_workspace_row(p_subject uuid,p_environment text,p_workspace uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_subject::text||':'||p_workspace::text,18));
 perform 1 from public.workspaces where id=p_workspace and user_id=(select user_id from service_private.account_lifecycle where environment=p_environment and subject_id=p_subject) for update;
 perform 1 from service_private.workspace_lifecycle where environment=p_environment and subject_id=p_subject and workspace_id=p_workspace for update;
end $$;
create function service_private.reconcile_lifecycle_locked(p_subject uuid,p_environment text,p_now timestamptz) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare row service_private.workspace_lifecycle;ws public.workspaces;qualification_window_value jsonb;ended timestamptz;changed integer:=0;subject_state text;
begin
 select state into strict subject_state from service_private.account_lifecycle where environment=p_environment and subject_id=p_subject;
 qualification_window_value:=case when subject_state='active' then service_private.qualification_window(p_environment,p_subject,p_now) end;
 for row in select * from service_private.workspace_lifecycle where environment=p_environment and subject_id=p_subject and state<>'deleted' order by workspace_id loop
  perform service_private.lock_workspace_row(p_subject,p_environment,row.workspace_id);
  select * into row from service_private.workspace_lifecycle where environment=p_environment and workspace_id=row.workspace_id;
  if row.state='active' and row.boundary_verified then
   if qualification_window_value is not null then
    update service_private.workspace_lifecycle set scheduled_access_end=(qualification_window_value->>'endsAt')::timestamptz,next_due_at=(qualification_window_value->>'endsAt')::timestamptz where environment=p_environment and workspace_id=row.workspace_id;
   else
    ended:=least(coalesce(row.scheduled_access_end,p_now),p_now);
    select * into ws from public.workspaces where id=row.workspace_id and generation=row.generation;
    update service_private.workspace_lifecycle set state=case when p_now>=ended+interval '720 hours' then 'queued' else 'retained' end,
     reason='ordinary_expiry',revision=revision+1,access_ended_at=ended,retrieve_until=ended+interval '720 hours',
     online_delete_by=ended+interval '888 hours',closed_at=case when p_now>=ended+interval '720 hours' then ended+interval '720 hours' end,
     head_seq=ws.head_seq,min_retained_seq=ws.min_retained_seq,key_epoch=ws.key_epoch,roster_version=ws.roster_version,
     checkpoint_version=(select max(cp_version) from public.recovery_checkpoints where workspace_id=ws.id),next_due_at=ended+interval '720 hours'
     where environment=p_environment and workspace_id=row.workspace_id;
    changed:=changed+1;
   end if;
  elsif row.reason='ordinary_expiry' and row.destructive_started_at is null and row.state in ('retained','queued')
    and qualification_window_value is not null and (qualification_window_value->>'startsAt')::timestamptz<row.retrieve_until then
   update service_private.workspace_lifecycle set state='active',reason=null,revision=revision+1,
    scheduled_access_end=(qualification_window_value->>'endsAt')::timestamptz,access_ended_at=null,retrieve_until=null,closed_at=null,online_delete_by=null,
    head_seq=null,min_retained_seq=null,key_epoch=null,roster_version=null,checkpoint_version=null,next_due_at=(qualification_window_value->>'endsAt')::timestamptz,
    lease=null,lease_until=null where environment=p_environment and workspace_id=row.workspace_id;
   changed:=changed+1;
  elsif row.state='retained' and row.retrieve_until is not null and p_now>=row.retrieve_until then
   update service_private.workspace_lifecycle set state='queued',revision=revision+1,closed_at=row.retrieve_until,next_due_at=p_now where environment=p_environment and workspace_id=row.workspace_id;
   changed:=changed+1;
  end if;
 end loop;
 if changed>0 then update service_private.account_lifecycle set revision=revision+1 where environment=p_environment and subject_id=p_subject;end if;
 return jsonb_build_object('changed',changed);
end $$;
create function service_private.require_live_session(p_owner uuid,p_session uuid,p_environment text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare subject uuid;cfg service_private.policy;
begin
 select * into cfg from service_private.policy where id=1;
 if cfg.environment is distinct from p_environment or p_owner is null or p_session is null
  or not exists(select 1 from auth.users where id=p_owner and deleted_at is null)
  or not exists(select 1 from auth.sessions where id=p_session and user_id=p_owner) then
  raise exception 'authentication_failed' using errcode='42501';end if;
 select subject_id into subject from service_private.account_lifecycle where environment=p_environment and user_id=p_owner and state='active';
 if subject is null then raise exception 'authentication_failed' using errcode='42501';end if;
 return subject;
end $$;
create function service_private.lock_retained_boundary(p_owner uuid,p_environment text,p_workspace uuid,p_generation uuid,p_expected_revision bigint default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare subject uuid;row service_private.workspace_lifecycle;ws public.workspaces;i service_private.initializations;at_time timestamptz;initialization jsonb;
begin
 if not exists(select 1 from auth.users where id=p_owner and deleted_at is null) then raise exception 'authentication_failed' using errcode='42501';end if;
 select subject_id into subject from service_private.account_lifecycle where environment=p_environment and user_id=p_owner and state='active';
 if subject is null then return jsonb_build_object('ok',false,'error','retrieval_closed');end if;
 perform service_private.lock_account(subject,p_environment);
 if not coalesce((select enabled and independent_ledger_ready and restore_admission_ready and cleanup_wiring_ready from service_private.lifecycle_policy where id=1),false) then
  return jsonb_build_object('ok',false,'error','retrieval_configuration');end if;
 if not exists(select 1 from service_private.account_lifecycle where environment=p_environment and subject_id=subject and user_id=p_owner and state='active') then
  return jsonb_build_object('ok',false,'error','retrieval_closed');end if;
 at_time:=service_private.lifecycle_now(p_environment,subject);
 perform service_private.reconcile_lifecycle_locked(subject,p_environment,at_time);
 perform service_private.lock_workspace_row(subject,p_environment,p_workspace);
 select * into row from service_private.workspace_lifecycle where environment=p_environment and subject_id=subject and workspace_id=p_workspace and generation=p_generation;
 if row.workspace_id is null or row.state<>'retained' or row.reason<>'ordinary_expiry'
  or row.retrieve_until is null or at_time>=row.retrieve_until then return jsonb_build_object('ok',false,'error','retrieval_closed');end if;
 if p_expected_revision is not null and row.revision<>p_expected_revision then return jsonb_build_object('ok',false,'error','retrieval_boundary_changed');end if;
 if not row.boundary_verified then return jsonb_build_object('ok',false,'error','retrieval_data_unavailable','reason','integrity_failure');end if;
 if not row.profile_verified then return jsonb_build_object('ok',false,'error','retrieval_data_unavailable','reason','unsupported_profile');end if;
 select * into ws from public.workspaces where id=p_workspace and generation=p_generation and user_id=p_owner;
 if ws.id is null or (ws.head_seq,ws.min_retained_seq,ws.key_epoch,ws.roster_version) is distinct from (row.head_seq,row.min_retained_seq,row.key_epoch,row.roster_version) then
  return jsonb_build_object('ok',false,'error','retrieval_boundary_changed');end if;
 if row.seed_required then
  select * into i from service_private.initializations where workspace_id=p_workspace and generation=p_generation;
  if i.workspace_id is null then return jsonb_build_object('ok',false,'error','retrieval_data_unavailable','reason','integrity_failure');end if;
  if i.final_seq is null or i.final_payload_hash is null or row.head_seq=0 then return jsonb_build_object('ok',false,'error','retrieval_data_unavailable','reason','incomplete_history');end if;
  if (i.completed_at is null and row.head_seq<>i.final_seq) or i.final_seq>row.head_seq
   or not exists(select 1 from public.ops o join public.op_receipts r on r.workspace_id=o.workspace_id and r.op_id=o.op_id and r.seq=o.seq and r.payload_hash=o.payload_hash
    where o.workspace_id=p_workspace and o.seq=i.final_seq and o.op_id=i.final_op_id and o.payload_hash=i.final_payload_hash and o.device_id=i.creator_device_id) then
   return jsonb_build_object('ok',false,'error','retrieval_data_unavailable','reason','integrity_failure');end if;
  initialization:=jsonb_build_object('requestId',i.request_id,'creatorDeviceId',i.creator_device_id,'finalOpId',i.final_op_id,'finalPayloadHash',i.final_payload_hash,'finalSeq',i.final_seq);
 end if;
 return jsonb_build_object('ok',true,'boundary',jsonb_build_object('ownerId',p_owner,'workspaceId',p_workspace,'generation',p_generation,
  'lifecycleVersion',row.revision,'state','retained','accessEndedAt',service_private.format_utc(row.access_ended_at),
  'retrieveUntil',service_private.format_utc(row.retrieve_until),'onlineDeleteBy',service_private.format_utc(row.online_delete_by),
  'headSeq',row.head_seq,'minRetainedSeq',row.min_retained_seq,'keyEpoch',row.key_epoch,'rosterVersion',row.roster_version,
  'checkpointVersion',row.checkpoint_version,'initialization',initialization,'initializationCompleted',case when row.seed_required then i.completed_at is not null else null end));
end $$;

-- Enrollment preserves unsupported/unproven originals and blocks their activation rather than inventing history.
insert into service_private.workspace_lifecycle(environment,subject_id,workspace_id,generation,seed_required,profile_verified,boundary_verified,scheduled_access_end,next_due_at,state)
 select a.environment,a.subject_id,w.id,w.generation,false,
  w.min_retained_seq=0 and w.key_epoch=1 and exists(select 1 from public.recovery_checkpoints c where c.workspace_id=w.id and cp_version=1)
   and not exists(select 1 from public.recovery_checkpoints c where c.workspace_id=w.id and cp_version<>1)
   and not exists(select 1 from public.ops o where o.workspace_id=w.id and (o.key_epoch<>1 or o.format_version<>1 or cardinality(o.blob_refs)<>0))
   and (select count(*) from public.ops where workspace_id=w.id)=w.head_seq,
  q.value is not null,(q.value->>'endsAt')::timestamptz,(q.value->>'endsAt')::timestamptz,case when q.value is null then 'retained' else 'active' end
 from public.workspaces w join service_private.account_lifecycle a on a.user_id=w.user_id
 left join lateral(select service_private.qualification_window(a.environment,a.subject_id,service_private.lifecycle_now(a.environment,a.subject_id)) value) q on true;

alter table service_private.policy drop constraint policy_min_service_version_check;
update service_private.policy set min_service_version=2;
alter table service_private.policy add check(min_service_version=2);
alter table public.devices drop constraint devices_service_version_check;
alter table public.devices add check(service_version in (0,1,2));
create or replace function service_private.require_version() returns void
language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;headers jsonb;cfg service_private.policy;
begin
 select * into cfg from service_private.policy where id=1;
 if auth.uid() is null or auth.jwt()->>'role'<>'authenticated' or sid is null
  or auth.jwt()->>'iss' is distinct from 'https://'||cfg.project_ref||'.supabase.co/auth/v1'
  or not exists(select 1 from auth.users where id=auth.uid() and deleted_at is null)
  or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid()) then raise exception 'authentication_failed' using errcode='42501';end if;
 begin headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;exception when others then headers:='{}';end;
 if headers->>'x-goalloom-service-version' is distinct from '2' then raise exception 'upgrade_required' using errcode='PT409',detail='{"version":1,"minServiceVersion":2}';end if;
end $$;
create or replace function service_private.evaluate(p_user uuid,p_environment text default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare cfg service_private.policy;source jsonb;billing_state_value jsonb;subject uuid;why text;
begin
 select * into cfg from service_private.policy where id=1;
 if cfg.id is null or not cfg.enabled or p_environment is not null and cfg.environment<>p_environment
  or not coalesce((select enabled from service_private.lifecycle_policy where id=1),false) then
  return jsonb_build_object('version',1,'eligible',false,'error','billing_configuration','minServiceVersion',2);end if;
 source:=public.billing_source(cfg.environment);
 if source is null or cfg.source_fingerprint is null or md5(source::text)<>cfg.source_fingerprint
  or source->>'account_id'<>'acct_1QvwdlITpGuR8ZMB' or source->>'rc_project'<>'projd720c733' then
  return jsonb_build_object('version',1,'eligible',false,'error','billing_configuration','minServiceVersion',2);end if;
 select subject_id into subject from service_private.account_lifecycle where environment=cfg.environment and user_id=p_user and state='active';
 billing_state_value:=public.billing_status(cfg.environment,subject);
 if billing_state_value ? 'error' then why:='billing_configuration';
 elsif subject is not null and coalesce((billing_state_value->>'eligible')::boolean,false) then why:=null;
 elsif billing_state_value->>'status'='revoked' then why:='service_revoked';
 elsif billing_state_value->>'status'='expired' then why:='service_expired';else why:='service_not_started';end if;
 return jsonb_build_object('version',1,'eligible',why is null,'error',why,'billingStatus',billing_state_value->'status',
  'serverNow',billing_state_value->'serverNow','effectiveEnd',billing_state_value->'effectiveEnd','minServiceVersion',2);
end $$;
create or replace function service_private.lock_workspace(p_workspace uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare subject uuid;env text;
begin
 select environment into env from service_private.policy where id=1;
 select subject_id into subject from service_private.account_lifecycle where environment=env and user_id=auth.uid();
 perform service_private.lock_account(subject,env);
 if p_workspace is not null then perform service_private.lock_workspace_row(subject,env,p_workspace);end if;
end $$;
create function service_private.assert_active_generation_locked(p_subject uuid,p_environment text,p_workspace uuid,p_generation uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare row service_private.workspace_lifecycle;
begin
 if not exists(select 1 from service_private.account_lifecycle where environment=p_environment and subject_id=p_subject and state='active' and user_id is not null) then return jsonb_build_object('ok',false,'error','service_revoked');end if;
 select * into row from service_private.workspace_lifecycle where environment=p_environment and subject_id=p_subject and workspace_id=p_workspace and generation=p_generation;
 if row.workspace_id is null then return jsonb_build_object('ok',false,'error','workspace_unavailable');end if;
 if row.state<>'active' then return jsonb_build_object('ok',false,'error','service_expired');end if;
 if not row.profile_verified or not row.boundary_verified then return jsonb_build_object('ok',false,'error','retrieval_data_unavailable','reason','unsupported_profile');end if;
 return jsonb_build_object('ok',true);
end $$;
create or replace function service_private.write_access(p_workspace uuid default null) returns void
language plpgsql volatile security definer set search_path='' as $$
declare subject uuid;env text;gen uuid;result jsonb;
begin
 perform service_private.require_version();
 select environment into env from service_private.policy where id=1;
 select subject_id into subject from service_private.account_lifecycle where environment=env and user_id=auth.uid() and state='active';
 perform service_private.lock_account(subject,env);
 perform service_private.require_access();
 if p_workspace is not null then
  perform service_private.lock_workspace_row(subject,env,p_workspace);
  select generation into gen from public.workspaces where id=p_workspace and user_id=auth.uid();
  result:=service_private.assert_active_generation_locked(subject,env,p_workspace,gen);
  if not coalesce((result->>'ok')::boolean,false) then raise exception '%',result->>'error' using errcode='PT403';end if;
 end if;
end $$;
create function service_private.initialization_access(p_workspace uuid,p_device uuid,p_action text) returns void
language plpgsql volatile security definer set search_path='' as $$
declare i service_private.initializations;
begin
 select * into i from service_private.initializations where workspace_id=p_workspace;
 if i.workspace_id is null or i.completed_at is not null then return;end if;
 if i.creator_device_id is distinct from p_device or p_action not in ('read','seed_push','initial_envelopes','same_device_rebind') then
  raise exception 'initialization_pending' using errcode='PT409';end if;
 perform public._device_guard(p_device);
end $$;
create function service_private.check_profile(p_workspace uuid,p_roster jsonb default null,p_checkpoint jsonb default null) returns void
language plpgsql stable security definer set search_path='' as $$
declare original jsonb;
begin
 if p_roster is not null then
  if octet_length(convert_to(public._canonical_json(p_roster),'UTF8'))>65536 or p_roster->>'epoch' is distinct from '1'
   or coalesce(p_roster->>'recoverySignPub','')!~'^[a-f0-9]{64}$' or coalesce(p_roster->>'recoveryBoxPub','')!~'^[a-f0-9]{64}$' then raise exception 'unsupported_profile' using errcode='22023';end if;
  select roster into original from public.device_roster where workspace_id=p_workspace and version=1;
  if original is not null and (p_roster->>'recoverySignPub',p_roster->>'recoveryBoxPub') is distinct from (original->>'recoverySignPub',original->>'recoveryBoxPub') then raise exception 'unsupported_profile' using errcode='22023';end if;
 end if;
 if p_checkpoint is not null and (octet_length(convert_to(public._canonical_json(p_checkpoint),'UTF8'))>4096 or p_checkpoint->>'cpVersion' is distinct from '1' or p_checkpoint->>'epoch' is distinct from '1') then raise exception 'unsupported_profile' using errcode='22023';end if;
end $$;
create function service_private.read_access(p_workspace uuid,p_device uuid default null) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform service_private.write_access(p_workspace);
 if p_workspace is not null then
  if p_device is null then
   select id into p_device from public.devices where user_id=auth.uid() and auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and status='authorized' order by id limit 1;
  end if;
  perform service_private.initialization_access(p_workspace,p_device,'read');
 end if;
end $$;

-- Keep cryptographic implementations private; all ordinary workspace reads now use the same fence.
do $reads$
declare row record;definition text;body text;
begin
 for row in select p.oid,p.proname,p.prosrc,p.proargnames from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
  ('get_sync_status','pull_ops','get_key_envelopes','get_latest_checkpoint','get_roster') loop
  body:=replace(row.prosrc,'perform service_private.require_access();','perform service_private.read_access(p_workspace,p_device);');
  execute replace(pg_get_functiondef(row.oid),row.prosrc,body);
 end loop;
 -- The nested creation lock must use the already-held canonical subject fence, not reverse to Auth identity.
 select oid,prosrc into row from pg_proc where pronamespace='service_private'::regnamespace and proname='create_new_workspace';
 body:=replace(row.prosrc,'perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 9));','-- Canonical subject fence is held by the public D2 creator.');
 execute replace(pg_get_functiondef(row.oid),row.prosrc,body);
end $reads$;

create function service_private.create_seed_workspace(p_device uuid,p_workspace uuid,p_generation uuid,p_roster jsonb,p_roster_hash text,
 p_roster_sig bytea,p_checkpoint jsonb,p_rec_sig bytea,p_dev_sig bytea,p_initialization jsonb) returns void
language plpgsql volatile security definer set search_path='' as $$
declare subject uuid;env text;now_at timestamptz;existing service_private.initializations;envelopes jsonb;request_id uuid;final_id uuid;
begin
 perform service_private.write_access(null);
 select environment into env from service_private.policy where id=1;
 select subject_id into strict subject from service_private.account_lifecycle where environment=env and user_id=auth.uid() and state='active';
 perform service_private.lock_workspace_row(subject,env,p_workspace);
 if p_initialization is null or jsonb_typeof(p_initialization)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(p_initialization) key) is distinct from array['envelopes','finalOpId','requestId'] then raise exception 'invalid_request' using errcode='22023';end if;
 request_id:=(p_initialization->>'requestId')::uuid;final_id:=(p_initialization->>'finalOpId')::uuid;envelopes:=p_initialization->'envelopes';
 if request_id is null or final_id is null or jsonb_typeof(envelopes) is distinct from 'array' or jsonb_array_length(envelopes)<>2
  or (select array_agg(value->>'recipient' order by value->>'recipient') from jsonb_array_elements(envelopes)) is distinct from (select array_agg(v order by v) from unnest(array['recovery',p_device::text]) v)
  or exists(select 1 from jsonb_array_elements(envelopes) e where e->>'epoch' is distinct from '1' or e->>'rosterVersion' is distinct from '1' or e->>'signerDevice' is distinct from p_device::text
   or coalesce(e->>'ciphertext','')!~'^[a-f0-9]+$' or length(e->>'ciphertext')>131072 or length(e->>'ciphertext')%2<>0 or coalesce(e->>'signature','')!~'^[a-f0-9]{128}$') then raise exception 'invalid_request' using errcode='22023';end if;
 select * into existing from service_private.initializations where workspace_id=p_workspace;
 if existing.workspace_id is not null then
  if (existing.generation,existing.request_id,existing.final_op_id,existing.creator_device_id,existing.initial_envelopes) is distinct from (p_generation,request_id,final_id,p_device,envelopes) then raise exception 'initialization_conflict' using errcode='PT409';end if;
  if not exists(select 1 from service_private.workspace_lifecycle where workspace_id=p_workspace and generation=p_generation and state='active') then raise exception 'service_expired' using errcode='PT403';end if;
  return;
 end if;
 if exists(select 1 from service_private.workspace_lifecycle l join service_private.initializations i on i.workspace_id=l.workspace_id and i.generation=l.generation
  where l.environment=env and l.subject_id=subject and l.state in ('active','retained') and i.completed_at is null) then raise exception 'initialization_pending' using errcode='PT409';end if;
 perform service_private.check_profile(p_workspace,p_roster,p_checkpoint);
 perform service_private.create_new_workspace(p_device,p_workspace,p_generation,p_roster,p_roster_hash,p_roster_sig,p_checkpoint,p_rec_sig,p_dev_sig);
 now_at:=service_private.lifecycle_now(env,subject);
 insert into service_private.workspace_lifecycle(environment,subject_id,workspace_id,generation,boundary_verified,profile_verified,scheduled_access_end,next_due_at)
  values(env,subject,p_workspace,p_generation,true,true,(service_private.qualification_window(env,subject,now_at)->>'endsAt')::timestamptz,(service_private.qualification_window(env,subject,now_at)->>'endsAt')::timestamptz);
 insert into service_private.initializations(workspace_id,generation,request_id,creator_device_id,final_op_id,initial_envelopes,created_at)
  values(p_workspace,p_generation,request_id,p_device,final_id,envelopes,now_at);
 perform service_private.put_key_envelopes(p_workspace,p_device,envelopes);
 update service_private.account_lifecycle set revision=revision+1 where environment=env and subject_id=subject;
end $$;
create function public.create_new_workspace(p_device uuid,p_workspace uuid,p_generation uuid,p_roster jsonb,p_roster_hash text,
 p_roster_sig bytea,p_checkpoint jsonb,p_rec_sig bytea,p_dev_sig bytea,p_initialization jsonb) returns void
language plpgsql volatile security definer set search_path='' as $$
begin perform service_private.create_seed_workspace(p_device,p_workspace,p_generation,p_roster,p_roster_hash,p_roster_sig,p_checkpoint,p_rec_sig,p_dev_sig,p_initialization);end $$;
create function public.bootstrap_workspace(p_device uuid,p_workspace uuid,p_generation uuid,p_roster jsonb,p_roster_hash text,
 p_roster_sig bytea,p_checkpoint jsonb,p_rec_sig bytea,p_dev_sig bytea,p_initialization jsonb) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform service_private.write_access(null);
 if exists(select 1 from public.workspaces w join service_private.workspace_lifecycle l on l.workspace_id=w.id and l.generation=w.generation
  where w.user_id=auth.uid() and l.state in ('active','retained') and (w.id,w.generation) is distinct from (p_workspace,p_generation)) then
  raise exception 'initialization_pending' using errcode='PT409';end if;
 perform service_private.create_seed_workspace(p_device,p_workspace,p_generation,p_roster,p_roster_hash,p_roster_sig,p_checkpoint,p_rec_sig,p_dev_sig,p_initialization);
end $$;

create or replace function public.push_ops(p_workspace uuid,p_device uuid,p_generation uuid,p_ops jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare i service_private.initializations;item jsonb;receipt public.op_receipts;row public.ops;seen uuid[]:='{}';final_seen boolean:=false;result jsonb;bytes integer:=0;id uuid;hash text;
begin
 perform service_private.write_access(p_workspace);
 if not exists(select 1 from public.workspaces where id=p_workspace and generation=p_generation and user_id=auth.uid()) then raise exception 'workspace mismatch' using errcode='42501';end if;
 perform service_private.initialization_access(p_workspace,p_device,'seed_push');
 if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops)>200 then raise exception 'invalid_request' using errcode='22023';end if;
 select * into i from service_private.initializations where workspace_id=p_workspace and generation=p_generation;
 final_seen:=i.final_seq is not null and i.completed_at is null;
 for item in select value from jsonb_array_elements(p_ops) loop
  id:=(item->>'op_id')::uuid;hash:=item->>'payload_hash';
  if id is null or coalesce(hash,'')!~'^[a-f0-9]{64}$' or item->>'format_version' is distinct from '1' or item->>'key_epoch' is distinct from '1'
   or coalesce(item->>'ciphertext','')!~'^[a-f0-9]+$' or length(item->>'ciphertext')%2<>0 then raise exception 'invalid_request' using errcode='22023';end if;
  bytes:=bytes+length(item->>'ciphertext')/2;
  if bytes>1048576 then raise exception 'payload too large' using errcode='22023';end if;
  select * into receipt from public.op_receipts where workspace_id=p_workspace and op_id=id;
  if i.workspace_id is not null and i.completed_at is null then
   if id=any(seen) then raise exception 'initialization_conflict' using errcode='PT409';end if;
   if receipt.op_id is not null then
    if receipt.payload_hash<>hash then raise exception 'initialization_conflict' using errcode='PT409';end if;
   else
    if final_seen then raise exception 'initialization_pending' using errcode='PT409';end if;
    if id=i.final_op_id then final_seen:=true;end if;
   end if;
   if (select count(*) from public.key_envelopes where workspace_id=p_workspace and epoch=1 and recipient in ('recovery',p_device::text))<>2 then raise exception 'initialization_pending' using errcode='PT409';end if;
  end if;
  seen:=array_append(seen,id);
 end loop;
 result:=service_private.push_ops(p_workspace,p_device,p_generation,p_ops);
 if i.workspace_id is not null and i.completed_at is null then
  if exists(select 1 from jsonb_array_elements(result) e where e ? 'error') then raise exception 'initialization_conflict' using errcode='PT409';end if;
  select * into receipt from public.op_receipts where workspace_id=p_workspace and op_id=i.final_op_id;
  if receipt.op_id is not null then
   select * into row from public.ops where workspace_id=p_workspace and seq=receipt.seq;
   if row.device_id is distinct from i.creator_device_id or row.payload_hash is distinct from receipt.payload_hash then raise exception 'initialization_conflict' using errcode='PT409';end if;
   update service_private.initializations set final_seq=receipt.seq,final_payload_hash=receipt.payload_hash where workspace_id=p_workspace and final_seq is null;
  end if;
 end if;
 return result;
end $$;
create or replace function public.put_key_envelopes(p_workspace uuid,p_device uuid,p_envelopes jsonb) returns void
language plpgsql volatile security definer set search_path='' as $$
declare i service_private.initializations;item jsonb;
begin
 perform service_private.write_access(p_workspace);
 select * into i from service_private.initializations where workspace_id=p_workspace;
 if i.workspace_id is not null and i.completed_at is null then
  perform service_private.initialization_access(p_workspace,p_device,'initial_envelopes');
  if p_envelopes is distinct from i.initial_envelopes then raise exception 'initialization_conflict' using errcode='PT409';end if;
 end if;
 if jsonb_typeof(p_envelopes) is distinct from 'array' or jsonb_array_length(p_envelopes)>32 then raise exception 'invalid_request' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_envelopes) loop
  if item->>'epoch' is distinct from '1' or item->>'recipient'='chain' or coalesce(item->>'ciphertext','')!~'^[a-f0-9]+$' or length(item->>'ciphertext')>131072 or length(item->>'ciphertext')%2<>0
   or coalesce(item->>'signature','')!~'^[a-f0-9]{128}$' then raise exception 'unsupported_profile' using errcode='22023';end if;
 end loop;
 perform service_private.put_key_envelopes(p_workspace,p_device,p_envelopes);
end $$;

-- Wrap every control writer with the same subject/workspace fence and supported-record profile.
do $controls$
declare row record;body text;
begin
 for row in select p.oid,p.proname,p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('commit_roster','complete_recovery','start_recovery') loop
  body:=replace(row.prosrc,'perform service_private.write_access(p_workspace);',
   'perform service_private.write_access(p_workspace); perform service_private.initialization_access(p_workspace,p_device,''control'');');
  if row.proname in ('commit_roster','complete_recovery') then
   body:=replace(body,'perform service_private.initialization_access(p_workspace,p_device,''control'');',
    'perform service_private.initialization_access(p_workspace,p_device,''control''); perform service_private.check_profile(p_workspace,p_roster,null);');
  end if;
  execute replace(pg_get_functiondef(row.oid),row.prosrc,body);
 end loop;
 for row in select p.oid,p.proname,p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('rotate_epoch','regenerate_recovery','bootstrap_workspace','create_new_workspace') and p.pronargs=case when p.proname in ('bootstrap_workspace','create_new_workspace') then 9 else p.pronargs end loop
  if row.proname in ('bootstrap_workspace','create_new_workspace') then body:='begin perform service_private.require_version(); raise exception ''upgrade_required'' using errcode=''PT409''; end;';
  else body:='begin perform service_private.require_version(); raise exception ''unsupported_profile'' using errcode=''PT409''; end;';end if;
  execute replace(pg_get_functiondef(row.oid),row.prosrc,body);
 end loop;
end $controls$;

create function public.lifecycle_finish_initialization(p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare env text;subject uuid;target uuid;gen uuid;i service_private.initializations;row service_private.workspace_lifecycle;now_at timestamptz;device uuid;receipt public.op_receipts;op public.ops;was_complete boolean;
begin
 perform service_private.require_version();
 if jsonb_typeof(p_request) is distinct from 'object' or (select array_agg(key order by key) from jsonb_object_keys(p_request) key) is distinct from array['creatorDeviceId','finalOpId','finalPayloadHash','finalSeq','requestId','target','version']
  or p_request->'version' is distinct from '1'::jsonb or jsonb_typeof(p_request->'target') is distinct from 'object'
  or (select array_agg(key order by key) from jsonb_object_keys(p_request->'target') key) is distinct from array['generation','workspaceId']
  or jsonb_typeof(p_request->'finalSeq') is distinct from 'number' or (p_request->>'finalSeq')!~'^[1-9][0-9]{0,15}$'
  or (p_request->>'finalSeq')::numeric>9007199254740991 then raise exception 'invalid_request' using errcode='22023';end if;
 target:=(p_request->'target'->>'workspaceId')::uuid;gen:=(p_request->'target'->>'generation')::uuid;device:=(p_request->>'creatorDeviceId')::uuid;
 select environment into env from service_private.policy where id=1;
 subject:=service_private.require_live_session(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,env);
 perform service_private.lock_account(subject,env);
 now_at:=service_private.lifecycle_now(env,subject);
 perform service_private.reconcile_lifecycle_locked(subject,env,now_at);
 perform service_private.lock_workspace_row(subject,env,target);
 perform public._device_guard(device);
 select * into row from service_private.workspace_lifecycle where environment=env and workspace_id=target and generation=gen and subject_id=subject;
 select * into i from service_private.initializations where workspace_id=target and generation=gen;
 if row.workspace_id is null or i.workspace_id is null or i.creator_device_id<>device or i.request_id is distinct from (p_request->>'requestId')::uuid
  or i.final_op_id is distinct from (p_request->>'finalOpId')::uuid or i.final_payload_hash is distinct from p_request->>'finalPayloadHash' or i.final_seq is distinct from (p_request->>'finalSeq')::bigint then
  return jsonb_build_object('ok',false,'version',1,'serverNow',service_private.format_utc(now_at),'error','initialization_conflict');end if;
 -- Privacy and live proof precede the historical completion-receipt exception.
 if row.reason in ('explicit_cloud','account_delete','reset_sync') or row.state in ('deleting','deleted') then
  return jsonb_build_object('ok',false,'version',1,'serverNow',service_private.format_utc(now_at),'error','service_revoked');end if;
 was_complete:=i.completed_at is not null;
 if not was_complete then
  if row.state<>'active' or service_private.qualification_window(env,subject,now_at) is null then return jsonb_build_object('ok',false,'version',1,'serverNow',service_private.format_utc(now_at),'error','service_expired');end if;
  select * into receipt from public.op_receipts where workspace_id=target and op_id=i.final_op_id;
  select * into op from public.ops where workspace_id=target and seq=i.final_seq;
  if (select head_seq from public.workspaces where id=target) is distinct from i.final_seq or receipt.seq is distinct from i.final_seq or receipt.payload_hash is distinct from i.final_payload_hash
   or op.op_id is distinct from i.final_op_id or op.payload_hash is distinct from i.final_payload_hash or op.device_id is distinct from device then
   return jsonb_build_object('ok',false,'version',1,'serverNow',service_private.format_utc(now_at),'error','initialization_conflict');end if;
  update service_private.initializations set completed_at=now_at where workspace_id=target returning * into i;
  update service_private.account_lifecycle set revision=revision+1 where environment=env and subject_id=subject;
 end if;
 return jsonb_build_object('ok',true,'version',1,'serverNow',service_private.format_utc(now_at),'requestId',i.request_id,
  'target',jsonb_build_object('workspaceId',target,'generation',gen),'finalOpId',i.final_op_id,'finalPayloadHash',i.final_payload_hash,'finalSeq',i.final_seq,
  'completedAt',service_private.format_utc(i.completed_at),'initialization','complete','lifecycleVersion',row.revision,
  'lifecycleState',case when row.state='queued' then 'closed' else row.state end);
end $$;

create function service_private.privacy_control_access() returns void
language plpgsql volatile security definer set search_path='' as $$
declare env text;subject uuid;
begin
 perform service_private.require_version();select environment into env from service_private.policy where id=1;
 select subject_id into subject from service_private.account_lifecycle where environment=env and user_id=auth.uid() and state='active';
 perform service_private.lock_account(subject,env);
 perform service_private.reconcile_lifecycle_locked(subject,env,service_private.lifecycle_now(env,subject));
end $$;
do $privacy$
declare row record;body text;
begin
 for row in select p.oid,p.proname,p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('rebind_device','revoke_device','register_device') loop
  body:=row.prosrc;
  if row.proname in ('rebind_device','revoke_device') then
   body:=replace(body,'perform service_private.require_version();','perform service_private.privacy_control_access();');
  end if;
  body:=replace(body,'set service_version=1','set service_version=2');
  execute replace(pg_get_functiondef(row.oid),row.prosrc,body);
 end loop;
 select p.oid,p.prosrc into row from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='reset_sync';
 body:='begin perform service_private.require_version(); raise exception ''upgrade_required'' using errcode=''PT409''; end;';
 execute replace(pg_get_functiondef(row.oid),row.prosrc,body);
end $privacy$;
create or replace function public.list_account(p_workspace uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare w public.workspaces;subject uuid;env text;
begin
 perform service_private.write_access(null);select environment into env from service_private.policy where id=1;
 select subject_id into strict subject from service_private.account_lifecycle where environment=env and user_id=auth.uid() and state='active';
 select a.* into w from public.workspaces a join service_private.workspace_lifecycle l on l.workspace_id=a.id and l.generation=a.generation
  where a.user_id=auth.uid() and l.state='active' and (p_workspace is null or a.id=p_workspace) order by a.created_at desc,a.id desc limit 1;
 if w.id is null then
  if p_workspace is not null or exists(select 1 from service_private.workspace_lifecycle where environment=env and subject_id=subject) then raise exception 'service_expired' using errcode='PT403';end if;
  return null;
 end if;
 perform service_private.read_access(w.id,null);
 return jsonb_build_object('workspaceId',w.id,'generation',w.generation,'keyEpoch',w.key_epoch,'headSeq',w.head_seq,'rosterVersion',w.roster_version);
end $$;
do $snapshots$
declare row record;body text;
begin
 select oid,prosrc into row from pg_proc where pronamespace='public'::regnamespace and proname='snapshot_transfer_access';
 body:=replace(row.prosrc,'perform service_private.require_access();','perform service_private.read_access(p_workspace,p_device); perform service_private.initialization_access(p_workspace,p_device,''control'');');
 execute replace(pg_get_functiondef(row.oid),row.prosrc,body);
end $snapshots$;
create or replace function public.realtime_can_read(p_topic text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
 if auth.uid() is null or sid is null or p_topic is null then return false;end if;
 return coalesce((service_private.evaluate(auth.uid())->>'eligible')::boolean,false)
  and exists(select 1 from public.workspaces w join service_private.workspace_lifecycle l on l.workspace_id=w.id and l.generation=w.generation
   where w.user_id=auth.uid() and l.state='active' and p_topic='cloud:v1:ws:'||w.id::text
    and not exists(select 1 from service_private.initializations i where i.workspace_id=w.id and i.completed_at is null))
  and exists(select 1 from public.devices d where d.user_id=auth.uid() and d.auth_session_id=sid and d.status='authorized' and d.service_version=2)
  and exists(select 1 from auth.sessions s where s.id=sid and s.user_id=auth.uid());
end $$;

-- Billing uses the original engine/receipts. Service-only p_user now denotes the internal subject.
create or replace function public.billing_assert_lease(p_environment text,p_user uuid,p_lease uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform service_private.lock_account(p_user,p_environment);
 perform 1 from public.billing_accounts where environment=p_environment and subject_id=p_user and lease=p_lease and lease_until>clock_timestamp() for update;
 if not found then raise exception 'billing_lease_lost';end if;
end $$;
do $billing$
declare row record;body text;
begin
 for row in select p.oid,p.proname,p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('billing_lock','billing_claim_trial','billing_status','billing_commit') loop
  body:=row.prosrc;
  if row.proname in ('billing_lock','billing_claim_trial') then
   body:=regexp_replace(body,'\mbegin\M','begin perform service_private.lock_account(p_user,p_environment);', '');
   if row.proname='billing_lock' then
    body:=replace(body,'return jsonb_build_object(''lease'',k,',
     'return jsonb_build_object(''mode'',case when (select state from service_private.account_lifecycle where environment=p_environment and subject_id=p_user)=''active'' then ''active'' else ''settlement'' end,''providerUserId'',(select provider_user_id from service_private.account_lifecycle where environment=p_environment and subject_id=p_user),''lease'',k,');
   end if;
   if row.proname='billing_claim_trial' then
    body:=replace(body,'begin perform service_private.lock_account(p_user,p_environment);',
     'begin perform service_private.lock_account(p_user,p_environment); if not exists(select 1 from service_private.account_lifecycle where environment=p_environment and subject_id=p_user and state=''active'' and user_id is not null) then raise exception ''service_revoked''; end if;');
    body:=replace(body,'return billing_status(p_environment,p_user)||','perform service_private.reconcile_lifecycle_locked(p_user,p_environment,public.billing_now(p_environment,p_user)); return billing_status(p_environment,p_user)||');
   end if;
  elsif row.proname='billing_status' then
   body:=regexp_replace(body,'\mbegin\M',
    'begin if p_user is not null and exists(select 1 from service_private.account_lifecycle where environment=p_environment and subject_id=p_user and state<>''active'') then return jsonb_build_object(''version'',1,''status'',''revoked'',''eligible'',false,''trialEligible'',false,''trialConsumed'',true,''serverNow'',public.billing_now(p_environment,p_user),''effectiveEnd'',null,''subscriptions'',''[]''::jsonb); end if;','');
  else
   body:=replace(body,'t:=billing_now(p_environment,p_user);','t:=billing_now(p_environment,p_user); perform service_private.reconcile_lifecycle_locked(p_user,p_environment,t);');
   body:=replace(body,'return billing_status(p_environment,p_user);','perform service_private.reconcile_lifecycle_locked(p_user,p_environment,t); return billing_status(p_environment,p_user);');
   -- Closed subjects settle money without restoring trial/grace/service state.
   body:=replace(body,'update billing_accounts set paid_ever=true,',
    'update billing_accounts set paid_ever=true,');
  end if;
  execute replace(pg_get_functiondef(row.oid),row.prosrc,body);
 end loop;
end $billing$;

-- AI keeps header 1 and its exact budget/fee algorithm. Only ownership/admission fencing changes.
create function service_private.identity_active(p_environment text,p_identity uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select state='active' and user_id is not null from service_private.account_lifecycle
  where environment=p_environment and (subject_id=p_identity or user_id=p_identity or owner_tag=service_private.owner_tag(p_identity)) limit 1),
  exists(select 1 from auth.users where id=p_identity and deleted_at is null))
$$;
create function service_private.evaluate_ai(p_subject uuid,p_environment text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare cfg service_private.policy;source jsonb;state jsonb;why text;
begin
 select * into cfg from service_private.policy where id=1;
 source:=public.billing_source(p_environment);
 if cfg.environment is distinct from p_environment or not cfg.enabled or source is null or cfg.source_fingerprint is null or md5(source::text)<>cfg.source_fingerprint then
  return jsonb_build_object('version',1,'eligible',false,'error','billing_configuration','minServiceVersion',1);end if;
 state:=public.billing_status(p_environment,p_subject);
 if state ? 'error' then why:='billing_configuration';elsif coalesce((state->>'eligible')::boolean,false) then why:=null;
 elsif state->>'status'='revoked' then why:='service_revoked';elsif state->>'status'='expired' then why:='service_expired';else why:='service_not_started';end if;
 return jsonb_build_object('version',1,'eligible',why is null,'error',why,'billingStatus',state->'status','serverNow',state->'serverNow','effectiveEnd',state->'effectiveEnd','minServiceVersion',1);
end $$;
do $ai$
declare row record;body text;
begin
 for row in select p.oid,p.proname,p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('ai_service_status','ai_admit','ai_settle','ai_receipt') loop
  body:=row.prosrc;
  if row.proname='ai_service_status' then
   body:=regexp_replace(body,'\mbegin\M','begin if not service_private.identity_active(p_environment,p_user) then return jsonb_build_object(''version'',1,''eligible'',false,''error'',''service_revoked''); end if; p_user:=service_private.subject_for_identity(p_environment,p_user);','');
   -- The D1 projection seam expects Auth; billing itself now expects the resolved subject.
   body:=replace(body,'service_private.evaluate(p_user,p_environment)',
    'service_private.evaluate_ai(p_user,p_environment)');
  elsif row.proname='ai_admit' then
   body:=replace(body,'if b.policy=''trial_or_paid'' then',
    'p_user:=coalesce(service_private.subject_for_identity(p_environment,p_user),service_private.ensure_live_subject(p_environment,p_user)); perform service_private.lock_account(p_user,p_environment); if not service_private.identity_active(p_environment,p_user) then return jsonb_build_object(''error'',''service_revoked''); end if; if b.policy=''trial_or_paid'' then');
  else
   body:=regexp_replace(body,'\mbegin\M','begin p_user:=service_private.subject_for_identity((select environment from public.ai_budget where id=''integration-shared''),p_user);','');
   if row.proname='ai_receipt' then body:=replace(body,'begin p_user:=','begin p_user:=');end if;
  end if;
  execute replace(pg_get_functiondef(row.oid),row.prosrc,body);
 end loop;
end $ai$;
create function public.lifecycle_delivery_allowed(p_environment text,p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select service_private.identity_active(p_environment,p_owner)
$$;
revoke all on function public.lifecycle_delivery_allowed(text,uuid) from public,anon,authenticated;
grant execute on function public.lifecycle_delivery_allowed(text,uuid) to service_role;

create function service_private.request_owner() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare cfg service_private.policy;owner uuid:=auth.uid();session uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
 select * into cfg from service_private.policy where id=1;
 if owner is null or session is null or auth.jwt()->>'role'<>'authenticated' or auth.jwt()->>'iss' is distinct from 'https://'||cfg.project_ref||'.supabase.co/auth/v1'
  or not exists(select 1 from auth.users where id=owner and deleted_at is null)
  or not exists(select 1 from auth.sessions where id=session and user_id=owner) then raise exception 'authentication_failed' using errcode='42501';end if;
 return owner;
end $$;
create function service_private.generation_view(p_row service_private.workspace_lifecycle,p_now timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare i service_private.initializations;initialization jsonb;
begin
 if p_row.seed_required then
  select * into i from service_private.initializations where workspace_id=p_row.workspace_id and generation=p_row.generation;
  if i.workspace_id is null then raise exception 'lifecycle_unavailable';end if;
  initialization:=jsonb_build_object('state',case when i.completed_at is not null then 'complete' when i.final_seq is not null then 'final_received' else 'preparing' end,'initializationId',i.request_id);
 else initialization:='{"state":"not_seeded"}'::jsonb;end if;
 return jsonb_build_object('state',case when p_row.state='queued' then 'closed' else p_row.state end,
  'target',jsonb_build_object('workspaceId',p_row.workspace_id,'generation',p_row.generation),'lifecycleVersion',p_row.revision,'reason',p_row.reason,
  'scheduledAccessEnd',service_private.format_utc(p_row.scheduled_access_end),'accessEndedAt',service_private.format_utc(p_row.access_ended_at),
  'retrieveUntil',service_private.format_utc(p_row.retrieve_until),'closedAt',service_private.format_utc(p_row.closed_at),
  'onlineDeleteBy',service_private.format_utc(p_row.online_delete_by),'onlineDeletedAt',service_private.format_utc(p_row.online_deleted_at),
  'retrievalWindowOpen',p_row.state='retained' and p_row.reason='ordinary_expiry' and p_now<p_row.retrieve_until and p_row.boundary_verified,
  'newCreateRequired',p_row.state in ('queued','deleting','deleted'),'initialization',initialization);
end $$;
create function public.lifecycle_status(p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare owner uuid;env text;subject uuid;at_time timestamptz;revision bigint:=0;q jsonb;cursor jsonb;row service_private.workspace_lifecycle;
 entries jsonb:='[]';next_cursor jsonb;response jsonb;view jsonb;count_rows integer:=0;can_create boolean:=false;candidate jsonb;target uuid;gen uuid;
begin
 owner:=service_private.request_owner();select environment into env from service_private.policy where id=1;
 if jsonb_typeof(p_request) is distinct from 'object' or (select array_agg(key order by key) from jsonb_object_keys(p_request) key) is distinct from array['query','version']
  or p_request->'version' is distinct from '1'::jsonb or jsonb_typeof(p_request->'query') is distinct from 'object' then raise exception 'invalid_request' using errcode='22023';end if;
 q:=p_request->'query';
 if q->>'kind'='generation' then
  if (select array_agg(key order by key) from jsonb_object_keys(q) key) is distinct from array['kind','target'] or jsonb_typeof(q->'target') is distinct from 'object'
   or (select array_agg(key order by key) from jsonb_object_keys(q->'target') key) is distinct from array['generation','workspaceId'] then raise exception 'invalid_request' using errcode='22023';end if;
  target:=(q->'target'->>'workspaceId')::uuid;gen:=(q->'target'->>'generation')::uuid;
 elsif q->>'kind'='discover' then
  if (select array_agg(key order by key) from jsonb_object_keys(q) key) is distinct from array['after','kind'] then raise exception 'invalid_request' using errcode='22023';end if;
  cursor:=nullif(q->'after','null'::jsonb);
  if cursor is not null and (jsonb_typeof(cursor)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(cursor) key) is distinct from array['accountRevision','generation','workspaceId']
   or jsonb_typeof(cursor->'accountRevision') is distinct from 'number' or (cursor->>'accountRevision')!~'^[0-9]{1,16}$' or (cursor->>'accountRevision')::numeric>9007199254740991) then raise exception 'invalid_request' using errcode='22023';end if;
 else raise exception 'invalid_request' using errcode='22023';end if;
 select subject_id into subject from service_private.account_lifecycle where environment=env and user_id=owner;
 if subject is not null then
  perform service_private.lock_account(subject,env);at_time:=service_private.lifecycle_now(env,subject);
  perform service_private.reconcile_lifecycle_locked(subject,env,at_time);
  select a.revision into revision from service_private.account_lifecycle a where environment=env and subject_id=subject;
  can_create:=coalesce((service_private.evaluate(owner,env)->>'eligible')::boolean,false);
 else at_time:=clock_timestamp();end if;
 if cursor is not null and (cursor->>'accountRevision')::bigint<>revision then return jsonb_build_object('ok',false,'version',1,'serverNow',service_private.format_utc(at_time),'error','lifecycle_conflict');end if;
 response:=jsonb_build_object('ok',true,'version',1,'environment',env,'projectRef',(select project_ref from service_private.policy where id=1),
  'serverNow',service_private.format_utc(at_time),'accountRevision',revision,'canCreateCloud',can_create,'entries',entries,'nextAfter',null);
 for row in select * from service_private.workspace_lifecycle l where environment=env and subject_id=subject
  and (q->>'kind'='discover' or (workspace_id=target and generation=gen))
  and (cursor is null or (workspace_id,generation)>((cursor->>'workspaceId')::uuid,(cursor->>'generation')::uuid)) order by workspace_id,generation limit 33 loop
  view:=service_private.generation_view(row,at_time);
  candidate:=jsonb_set(response,'{entries}',entries||jsonb_build_array(view));
  if count_rows=32 or octet_length(convert_to(candidate::text,'UTF8'))+512>16384 then exit;end if;
  entries:=entries||jsonb_build_array(view);count_rows:=count_rows+1;
  next_cursor:=jsonb_build_object('workspaceId',row.workspace_id,'generation',row.generation,'accountRevision',revision);
 end loop;
 if q->>'kind'='generation' and count_rows=0 then return jsonb_build_object('ok',false,'version',1,'serverNow',service_private.format_utc(at_time),'error','workspace_unavailable');end if;
 if q->>'kind'='discover' and cursor is null and count_rows=0 then entries:='[{"state":"none","newCreateRequired":true}]'::jsonb;end if;
 if next_cursor is null or not exists(select 1 from service_private.workspace_lifecycle where environment=env and subject_id=subject
   and (workspace_id,generation)>((next_cursor->>'workspaceId')::uuid,(next_cursor->>'generation')::uuid)) or q->>'kind'='generation' then next_cursor:=null;end if;
 return jsonb_set(jsonb_set(response,'{entries}',entries),'{nextAfter}',coalesce(next_cursor,'null'::jsonb));
end $$;

-- Everything new is private by default; only finite authenticated or service-only facades are exposed.
do $access$
declare tab record;f record;
begin
 for tab in select c.oid::regclass name from pg_class c where c.relnamespace='service_private'::regnamespace and c.relkind='r' and c.relname in
  ('lifecycle_policy','lifecycle_keys','account_lifecycle','workspace_lifecycle','initializations') loop
  execute format('alter table %s enable row level security',tab.name);
  execute format('revoke all on %s from public,anon,authenticated,service_role',tab.name);
 end loop;
 for f in select p.oid::regprocedure name from pg_proc p where p.pronamespace='service_private'::regnamespace loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.name);
 end loop;
end $access$;
revoke all on function public.lifecycle_status(jsonb),public.lifecycle_finish_initialization(jsonb),
 public.create_new_workspace(uuid,uuid,uuid,jsonb,text,bytea,jsonb,bytea,bytea,jsonb),
 public.bootstrap_workspace(uuid,uuid,uuid,jsonb,text,bytea,jsonb,bytea,bytea,jsonb) from public,anon;
grant execute on function public.lifecycle_status(jsonb),public.lifecycle_finish_initialization(jsonb),
 public.create_new_workspace(uuid,uuid,uuid,jsonb,text,bytea,jsonb,bytea,bytea,jsonb),
 public.bootstrap_workspace(uuid,uuid,uuid,jsonb,text,bytea,jsonb,bytea,bytea,jsonb) to authenticated;
notify pgrst,'reload schema';
