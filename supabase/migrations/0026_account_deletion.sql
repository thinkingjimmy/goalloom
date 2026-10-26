-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Installed 0025 subjects/fences, explicit same-session privacy intent and original billing/AI facts.
-- OUTPUT: Immediate closure, bounded status receipts, deletion outbox/object work and settlement-only subjects.
-- POS: D2 deletion authority. Retrieval cleanup is wired only by 0028 after 0027 exists.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create table service_private.deletion_requests (
 environment text not null,request_id uuid not null,subject_id uuid not null,session_id uuid not null,
 scope text not null check(scope in ('cloud','account')),workspace_id uuid,generation uuid,expected_revision bigint not null,
 receipt_digest bytea not null check(octet_length(receipt_digest)=32),auth_target uuid,prepared_at timestamptz not null,prepare_expires_at timestamptz not null,
 confirmed_at timestamptz,online_delete_by timestamptz,status_expires_at timestamptz not null,
 intent text not null default 'not_started' check(intent in ('not_started','pending','durable')),
 content text not null default 'not_started' check(content in ('not_started','pending','deleting','deleted')),
 auth_state text not null check(auth_state in ('not_applicable','not_started','pending','deleted')),
 renewal text not null check(renewal in ('not_applicable','not_started','pending','stopped','attention_required')),
 primary key(environment,request_id),foreign key(environment,subject_id) references service_private.account_lifecycle(environment,subject_id),
 check((scope='account')=(workspace_id is null and generation is null)),
 check(prepare_expires_at=prepared_at+interval '24 hours'),
 check(confirmed_at is null or (online_delete_by=confirmed_at+interval '168 hours' and status_expires_at=confirmed_at+interval '720 hours'))
);
create table service_private.deletion_outbox (
 event_id uuid primary key default gen_random_uuid(),environment text not null,subject_id uuid not null,request_id uuid,
 workspace_id uuid,generation uuid,lifecycle_revision bigint not null,event_kind text not null check(event_kind in ('intent','online_deleted','account_deleted','ordinary_cancelled')),
 record jsonb not null,digest text not null check(digest~'^[a-f0-9]{64}$'),created_at timestamptz not null,
 acknowledged_at timestamptz,store_id text,store_cursor text,attempts integer not null default 0,
 retry_at timestamptz not null default now(),lease uuid,lease_until timestamptz,
 unique(environment,workspace_id,generation,lifecycle_revision,event_kind)
);
create index deletion_export_due on service_private.deletion_outbox(retry_at) where acknowledged_at is null;
create table service_private.cloud_objects (
 environment text not null,workspace_id uuid not null,generation uuid not null,bucket text not null check(bucket='snapshots'),object_path text not null,
 state text not null default 'expected' check(state in ('expected','present','delete_pending','delete_unknown','absent')),
 source text not null check(source in ('snapshot','blob','transfer','inventory')),
 verified_absent_at timestamptz,attempts integer not null default 0,primary key(environment,bucket,object_path)
);
create table service_private.cloud_transfers (
 ticket_id uuid primary key default gen_random_uuid(),environment text not null,subject_id uuid not null,workspace_id uuid not null,generation uuid not null,
 producer_sha256 text not null check(producer_sha256~'^[a-f0-9]{64}$'),device_id uuid not null,session_id uuid not null,
 lifecycle_revision bigint not null,bucket text not null check(bucket='snapshots'),object_path text not null,method text not null check(method in ('upload','download')),
 state text not null default 'prepared' check(state in ('prepared','dispatched','complete','failed','unknown','withdrawn')),
 created_at timestamptz not null,finished_at timestamptz
);
create index unresolved_cloud_transfers on service_private.cloud_transfers(environment,workspace_id,generation) where state in ('dispatched','unknown');
create table service_private.trial_protection (
 tag bytea primary key check(octet_length(tag)=32),claimed boolean not null,reason text not null check(reason in ('trial_claimed','account_abuse')),
 deleted_at timestamptz not null,expires_at timestamptz not null,check(expires_at<=deleted_at+interval '180 days')
);
create table service_private.financial_holds (
 environment text not null,invoice_id text not null,reason text not null,reference text not null,
 started_at timestamptz not null,review_at timestamptz not null,released_at timestamptz,
 primary key(environment,invoice_id,reference),foreign key(environment,invoice_id) references public.billing_transactions(environment,invoice_id)
);
alter table public.billing_transactions add column currency text not null default 'usd' check(currency='usd'),
 add column tax_cents integer check(tax_cents>=0),add column retain_until timestamptz;
update public.billing_transactions set retain_until=((financial_at at time zone 'UTC')+interval '7 years') at time zone 'UTC';
alter table public.billing_transactions alter column retain_until set not null;
create function service_private.financial_retention() returns trigger
language plpgsql set search_path='' as $$
begin
 new.retain_until:=((new.financial_at at time zone 'UTC')+interval '7 years') at time zone 'UTC';
 return new;
end $$;
create trigger financial_retention before insert or update of financial_at on public.billing_transactions for each row execute function service_private.financial_retention();
alter table public.billing_operations drop constraint billing_operations_action_check;
alter table public.billing_operations add check(action in ('checkout','portal','switch','cancel','resume','remove_switch','delete_renewal_stop','delete_checkout_close'));

create function service_private.tag_value(p_value text,p_purpose text) returns bytea
language plpgsql stable security definer set search_path='' as $$
declare secret bytea;result bytea;
begin
 select key into strict secret from service_private.lifecycle_keys where id=1;
 if to_regprocedure('extensions.hmac(bytea,bytea,text)') is not null then execute 'select extensions.hmac($1,$2,''sha256'')' into result using convert_to(p_purpose||'|'||p_value,'UTF8'),secret;
 elsif to_regprocedure('public.hmac(bytea,bytea,text)') is not null then execute 'select public.hmac($1,$2,''sha256'')' into result using convert_to(p_purpose||'|'||p_value,'UTF8'),secret;
 else raise exception 'lifecycle_configuration';end if;
 return result;
end $$;
create function service_private.trial_blocked(p_owner uuid,p_now timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from service_private.trial_protection t where t.claimed and p_now<t.expires_at and
  (t.tag=service_private.owner_tag(p_owner,'trial-owner') or t.tag in (
    select service_private.tag_value(provider||'|'||(identity_data->>'sub'),'trial-provider') from auth.identities where user_id=p_owner and identity_data->>'sub' is not null)))
$$;
create function service_private.deletion_progress(p_row service_private.deletion_requests,p_now timestamptz) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('version',1,'requestId',p_row.request_id,'scope',p_row.scope,'serverNow',service_private.format_utc(p_now),
  'accepted',p_row.confirmed_at is not null,'confirmedAt',service_private.format_utc(p_row.confirmed_at),'onlineDeleteBy',service_private.format_utc(p_row.online_delete_by),
  'statusExpiresAt',service_private.format_utc(p_row.status_expires_at),'intent',p_row.intent,'content',p_row.content,'auth',p_row.auth_state,'renewal',p_row.renewal)
$$;
create function service_private.receipt_metadata(p_environment text,p_request uuid,p_subject uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('scope',scope,'receiptDigest',encode(receipt_digest,'hex'),'expectedRevision',expected_revision,
  'preparedAt',service_private.format_utc(prepared_at),'confirmedAt',service_private.format_utc(confirmed_at))
 from service_private.deletion_requests where environment=p_environment and request_id=p_request and subject_id=p_subject and confirmed_at is not null
$$;
create function service_private.enqueue_deletion(p_row service_private.workspace_lifecycle,p_request uuid,p_now timestamptz,p_kind text default 'intent') returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare event uuid;payload jsonb;
begin
 event:=gen_random_uuid();
 payload:=jsonb_build_object('version',1,'eventId',event,'environment',p_row.environment,'projectRef',(select project_ref from service_private.policy where id=1),
  'subjectId',p_row.subject_id,'ownerTag',encode((select owner_tag from service_private.account_lifecycle where environment=p_row.environment and subject_id=p_row.subject_id),'hex'),
  'requestId',p_request,'target',jsonb_build_object('workspaceId',p_row.workspace_id,'generation',p_row.generation),
  'lifecycleVersion',p_row.revision,'reason',p_row.reason,'kind',p_kind,'closedAt',service_private.format_utc(p_row.closed_at),
  'retrieveUntil',service_private.format_utc(p_row.retrieve_until),'onlineDeleteBy',service_private.format_utc(p_row.online_delete_by),
  'onlineDeletedAt',service_private.format_utc(p_row.online_deleted_at),'scheduledAccessEnd',service_private.format_utc(p_row.scheduled_access_end),'accessEndedAt',service_private.format_utc(p_row.access_ended_at),
  'deletionReceipt',service_private.receipt_metadata(p_row.environment,p_request,p_row.subject_id));
 insert into service_private.deletion_outbox(event_id,environment,subject_id,request_id,workspace_id,generation,lifecycle_revision,event_kind,record,digest,created_at)
  values(event,p_row.environment,p_row.subject_id,p_request,p_row.workspace_id,p_row.generation,p_row.revision,p_kind,payload,
   encode(public._sha256(convert_to(public._canonical_json(payload),'UTF8')),'hex'),p_now)
  on conflict(environment,workspace_id,generation,lifecycle_revision,event_kind) do update set event_id=service_private.deletion_outbox.event_id returning event_id into event;
 return event;
end $$;
create function public.lifecycle_prepare_delete(p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare owner uuid:=service_private.request_owner();env text;subject uuid;now_at timestamptz;row service_private.deletion_requests;keys text[];target uuid;gen uuid;revision bigint;scope text;request_id uuid;
begin
 select environment into env from service_private.policy where id=1;
 if jsonb_typeof(p_request) is distinct from 'object' then raise exception 'invalid_request' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_request) key;
 scope:=p_request->>'scope';request_id:=(p_request->>'requestId')::uuid;
 if keys is distinct from array['expectedRevision','receiptDigest','requestId','scope','target','version'] or p_request->'version' is distinct from '1'::jsonb
  or coalesce(scope,'') not in ('cloud','account') or request_id is null or coalesce(p_request->>'receiptDigest','')!~'^[a-f0-9]{64}$'
  or jsonb_typeof(p_request->'expectedRevision') is distinct from 'number' or (p_request->>'expectedRevision')!~'^[0-9]{1,16}$' or (p_request->>'expectedRevision')::numeric>9007199254740991 then raise exception 'invalid_request' using errcode='22023';end if;
 if scope='cloud' then
  if jsonb_typeof(p_request->'target') is distinct from 'object' or (select array_agg(key order by key) from jsonb_object_keys(p_request->'target') key) is distinct from array['generation','workspaceId'] then raise exception 'invalid_request' using errcode='22023';end if;
  target:=(p_request->'target'->>'workspaceId')::uuid;gen:=(p_request->'target'->>'generation')::uuid;
 elsif p_request->'target' is distinct from 'null'::jsonb then raise exception 'invalid_request' using errcode='22023';end if;
 subject:=service_private.ensure_live_subject(env,owner);perform service_private.lock_account(subject,env);
 now_at:=service_private.lifecycle_now(env,subject);perform service_private.reconcile_lifecycle_locked(subject,env,now_at);
 select * into row from service_private.deletion_requests d where d.environment=env and d.request_id=(p_request->>'requestId')::uuid;
 if row.request_id is not null then
  if (row.subject_id,row.session_id,row.scope,row.workspace_id,row.generation,row.expected_revision,row.receipt_digest)
   is distinct from (subject,nullif(auth.jwt()->>'session_id','')::uuid,scope,target,gen,(p_request->>'expectedRevision')::bigint,decode(p_request->>'receiptDigest','hex')) then raise exception 'deletion_request_conflict' using errcode='PT409';end if;
 else
  if scope='cloud' then
   perform service_private.lock_workspace_row(subject,env,target);
   select l.revision into revision from service_private.workspace_lifecycle l where l.environment=env and l.subject_id=subject and l.workspace_id=target and l.generation=gen;
  else select a.revision into revision from service_private.account_lifecycle a where a.environment=env and a.subject_id=subject;end if;
  if revision is null or revision<>(p_request->>'expectedRevision')::bigint then return jsonb_build_object('version',1,'error','lifecycle_conflict');end if;
  insert into service_private.deletion_requests(environment,request_id,subject_id,session_id,scope,workspace_id,generation,expected_revision,receipt_digest,prepared_at,prepare_expires_at,status_expires_at,auth_state,renewal)
   values(env,request_id,subject,nullif(auth.jwt()->>'session_id','')::uuid,scope,target,gen,revision,decode(p_request->>'receiptDigest','hex'),now_at,now_at+interval '24 hours',now_at+interval '24 hours',
    case when scope='cloud' then 'not_applicable' else 'not_started' end,case when scope='cloud' then 'not_applicable' else 'not_started' end) returning * into row;
 end if;
 return jsonb_build_object('version',1,'requestId',row.request_id,'scope',row.scope,'preparedAt',service_private.format_utc(row.prepared_at),'prepareExpiresAt',service_private.format_utc(row.prepare_expires_at),'serverNow',service_private.format_utc(now_at));
end $$;

create function public.lifecycle_confirm_delete(p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare owner uuid:=service_private.request_owner();env text;subject uuid;now_at timestamptz;request service_private.deletion_requests;row service_private.workspace_lifecycle;
 revision bigint;event uuid;payload jsonb;used_trial boolean;blocked_account boolean;stable record;
begin
 select environment into env from service_private.policy where id=1;
 if jsonb_typeof(p_request) is distinct from 'object' or (select array_agg(key order by key) from jsonb_object_keys(p_request) key) is distinct from array['acknowledge','expectedRevision','requestId','version']
  or p_request->'version' is distinct from '1'::jsonb or p_request->'acknowledge' is distinct from 'true'::jsonb
  or jsonb_typeof(p_request->'expectedRevision') is distinct from 'number' or (p_request->>'expectedRevision')!~'^[0-9]{1,16}$' or (p_request->>'expectedRevision')::numeric>9007199254740991 then raise exception 'invalid_request' using errcode='22023';end if;
 select subject_id into subject from service_private.account_lifecycle where environment=env and user_id=owner;
 perform service_private.lock_account(subject,env);now_at:=service_private.lifecycle_now(env,subject);
 select * into request from service_private.deletion_requests d where d.environment=env and d.request_id=(p_request->>'requestId')::uuid for update;
 if request.request_id is null or request.subject_id<>subject or request.session_id is distinct from nullif(auth.jwt()->>'session_id','')::uuid or request.expected_revision<>(p_request->>'expectedRevision')::bigint then
  return jsonb_build_object('version',1,'error','deletion_request_conflict');end if;
 if request.confirmed_at is not null then return service_private.deletion_progress(request,now_at);end if;
 if now_at>=request.prepare_expires_at then return jsonb_build_object('version',1,'error','deletion_prepare_expired');end if;
 perform service_private.reconcile_lifecycle_locked(subject,env,now_at);
 if request.scope='cloud' then
  perform service_private.lock_workspace_row(subject,env,request.workspace_id);
  select l.revision into revision from service_private.workspace_lifecycle l where l.environment=env and l.subject_id=subject and l.workspace_id=request.workspace_id and l.generation=request.generation;
 else select a.revision into revision from service_private.account_lifecycle a where a.environment=env and a.subject_id=subject and a.state='active';end if;
 if revision is null or revision<>request.expected_revision then return jsonb_build_object('version',1,'error','lifecycle_conflict');end if;
 update service_private.deletion_requests set confirmed_at=now_at,online_delete_by=now_at+interval '168 hours',status_expires_at=now_at+interval '720 hours',auth_target=case when scope='account' then owner end,
  intent='pending',content='pending',auth_state=case when scope='account' then 'pending' else 'not_applicable' end,
  renewal=case when scope='account' then 'pending' else 'not_applicable' end where environment=env and request_id=request.request_id returning * into request;
 for row in select * from service_private.workspace_lifecycle where environment=env and subject_id=subject
   and (request.scope='account' or (workspace_id=request.workspace_id and generation=request.generation)) order by workspace_id loop
  perform service_private.lock_workspace_row(subject,env,row.workspace_id);
  update service_private.workspace_lifecycle set state=case when state='deleted' then 'deleted' else 'queued' end,
   reason=case when request.scope='account' then 'account_delete' else 'explicit_cloud' end,revision=service_private.workspace_lifecycle.revision+1,
   closed_at=least(coalesce(closed_at,now_at),now_at),online_delete_by=least(coalesce(online_delete_by,now_at+interval '168 hours'),now_at+interval '168 hours'),next_due_at=now_at,
   lease=null,lease_until=null where environment=env and workspace_id=row.workspace_id returning * into row;
  perform service_private.enqueue_deletion(row,request.request_id,now_at);
 end loop;
 update service_private.account_lifecycle set revision=service_private.account_lifecycle.revision+1 where environment=env and subject_id=subject;
 if request.scope='account' then
  select trial_started_at is not null into used_trial from public.billing_accounts where environment=env and subject_id=subject;
  select blocked into blocked_account from public.ai_protection where subject_id=subject;
  if coalesce(used_trial,false) or coalesce(blocked_account,false) then
   insert into service_private.trial_protection values(service_private.owner_tag(owner,'trial-owner'),true,case when used_trial then 'trial_claimed' else 'account_abuse' end,now_at,now_at+interval '180 days') on conflict(tag) do nothing;
   for stable in select provider,identity_data->>'sub' id from auth.identities where user_id=owner and identity_data->>'sub' is not null loop
    insert into service_private.trial_protection values(service_private.tag_value(stable.provider||'|'||stable.id,'trial-provider'),true,case when used_trial then 'trial_claimed' else 'account_abuse' end,now_at,now_at+interval '180 days') on conflict(tag) do nothing;
   end loop;
  end if;
  update service_private.account_lifecycle set state='deleting',confirmed_at=now_at,online_delete_by=now_at+interval '168 hours',delete_request_id=request.request_id,
   provider_identity_until=now_at+interval '168 hours' where environment=env and subject_id=subject;
  update public.billing_accounts set lease=null,lease_until=null,reconcile_at=clock_timestamp() where environment=env and subject_id=subject;
  update public.billing_operations set result=null where environment=env and subject_id=subject;
  delete from service_private.continuations where environment=env and subject_id=subject;
  delete from service_private.operation_aliases where environment=env and subject_id=subject;
  delete from auth.sessions where user_id=owner;
  event:=gen_random_uuid();
  payload:=jsonb_build_object('version',1,'eventId',event,'environment',env,'projectRef',(select project_ref from service_private.policy where id=1),'subjectId',subject,
   'ownerTag',encode(service_private.owner_tag(owner),'hex'),'requestId',request.request_id,'target',null,'lifecycleVersion',revision+1,'reason','account_delete','kind','intent',
   'closedAt',service_private.format_utc(now_at),'retrieveUntil',null,'onlineDeleteBy',service_private.format_utc(request.online_delete_by),'onlineDeletedAt',null,
   'deletionReceipt',service_private.receipt_metadata(env,request.request_id,subject));
  insert into service_private.deletion_outbox(event_id,environment,subject_id,request_id,lifecycle_revision,event_kind,record,digest,created_at)
   values(event,env,subject,request.request_id,revision+1,'intent',payload,encode(public._sha256(convert_to(public._canonical_json(payload),'UTF8')),'hex'),now_at);
 end if;
 if not exists(select 1 from service_private.workspace_lifecycle where environment=env and subject_id=subject and state<>'deleted'
  and (request.scope='account' or workspace_id=request.workspace_id)) then
  update service_private.deletion_requests set content='deleted' where environment=env and request_id=request.request_id returning * into request;
 end if;
 return service_private.deletion_progress(request,now_at);
end $$;
create table service_private.receipt_rate (bucket smallint primary key,window_at timestamptz not null,hits integer not null);
create function public.lifecycle_receipt_status(p_environment text,p_request uuid,p_digest text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare row service_private.deletion_requests;now_at timestamptz;bucket_id smallint;count_hits integer;
begin
 bucket_id:=get_byte(public._sha256(convert_to(p_request::text,'UTF8')),0)%64;
 insert into service_private.receipt_rate(bucket,window_at,hits) values(bucket_id,date_trunc('minute',clock_timestamp()),1)
  on conflict(bucket) do update set window_at=excluded.window_at,hits=case when service_private.receipt_rate.window_at=excluded.window_at then service_private.receipt_rate.hits+1 else 1 end returning hits into count_hits;
 if count_hits>120 then return jsonb_build_object('version',1,'error','rate_limited');end if;
 if p_environment is distinct from (select environment from service_private.policy where id=1) or coalesce(p_digest,'')!~'^[a-f0-9]{64}$' then return jsonb_build_object('version',1,'error','deletion_receipt_unavailable');end if;
 select * into row from service_private.deletion_requests where environment=p_environment and request_id=p_request;
 if row.request_id is null or row.receipt_digest is distinct from decode(p_digest,'hex') then return jsonb_build_object('version',1,'error','deletion_receipt_unavailable');end if;
 now_at:=service_private.lifecycle_now(p_environment,row.subject_id);
 if now_at>=row.status_expires_at then return jsonb_build_object('version',1,'error','deletion_receipt_unavailable');end if;
 return service_private.deletion_progress(row,now_at);
end $$;

-- A delayed verified pre-cutoff recovery can cancel an exported ordinary intent before destruction.
-- Replay must see that newer fence too; it never grants service without fresh qualification checks.
create function service_private.record_ordinary_cancellation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.reason='ordinary_expiry' and old.state in ('retained','queued') and new.state='active' and old.destructive_started_at is null then
  perform service_private.enqueue_deletion(new,null,service_private.lifecycle_now(new.environment,new.subject_id),'ordinary_cancelled');
 end if;
 return new;
end $$;
create trigger ordinary_cancellation after update on service_private.workspace_lifecycle for each row execute function service_private.record_ordinary_cancellation();
alter table service_private.workspace_lifecycle add column inventory_cursor jsonb,add column inventory_completed_at timestamptz;
alter table service_private.account_lifecycle add column work_retry_at timestamptz not null default now(),add column work_lease uuid,
 add column work_lease_until timestamptz,add column work_attempts integer not null default 0;
create function public.lifecycle_take_work(p_environment text,p_limit integer default 2) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare exports jsonb;jobs jsonb;accounts jsonb;subject uuid;subjects uuid[];n integer:=least(greatest(coalesce(p_limit,2),1),5);
begin
 if p_environment is distinct from (select environment from service_private.policy where id=1) then raise exception 'lifecycle_configuration';end if;
 -- Claim children only after all selected subject fences, in deterministic subject order.
 select array_agg(candidate.subject_id order by candidate.subject_id) into subjects from (
  select distinct subject_id from (
   (select subject_id from service_private.deletion_outbox where environment=p_environment and acknowledged_at is null and retry_at<=clock_timestamp()
     and (lease_until is null or lease_until<clock_timestamp()) order by created_at,event_id limit n)
   union all
   (select subject_id from service_private.workspace_lifecycle where environment=p_environment and state<>'deleted' and boundary_verified
     and next_due_at<=service_private.lifecycle_now(environment,subject_id) and (lease_until is null or lease_until<clock_timestamp()) order by next_due_at,workspace_id limit n)
   union all
   (select a.subject_id from service_private.account_lifecycle a where a.environment=p_environment and a.state in ('deleting','deleted') and a.work_retry_at<=clock_timestamp()
     and (a.work_lease_until is null or a.work_lease_until<clock_timestamp()) and exists(select 1 from service_private.deletion_requests d
      where d.environment=a.environment and d.subject_id=a.subject_id and d.scope='account' and d.confirmed_at is not null and (d.auth_state<>'deleted' or d.renewal in ('pending','attention_required')))
     order by a.work_retry_at,a.subject_id limit n)
  ) candidates
 ) candidate;
 foreach subject in array coalesce(subjects,'{}'::uuid[]) loop perform service_private.lock_account(subject,p_environment);end loop;
 with due as(select event_id from service_private.deletion_outbox where environment=p_environment and subject_id=any(subjects) and acknowledged_at is null and retry_at<=clock_timestamp()
  and (lease_until is null or lease_until<clock_timestamp()) order by created_at,event_id limit n for update skip locked),
 claimed as(update service_private.deletion_outbox o set lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1
  from due where o.event_id=due.event_id returning o.event_id,o.lease,o.record,o.digest)
 select coalesce(jsonb_agg(jsonb_build_object('eventId',event_id,'lease',lease,'record',record,'digest',digest)),'[]') into exports from claimed;
 with due as(select workspace_id from service_private.workspace_lifecycle where environment=p_environment and subject_id=any(subjects) and state<>'deleted' and boundary_verified
  and next_due_at<=service_private.lifecycle_now(environment,subject_id) and (lease_until is null or lease_until<clock_timestamp()) order by next_due_at,workspace_id limit n for update skip locked),
 claimed as(update service_private.workspace_lifecycle l set lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1
  from due where l.workspace_id=due.workspace_id returning l.workspace_id,l.generation,l.subject_id,l.revision,l.lease)
 select coalesce(jsonb_agg(jsonb_build_object('workspaceId',workspace_id,'generation',generation,'subjectId',subject_id,'revision',revision,'lease',lease)),'[]') into jobs from claimed;
 with due as (
  select a.subject_id from service_private.account_lifecycle a where a.environment=p_environment and a.subject_id=any(subjects) and a.state in ('deleting','deleted')
   and a.work_retry_at<=clock_timestamp() and (a.work_lease_until is null or a.work_lease_until<clock_timestamp()) and exists(
   select 1 from service_private.deletion_requests d where d.environment=a.environment and d.subject_id=a.subject_id and d.scope='account' and d.confirmed_at is not null
    and (d.auth_state<>'deleted' or d.renewal in ('pending','attention_required')))
   order by a.work_retry_at,a.subject_id limit n for update skip locked
 ), claimed as (
  update service_private.account_lifecycle a set work_retry_at=clock_timestamp()+interval '1 minute',work_lease=gen_random_uuid(),
   work_lease_until=clock_timestamp()+interval '120 seconds',work_attempts=work_attempts+1 from due where a.environment=p_environment and a.subject_id=due.subject_id returning a.subject_id,a.work_lease
 ) select coalesce(jsonb_agg(jsonb_build_object('subjectId',subject_id,'lease',work_lease)),'[]') into accounts from claimed;
 return jsonb_build_object('exports',exports,'generations',jobs,'accounts',accounts);
end $$;
create function public.lifecycle_ack_export(p_environment text,p_event uuid,p_lease uuid,p_digest text,p_store text,p_cursor text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare event service_private.deletion_outbox;subject uuid;
begin
 select subject_id into subject from service_private.deletion_outbox where environment=p_environment and event_id=p_event;
 perform service_private.lock_account(subject,p_environment);
 select * into event from service_private.deletion_outbox where environment=p_environment and event_id=p_event for update;
 if event.acknowledged_at is not null and event.digest=p_digest then return jsonb_build_object('ok',true);end if;
 if event.event_id is null or event.lease is distinct from p_lease or event.lease_until<=clock_timestamp() or event.digest<>p_digest
  or coalesce(length(p_store),0) not between 1 and 256 or coalesce(length(p_cursor),0) not between 1 and 256 then return jsonb_build_object('ok',false,'error','lifecycle_conflict');end if;
 update service_private.deletion_outbox set acknowledged_at=clock_timestamp(),store_id=p_store,store_cursor=p_cursor,lease=null,lease_until=null where event_id=p_event;
 if event.request_id is not null and not exists(select 1 from service_private.deletion_outbox where environment=p_environment and request_id=event.request_id and event_kind='intent' and acknowledged_at is null) then
  update service_private.deletion_requests set intent='durable' where environment=p_environment and request_id=event.request_id;
 end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.lifecycle_retry_work(p_environment text,p_kind text,p_id uuid,p_lease uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if p_kind='export' then update service_private.deletion_outbox set retry_at=clock_timestamp()+interval '1 minute',lease=null,lease_until=null where environment=p_environment and event_id=p_id and lease=p_lease;
 elsif p_kind='generation' then update service_private.workspace_lifecycle set next_due_at=service_private.lifecycle_now(environment,subject_id)+interval '1 minute',lease=null,lease_until=null where environment=p_environment and workspace_id=p_id and lease=p_lease;
 else raise exception 'invalid_request';end if;
end $$;
create function public.lifecycle_prepare_job(p_environment text,p_workspace uuid,p_generation uuid,p_revision bigint,p_lease uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare subject uuid;row service_private.workspace_lifecycle;at_time timestamptz;ready boolean;event uuid;
begin
 select subject_id into subject from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 perform service_private.lock_account(subject,p_environment);
 perform service_private.reconcile_lifecycle_locked(subject,p_environment,service_private.lifecycle_now(p_environment,subject));
 perform service_private.lock_workspace_row(subject,p_environment,p_workspace);
 select * into row from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 at_time:=service_private.lifecycle_now(p_environment,subject);
 if row.lease is distinct from p_lease or row.lease_until<=clock_timestamp() or row.revision<p_revision then return jsonb_build_object('ok',false,'error','lifecycle_conflict');end if;
 if row.state in ('active','retained','deleted') then return jsonb_build_object('ok',true,'phase','waiting','revision',row.revision);end if;
 if row.reason='ordinary_expiry' and at_time<row.retrieve_until then return jsonb_build_object('ok',true,'phase','waiting','revision',row.revision);end if;
 select enabled and independent_ledger_ready and restore_admission_ready and cleanup_wiring_ready into ready from service_private.lifecycle_policy where id=1;
 if not coalesce(ready,false) then return jsonb_build_object('ok',false,'error','retrieval_configuration');end if;
 event:=service_private.enqueue_deletion(row,(select request_id from service_private.deletion_requests where environment=p_environment and subject_id=subject and confirmed_at is not null
   and (scope='account' or workspace_id=p_workspace) order by confirmed_at desc limit 1),at_time);
 if not exists(select 1 from service_private.deletion_outbox where event_id=event and acknowledged_at is not null) then return jsonb_build_object('ok',true,'phase','export_pending','revision',row.revision);end if;
 if exists(select 1 from public.op_blobs where workspace_id=p_workspace) then return jsonb_build_object('ok',false,'error','object_scope_unresolved');end if;
 insert into service_private.cloud_objects(environment,workspace_id,generation,bucket,object_path,source)
  select p_environment,p_workspace,p_generation,'snapshots',paths.object_path,paths.source from (
   select object_path,'snapshot' source from public.snapshots where workspace_id=p_workspace
  ) paths where not exists(select 1 from service_private.cloud_objects o where o.environment=p_environment and o.bucket='snapshots' and o.object_path=paths.object_path) limit 100;
 if exists(select 1 from service_private.cloud_objects where environment=p_environment and workspace_id=p_workspace and generation=p_generation and object_path not like 'workspaces/'||p_workspace::text||'/%') then return jsonb_build_object('ok',false,'error','object_scope_invalid');end if;
 return jsonb_build_object('ok',true,'phase','inventory','revision',row.revision,'cursor',row.inventory_cursor,'inventoryComplete',row.inventory_completed_at is not null);
end $$;
create function public.lifecycle_inventory_page(p_environment text,p_workspace uuid,p_generation uuid,p_revision bigint,p_lease uuid,p_paths jsonb,p_cursor jsonb,p_done boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare subject uuid;row service_private.workspace_lifecycle;path text;
begin
 select subject_id into subject from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 perform service_private.lock_account(subject,p_environment);perform service_private.lock_workspace_row(subject,p_environment,p_workspace);
 select * into row from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 if row.revision is distinct from p_revision or row.lease is distinct from p_lease or row.lease_until<=clock_timestamp() or row.state not in ('queued','deleting') then return jsonb_build_object('ok',false,'error','lifecycle_conflict');end if;
 if jsonb_typeof(p_paths) is distinct from 'array' or jsonb_array_length(p_paths)>100 or octet_length(coalesce(p_cursor,'null')::text)>8192 or p_done is null then raise exception 'invalid_request';end if;
 for path in select jsonb_array_elements_text(p_paths) loop
  if path is null or length(path)>1024 or path not like 'workspaces/'||p_workspace::text||'/%' or position('..' in path)>0 then raise exception 'object_scope_invalid';end if;
  if exists(select 1 from service_private.cloud_objects where environment=p_environment and bucket='snapshots' and object_path=path and (workspace_id<>p_workspace or generation<>p_generation)) then raise exception 'object_scope_invalid';end if;
  insert into service_private.cloud_objects(environment,workspace_id,generation,bucket,object_path,source,state) values(p_environment,p_workspace,p_generation,'snapshots',path,'inventory','present')
   on conflict(environment,bucket,object_path) do update set state=case when service_private.cloud_objects.state='absent' then 'present' else service_private.cloud_objects.state end,verified_absent_at=null;
 end loop;
 if p_done and exists(select 1 from public.snapshots s where s.workspace_id=p_workspace and not exists(
  select 1 from service_private.cloud_objects o where o.environment=p_environment and o.workspace_id=p_workspace and o.generation=p_generation and o.bucket='snapshots' and o.object_path=s.object_path)) then
  return jsonb_build_object('ok',false,'error','inventory_metadata_pending');end if;
 update service_private.workspace_lifecycle set inventory_cursor=p_cursor,inventory_completed_at=case when p_done then clock_timestamp() end where environment=p_environment and workspace_id=p_workspace;
 return jsonb_build_object('ok',true);
end $$;

create function public.lifecycle_delete_batch(p_environment text,p_workspace uuid,p_generation uuid,p_revision bigint,p_lease uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare subject uuid;row service_private.workspace_lifecycle;paths jsonb;now_at timestamptz;
begin
 select subject_id into subject from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 perform service_private.lock_account(subject,p_environment);
 now_at:=service_private.lifecycle_now(p_environment,subject);perform service_private.reconcile_lifecycle_locked(subject,p_environment,now_at);
 perform service_private.lock_workspace_row(subject,p_environment,p_workspace);
 select * into row from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 if row.revision is distinct from p_revision or row.lease is distinct from p_lease or row.lease_until<=clock_timestamp() or row.state not in ('queued','deleting')
  or row.inventory_completed_at is null then return jsonb_build_object('ok',false,'error','lifecycle_conflict');end if;
 if not coalesce((select enabled and independent_ledger_ready and restore_admission_ready and cleanup_wiring_ready from service_private.lifecycle_policy where id=1),false) then return jsonb_build_object('ok',false,'error','retrieval_configuration');end if;
 if not exists(select 1 from service_private.deletion_outbox where environment=p_environment and workspace_id=p_workspace and generation=p_generation and lifecycle_revision=p_revision and event_kind='intent' and acknowledged_at is not null) then return jsonb_build_object('ok',false,'error','lifecycle_conflict');end if;
 if row.destructive_started_at is null then
  update service_private.workspace_lifecycle set state='deleting',destructive_started_at=now_at where environment=p_environment and workspace_id=p_workspace;
  update service_private.deletion_requests set content='deleting' where environment=p_environment and confirmed_at is not null and subject_id=subject and (scope='account' or workspace_id=p_workspace) and content<>'deleted';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'path',object_path)),'[]') into paths from (
  select bucket,object_path from service_private.cloud_objects where environment=p_environment and workspace_id=p_workspace and generation=p_generation and state<>'absent' order by bucket,object_path limit 100
 ) p;
 return jsonb_build_object('ok',true,'paths',paths,'transfersPending',exists(select 1 from service_private.cloud_transfers where environment=p_environment and workspace_id=p_workspace and generation=p_generation and method='upload' and state in ('dispatched','unknown')));
end $$;
create function public.lifecycle_object_result(p_environment text,p_workspace uuid,p_generation uuid,p_revision bigint,p_lease uuid,p_path text,p_absent boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare subject uuid;row service_private.workspace_lifecycle;
begin
 select subject_id into subject from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 perform service_private.lock_account(subject,p_environment);perform service_private.lock_workspace_row(subject,p_environment,p_workspace);
 select * into row from service_private.workspace_lifecycle where environment=p_environment and workspace_id=p_workspace and generation=p_generation;
 if row.revision is distinct from p_revision or row.lease is distinct from p_lease or row.lease_until<=clock_timestamp() or row.state<>'deleting' then return jsonb_build_object('ok',false,'error','lifecycle_conflict');end if;
 update service_private.cloud_objects set state=case when p_absent then 'absent' else 'delete_unknown' end,
  verified_absent_at=case when p_absent then clock_timestamp() end,attempts=attempts+1
  where environment=p_environment and workspace_id=p_workspace and generation=p_generation and object_path=p_path and bucket='snapshots';
 if not found then raise exception 'object_scope_invalid';end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.lifecycle_transfer_begin(p_device uuid,p_workspace uuid,p_generation uuid,p_seq bigint,p_path text,p_method text,p_producer text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare env text;subject uuid;row service_private.workspace_lifecycle;ticket uuid;
begin
 if coalesce(p_producer,'')!~'^[a-f0-9]{64}$' then raise exception 'lifecycle_configuration';end if;
 perform service_private.read_access(p_workspace,p_device);perform service_private.initialization_access(p_workspace,p_device,'control');
 perform 1 from public.snapshot_transfer_access(p_device,p_workspace,p_generation,p_seq,p_path,p_method);
 select environment,subject_id into env,subject from service_private.workspace_lifecycle where workspace_id=p_workspace and generation=p_generation;
 select * into row from service_private.workspace_lifecycle where environment=env and workspace_id=p_workspace and generation=p_generation;
 insert into service_private.cloud_objects(environment,workspace_id,generation,bucket,object_path,source) values(env,p_workspace,p_generation,'snapshots',p_path,'transfer') on conflict do nothing;
 insert into service_private.cloud_transfers(environment,subject_id,workspace_id,generation,producer_sha256,device_id,session_id,lifecycle_revision,bucket,object_path,method,created_at)
  values(env,subject,p_workspace,p_generation,p_producer,p_device,nullif(auth.jwt()->>'session_id','')::uuid,row.revision,'snapshots',p_path,p_method,clock_timestamp()) returning ticket_id into ticket;
 return jsonb_build_object('version',1,'ticketId',ticket,'lifecycleVersion',row.revision);
end $$;
create function public.lifecycle_transfer_dispatch(p_ticket uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ticket service_private.cloud_transfers;owner uuid;row service_private.workspace_lifecycle;
begin
 select * into ticket from service_private.cloud_transfers where ticket_id=p_ticket;
 if ticket.ticket_id is null or ticket.method<>'upload' then return jsonb_build_object('ok',false,'current',false);end if;
 perform service_private.lock_account(ticket.subject_id,ticket.environment);
 perform service_private.reconcile_lifecycle_locked(ticket.subject_id,ticket.environment,service_private.lifecycle_now(ticket.environment,ticket.subject_id));
 perform service_private.lock_workspace_row(ticket.subject_id,ticket.environment,ticket.workspace_id);
 select user_id into owner from service_private.account_lifecycle where environment=ticket.environment and subject_id=ticket.subject_id and state='active';
 select * into row from service_private.workspace_lifecycle where environment=ticket.environment and workspace_id=ticket.workspace_id and generation=ticket.generation;
 if owner is null or row.state is distinct from 'active' or row.revision is distinct from ticket.lifecycle_revision
  or not service_private.identity_active(ticket.environment,owner)
  or not exists(select 1 from auth.sessions where id=ticket.session_id and user_id=owner)
  or not exists(select 1 from public.devices where id=ticket.device_id and user_id=owner and auth_session_id=ticket.session_id and status='authorized' and service_version=2)
  or not coalesce((service_private.evaluate(owner,ticket.environment)->>'eligible')::boolean,false) then return jsonb_build_object('ok',false,'current',false);end if;
 update service_private.cloud_transfers set state='dispatched' where ticket_id=p_ticket and state='prepared';
 return jsonb_build_object('ok',found,'current',found);
end $$;
create function public.lifecycle_transfer_finish(p_ticket uuid,p_state text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ticket service_private.cloud_transfers;row service_private.workspace_lifecycle;
begin
 select * into ticket from service_private.cloud_transfers where ticket_id=p_ticket;
 perform service_private.lock_account(ticket.subject_id,ticket.environment);perform service_private.lock_workspace_row(ticket.subject_id,ticket.environment,ticket.workspace_id);
 if p_state not in ('complete','failed','unknown') then raise exception 'invalid_request';end if;
 if ticket.ticket_id is null then return jsonb_build_object('ok',false,'error','lifecycle_conflict');end if;
 update service_private.cloud_transfers set state=p_state,finished_at=case when p_state<>'unknown' then clock_timestamp() end where ticket_id=p_ticket and state in ('prepared','dispatched','unknown');
 if not found and ticket.state is distinct from p_state then return jsonb_build_object('ok',false,'error','lifecycle_conflict');end if;
 select * into row from service_private.workspace_lifecycle where environment=ticket.environment and workspace_id=ticket.workspace_id and generation=ticket.generation;
 if ticket.method='upload' and p_state='complete' then
  update service_private.cloud_objects set state=case when row.state='active' and row.revision=ticket.lifecycle_revision then 'present' else 'delete_pending' end,
   verified_absent_at=null where environment=ticket.environment and bucket=ticket.bucket and object_path=ticket.object_path;
  if row.state<>'active' then update service_private.workspace_lifecycle set inventory_completed_at=null,inventory_cursor=null,next_due_at=service_private.lifecycle_now(ticket.environment,ticket.subject_id) where environment=ticket.environment and workspace_id=ticket.workspace_id;end if;
 end if;
 return jsonb_build_object('ok',true,'current',row.state='active' and row.revision=ticket.lifecycle_revision);
end $$;
create function public.lifecycle_renewal_result(p_environment text,p_subject uuid,p_state text,p_lease uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform service_private.lock_account(p_subject,p_environment);
 perform public.billing_assert_lease(p_environment,p_subject,p_lease);
 if p_state not in ('stopped','pending','attention_required') or not exists(select 1 from service_private.account_lifecycle where environment=p_environment and subject_id=p_subject and state in ('deleting','deleted')) then raise exception 'invalid_request';end if;
 update service_private.deletion_requests set renewal=p_state where environment=p_environment and subject_id=p_subject and scope='account' and confirmed_at is not null and renewal<>'stopped';
 if p_state='stopped' and not exists(select 1 from public.billing_operations where environment=p_environment and subject_id=p_subject and status='pending') then
  update service_private.account_lifecycle set provider_user_id=null,provider_identity_until=null where environment=p_environment and subject_id=p_subject;
 end if;
end $$;
create function public.lifecycle_account_ready(p_environment text,p_subject uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a service_private.account_lifecycle;target uuid;removed bigint;
begin
 perform service_private.lock_account(p_subject,p_environment);
 select * into a from service_private.account_lifecycle where environment=p_environment and subject_id=p_subject;
 if not coalesce((select enabled and independent_ledger_ready and restore_admission_ready and cleanup_wiring_ready from service_private.lifecycle_policy where id=1),false) then return jsonb_build_object('ready',false);end if;
 select d.auth_target into target from service_private.deletion_requests d where d.environment=p_environment and d.request_id=a.delete_request_id and d.scope='account';
 if a.state<>'deleting' or coalesce(a.user_id,target) is null or exists(select 1 from service_private.workspace_lifecycle where environment=p_environment and subject_id=p_subject and state<>'deleted')
  or exists(select 1 from service_private.deletion_outbox where environment=p_environment and subject_id=p_subject and event_kind='intent' and acknowledged_at is null) then return jsonb_build_object('ready',false);end if;
 delete from public.control_events where id in(select c.id from public.control_events c join public.devices d on d.id=c.device_id where d.user_id=coalesce(a.user_id,target) order by c.id limit 200);
 get diagnostics removed=row_count;
 if removed>0 then return jsonb_build_object('ready',false,'phase','purging_metadata');end if;
 delete from public.rpc_buckets where ctid in(select b.ctid from public.rpc_buckets b join public.devices d on d.id=b.device_id where d.user_id=coalesce(a.user_id,target) limit 200);
 get diagnostics removed=row_count;
 if removed>0 then return jsonb_build_object('ready',false,'phase','purging_metadata');end if;
 return jsonb_build_object('ready',true,'ownerId',coalesce(a.user_id,target),'requestId',a.delete_request_id);
end $$;
create function public.lifecycle_account_deleted(p_environment text,p_subject uuid,p_owner uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a service_private.account_lifecycle;now_at timestamptz;
begin
 perform service_private.lock_account(p_subject,p_environment);
 select * into a from service_private.account_lifecycle where environment=p_environment and subject_id=p_subject;
 if a.state not in ('deleting','deleted') or a.owner_tag is distinct from service_private.owner_tag(p_owner)
  or exists(select 1 from auth.users where id=p_owner) then return jsonb_build_object('ok',false,'error','lifecycle_conflict');end if;
 if a.state='deleting' and (not coalesce((public.lifecycle_account_ready(p_environment,p_subject)->>'ready')::boolean,false)) then return jsonb_build_object('ok',false,'error','lifecycle_conflict');end if;
 now_at:=service_private.lifecycle_now(p_environment,p_subject);
 update service_private.account_lifecycle set state='deleted',user_id=null where environment=p_environment and subject_id=p_subject;
 update service_private.deletion_requests set auth_state='deleted',auth_target=null where environment=p_environment and subject_id=p_subject and scope='account' and confirmed_at is not null;
 update public.billing_accounts set trial_request=null,trial_started_at=null,trial_ends_at=null,trial_consumed_at=null where environment=p_environment and subject_id=p_subject;
 delete from public.ai_limit_events where environment=p_environment and subject_id=p_subject;
 return jsonb_build_object('ok',true);
end $$;
create function public.lifecycle_account_work_done(p_environment text,p_subject uuid,p_lease uuid,p_retry_seconds integer default 60) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 perform service_private.lock_account(p_subject,p_environment);
 update service_private.account_lifecycle set work_lease=null,work_lease_until=null,
  work_retry_at=clock_timestamp()+make_interval(secs=>least(greatest(coalesce(p_retry_seconds,60),10),3600))
  where environment=p_environment and subject_id=p_subject and work_lease=p_lease and work_lease_until>clock_timestamp();
 return jsonb_build_object('ok',found);
end $$;
create unique index billing_deletion_object on public.billing_operations(environment,subject_id,action,provider_id)
 where action in ('delete_renewal_stop','delete_checkout_close') and provider_id is not null;
create function public.lifecycle_settlement_operation(p_environment text,p_user uuid,p_lease uuid,p_action text,p_provider text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare operation public.billing_operations;
begin
 perform public.billing_assert_lease(p_environment,p_user,p_lease);
 if p_action not in ('delete_renewal_stop','delete_checkout_close') or coalesce(p_provider,'')!~'^(sub_|cs_)[A-Za-z0-9_]+$'
  or not exists(select 1 from service_private.account_lifecycle where environment=p_environment and subject_id=p_user and state in ('deleting','deleted')) then raise exception 'invalid_request';end if;
 select * into operation from public.billing_operations where environment=p_environment and subject_id=p_user and action=p_action and provider_id=p_provider;
 if operation.request_id is null then
  insert into public.billing_operations(environment,subject_id,request_id,action,provider_id)
   values(p_environment,p_user,gen_random_uuid(),p_action,p_provider) returning * into operation;
 end if;
 return jsonb_build_object('request_id',operation.request_id,'created_at',operation.created_at,'status',operation.status);
end $$;

-- Closed subjects reuse original settlement facts without accepting new ordinary billing intents.
do $settlement$
declare fn record;body text;
begin
 select oid,prosrc into fn from pg_proc where pronamespace='public'::regnamespace and proname='billing_operation';
 body:=replace(fn.prosrc,'perform billing_assert_lease(p_environment,p_user,p_lease);',
  'perform billing_assert_lease(p_environment,p_user,p_lease); if not exists(select 1 from service_private.account_lifecycle where environment=p_environment and subject_id=p_user and state=''active'') and p_action not in (''delete_renewal_stop'',''delete_checkout_close'') and not exists(select 1 from public.billing_operations where environment=p_environment and subject_id=p_user and request_id=p_request) then raise exception ''service_revoked''; end if;');
 execute replace(pg_get_functiondef(fn.oid),fn.prosrc,body);
 select oid,prosrc into fn from pg_proc where pronamespace='public'::regnamespace and proname='billing_claim_trial';
 body:=replace(fn.prosrc,'if a.trial_started_at is null and not a.paid_ever then',
  'if a.trial_started_at is null and not a.paid_ever and not service_private.trial_blocked(service_private.live_user(p_environment,p_user),t) then');
 execute replace(pg_get_functiondef(fn.oid),fn.prosrc,body);
 select oid,prosrc into fn from pg_proc where pronamespace='public'::regnamespace and proname='billing_status';
 body:=replace(fn.prosrc,'''trialEligible'',a.trial_started_at is null and not coalesce(a.paid_ever,false)',
  '''trialEligible'',a.trial_started_at is null and not coalesce(a.paid_ever,false) and not service_private.trial_blocked(service_private.live_user(p_environment,p_user),t)');
 execute replace(pg_get_functiondef(fn.oid),fn.prosrc,body);
 select oid,prosrc into fn from pg_proc where pronamespace='public'::regnamespace and proname='billing_commit';
 body:=replace(fn.prosrc,'return billing_status(p_environment,p_user);',
  'if not exists(select 1 from service_private.account_lifecycle where environment=p_environment and subject_id=p_user and state=''active'') then delete from public.billing_grace where environment=p_environment and subject_id=p_user; update public.billing_accounts set trial_request=null,trial_started_at=null,trial_ends_at=null,trial_consumed_at=null where environment=p_environment and subject_id=p_user; end if; return billing_status(p_environment,p_user);');
 execute replace(pg_get_functiondef(fn.oid),fn.prosrc,body);
end $settlement$;

-- Privacy and worker tables are never directly exposed. Later retrieval tables have their own owner.
do $access$
declare tab record;fn record;
begin
 for tab in select c.oid::regclass name from pg_class c where c.relnamespace='service_private'::regnamespace and c.relkind='r' and c.relname in
  ('deletion_requests','deletion_outbox','cloud_objects','cloud_transfers','trial_protection','financial_holds','receipt_rate') loop
  execute format('alter table %s enable row level security',tab.name);
  execute format('revoke all on %s from public,anon,authenticated,service_role',tab.name);
 end loop;
 for fn in select p.oid::regprocedure name from pg_proc p where p.pronamespace='service_private'::regnamespace loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.name);
 end loop;
 for fn in select p.oid::regprocedure name from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'lifecycle_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.name);
  execute format('grant execute on function %s to service_role',fn.name);
 end loop;
end $access$;
grant execute on function public.lifecycle_status(jsonb),public.lifecycle_finish_initialization(jsonb),
 public.lifecycle_prepare_delete(jsonb),public.lifecycle_confirm_delete(jsonb),
 public.lifecycle_transfer_begin(uuid,uuid,uuid,bigint,text,text,text) to authenticated;
notify pgrst,'reload schema';
