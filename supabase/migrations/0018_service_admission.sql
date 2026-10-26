-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Installed D0 billing facts, existing sync proofs and server-owned environment configuration.
-- OUTPUT: Versioned paid-service gates around all ordinary cloud RPCs, preserving private proof implementations.
-- POS: D1 admission boundary. No trial duplication, D2 retrieval, production activation or budget mutation.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

create schema service_private;
revoke all on schema service_private from public,anon,authenticated;
create table service_private.migrations(version text primary key,sha256 text not null,installed_at timestamptz not null default now());
alter table service_private.migrations enable row level security;
revoke all on service_private.migrations from public,anon,authenticated;
create table service_private.policy (
  id integer primary key check(id=1), environment text not null,
  project_ref text not null, enabled boolean not null default false,
  min_service_version integer not null default 1 check(min_service_version=1),
  source_fingerprint text,
  check((environment='development' and project_ref='asqyvcnxdltzzfutbbqy')
    or (environment='production' and project_ref='keqprrgvcefqdwnxaafv'))
);
insert into service_private.policy(id,environment,project_ref) values(1,'development','asqyvcnxdltzzfutbbqy');
revoke all on service_private.policy from public,anon,authenticated;
grant usage on schema service_private to service_role;
grant select,update on service_private.policy to service_role;
alter table service_private.policy enable row level security;
alter table public.devices add column service_version integer not null default 0 check(service_version in (0,1));

-- Fresh reads after authoritative locks must observe expiry and committed revocations.
create or replace function public.billing_now(p_environment text,p_user uuid) returns timestamptz
language sql volatile security definer set search_path=public,pg_temp as $$
  select coalesce((select test_now from billing_accounts where environment=p_environment and user_id=p_user and environment='development'),clock_timestamp())
$$;
revoke all on function public.billing_now(text,uuid) from public,anon,authenticated;

create function service_private.evaluate(p_user uuid,p_environment text default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare cfg service_private.policy; state jsonb; source jsonb; why text;
begin
  select * into cfg from service_private.policy where id=1;
  if cfg.id is null or not cfg.enabled or p_environment is not null and cfg.environment<>p_environment then
    return jsonb_build_object('version',1,'eligible',false,'error','billing_configuration','minServiceVersion',1);
  end if;
  source:=public.billing_source(cfg.environment);
  if source is null or cfg.source_fingerprint is null or md5(source::text)<>cfg.source_fingerprint
    or source->>'account_id'<>'acct_1QvwdlITpGuR8ZMB' or source->>'rc_project'<>'projd720c733' then
    return jsonb_build_object('version',1,'eligible',false,'error','billing_configuration','minServiceVersion',1);
  end if;
  state:=public.billing_status(cfg.environment,p_user);
  if state ? 'error' then why:='billing_configuration';
  elsif coalesce((state->>'eligible')::boolean,false) then why:=null;
  elsif state->>'status'='revoked' then why:='service_revoked';
  elsif state->>'status'='expired' then why:='service_expired';
  else why:='service_not_started'; end if;
  return jsonb_build_object('version',1,'eligible',why is null,'error',why,
    'billingStatus',state->'status','serverNow',state->'serverNow','effectiveEnd',state->'effectiveEnd','minServiceVersion',cfg.min_service_version);
end $$;

create function service_private.require_version() returns void
language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid; headers jsonb;
begin
  if auth.uid() is null or auth.jwt()->>'role'<>'authenticated' or sid is null
    or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid()) then
    raise exception 'authentication_failed' using errcode='42501';
  end if;
  begin headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then headers:='{}'; end;
  if headers->>'x-goalloom-service-version' is distinct from '1' then
    raise exception 'upgrade_required' using errcode='PT409',detail='{"version":1,"minServiceVersion":1}';
  end if;
end $$;

create function service_private.require_access() returns void
language plpgsql volatile security definer set search_path='' as $$
declare state jsonb; expected text;
begin
  perform service_private.require_version();
  select 'https://'||project_ref||'.supabase.co/auth/v1' into expected from service_private.policy where id=1;
  if expected is null or auth.jwt()->>'iss' is distinct from expected then
    raise exception 'billing_configuration' using errcode='PT503';
  end if;
  state:=service_private.evaluate(auth.uid());
  if state->>'error'='billing_configuration' then
    raise exception 'billing_configuration' using errcode='PT503',detail=state::text;
  elsif state->>'error' is not null then
    raise exception '%',state->>'error' using errcode='PT403',detail=state::text;
  end if;
end $$;

create function service_private.lock_workspace(p_workspace uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
  if p_workspace is not null then
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_workspace::text,18));
    perform 1 from public.workspaces where id=p_workspace and user_id=auth.uid() for update;
  end if;
end $$;
create function service_private.write_access(p_workspace uuid default null) returns void
language plpgsql volatile security definer set search_path='' as $$
declare configured_environment text;
begin
  perform service_private.lock_workspace(p_workspace);
  select p.environment into configured_environment from service_private.policy p where id=1;
  perform 1 from public.billing_accounts a where a.environment=configured_environment and a.user_id=auth.uid() for update;
  perform service_private.require_access();
end $$;

-- Only the existing D0 projection can answer this internal seam; absence never grants access.
create or replace function public.sync_entitled(p_user uuid) returns boolean
language sql volatile security definer set search_path='' as $$
  select coalesce((service_private.evaluate(p_user)->>'eligible')::boolean,false)
$$;
revoke all on function public.sync_entitled(uuid) from public,anon,authenticated;

-- Existing proof/transaction code moves intact behind a non-exposed schema.
-- Public wrappers are the admission boundary; the generic device guard remains payment-independent.
do $wrap$
declare f record; original text; args text; result text; invoke text; body text; target regprocedure;
begin
  for f in select p.*,e.expected_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join (values ('bootstrap_workspace','33b6bb2072e90f5eef209f4ba23dbcde'),
      ('commit_roster','540d94b9a9c29ecae9ae69f1b49a653a'),
      ('complete_recovery','feba624b78720de40d7d844d255e494f'),
      ('create_new_workspace','a1e55078deccb2eca7ba4db73e330228'),
      ('get_key_envelopes','216368ebb5d6f27119ecc2d2d1de48f2'),
      ('get_latest_checkpoint','c80b30d38ebef1a0e54f151efe7733d1'),
      ('get_roster','7c311b98c84b34d17c07fe90d2ae4750'),
      ('get_sync_status','a838b8b8285565550ea9bacae5274f79'),
      ('list_account','f74883ba978b6fc64234d2975faf74ea'),
      ('pull_ops','4a2b98b166d1d30cf886329ee1ad2333'),
      ('push_ops','915737f16106973cf360d355865bc629'),
      ('put_key_envelopes','386c10c1fc41f3b071d27b45bb25e689'),
      ('rebind_device','0c80173833887668575f2311944ab062'),
      ('regenerate_recovery','3950e4e3c1aa88b0b0fd90d4c039de06'),
      ('register_device','94ec6918a6537caa51ed9fe5729a590d'),
      ('reset_sync','d964e17bc49aa129d66e8cc234f19c5a'),
      ('revoke_device','f4689a95b8d578762b3ba69c85ddd198'),
      ('rotate_epoch','9cb35b67a2197e1b5ca5a7d874e5f91b'),
      ('start_recovery','5aef6e398f6754a9003ec2b7f5babcaa')) e(name,expected_hash) on e.name=p.proname where n.nspname='public'
  loop
    if md5(f.prosrc)<>f.expected_hash then raise exception 'Unreviewed sync source: %',f.proname; end if;
    args:=pg_get_function_arguments(f.oid); result:=pg_get_function_result(f.oid);
    select string_agg(quote_ident(name),', ' order by position) into invoke
      from unnest(f.proargnames[1:f.pronargs]) with ordinality as a(name,position);
    target:=f.oid::regprocedure;
    execute format('alter function %s set schema service_private',target);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
    if f.proname='push_ops' then
      original:=pg_get_functiondef(f.oid);
      original:=replace(original,'''ws:'' || p_workspace::text','''cloud:v1:ws:'' || p_workspace::text');
      original:=replace(original,'perform realtime.send(jsonb_build_object(''head'', v_head), ''head'', ''cloud:v1:ws:'' || p_workspace::text, true);',
        'if coalesce((service_private.evaluate(auth.uid())->>''eligible'')::boolean,false) then perform realtime.send(jsonb_build_object(''head'', v_head), ''head'', ''cloud:v1:ws:'' || p_workspace::text, true); end if;');
      if original not like '%if coalesce((service_private.evaluate%' then raise exception 'Head emitter source drift'; end if;
      execute original;
    end if;
    body:=case when f.proname in ('rebind_device','revoke_device','reset_sync')
      then 'perform service_private.require_version(); ' else 'perform service_private.require_access(); ' end;
    if f.proname in ('register_device','bootstrap_workspace','create_new_workspace','push_ops','commit_roster','rotate_epoch','start_recovery','complete_recovery','regenerate_recovery','put_key_envelopes') then
      body:=body||case when f.proname='register_device' then 'perform service_private.write_access(null); ' else 'perform service_private.write_access(p_workspace); ' end;
    elsif f.proname='reset_sync' then body:=body||'perform service_private.lock_workspace(p_workspace); ';end if;
    if f.proname='register_device' then
      body:=body||format('result_id:=service_private.%I(%s); update public.devices set service_version=1 where id=result_id; return result_id;',f.proname,invoke);
    elsif f.proname='rebind_device' then
      body:=body||format('perform service_private.%I(%s); update public.devices set service_version=1 where id=p_device and user_id=auth.uid(); return;',f.proname,invoke);
    elsif f.proretset then body:=body||format('return query select * from service_private.%I(%s);',f.proname,invoke);
    elsif f.prorettype='void'::regtype then body:=body||format('perform service_private.%I(%s); return;',f.proname,invoke);
    else body:=body||format('return service_private.%I(%s);',f.proname,invoke); end if;
    body:='declare result_id uuid; begin '||body||' exception when insufficient_privilege then if sqlerrm in (''sync not entitled'',''not entitled'') then perform service_private.require_access(); raise exception ''billing_configuration'' using errcode=''PT503''; else raise; end if; end;';
    execute format('create function public.%I(%s) returns %s language plpgsql volatile security definer set search_path='''' as %L',f.proname,args,result,body);
    execute format('revoke all on function public.%I(%s) from public,anon',f.proname,pg_get_function_identity_arguments(f.oid));
    execute format('grant execute on function public.%I(%s) to authenticated',f.proname,pg_get_function_identity_arguments(f.oid));
  end loop;
  if (select count(*) from pg_proc where pronamespace='service_private'::regnamespace and proname in ('bootstrap_workspace','commit_roster','complete_recovery','create_new_workspace','get_key_envelopes','get_latest_checkpoint','get_roster','get_sync_status','list_account','pull_ops','push_ops','put_key_envelopes','rebind_device','regenerate_recovery','register_device','reset_sync','revoke_device','rotate_epoch','start_recovery'))<>19 then raise exception 'Incomplete sync admission surface';end if;
end $wrap$;

create or replace function public.receipts_for(p_workspace uuid,p_device uuid,p_op_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform service_private.require_version();
  raise exception 'upgrade_required' using errcode='PT409',detail='{"version":1,"minServiceVersion":1}';
end $$;
create function public.receipts_for(p_workspace uuid,p_device uuid,p_op_ids uuid[],p_payload_hashes text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform service_private.require_version();
  perform public._device_guard(p_device);
  if p_op_ids is null or p_payload_hashes is null or cardinality(p_op_ids)>200
    or cardinality(p_op_ids)<>cardinality(p_payload_hashes)
    or exists(select 1 from unnest(p_op_ids,p_payload_hashes) as r(id,hash) where id is null or hash is null or hash!~'^[a-f0-9]{64}$')
    or (select count(distinct id) from unnest(p_op_ids) id)<>cardinality(p_op_ids) then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  if not exists(select 1 from public.workspaces where id=p_workspace and user_id=auth.uid()) then
    raise exception 'workspace mismatch' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('op_id',r.op_id,'payload_hash',r.payload_hash,'seq',r.seq))
    from public.op_receipts r join unnest(p_op_ids,p_payload_hashes) as requested(id,hash)
      on r.op_id=requested.id and r.payload_hash=requested.hash where r.workspace_id=p_workspace),'[]'::jsonb);
end $$;
revoke all on function public.receipts_for(uuid,uuid,uuid[],text[]) from public,anon;
grant execute on function public.receipts_for(uuid,uuid,uuid[],text[]) to authenticated;

-- The old signer cannot mint new direct credentials after this migration.
create or replace function public.snapshot_access(p_device uuid,p_workspace uuid,p_seq bigint,p_path text)
returns table(object_path text,sha256 text) language plpgsql stable security definer set search_path='' as $$
begin
  perform service_private.require_version();
  raise exception 'upgrade_required' using errcode='PT409',detail='{"version":1,"minServiceVersion":1}';
end $$;
create function public.snapshot_transfer_access(p_device uuid,p_workspace uuid,p_generation uuid,p_seq bigint,p_path text,p_method text)
returns table(object_path text,sha256 text,size bigint) language plpgsql stable security definer set search_path='' as $$
declare snap public.snapshots; current_generation uuid;
begin
  perform service_private.require_access();
  perform public._device_guard(p_device);
  if p_method not in ('upload','download') or p_method is null or p_seq is null or p_seq<0 or p_seq>9007199254740991
    or p_path is null or length(p_path)>256 or p_path!~'^[a-zA-Z0-9/_-]+[.]bin$' or position('..' in p_path)>0 then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  select generation into current_generation from public.workspaces where id=p_workspace and user_id=auth.uid();
  if current_generation is null then raise exception 'workspace mismatch' using errcode='42501'; end if;
  if p_generation is null or current_generation<>p_generation then raise exception 'snapshot_conflict' using errcode='PT409';end if;
  select s.* into snap from public.snapshots s where s.workspace_id=p_workspace and s.upto_seq=p_seq and s.object_path=p_path;
  if snap.workspace_id is null or snap.state='retired' or p_method='download' and snap.state<>'published' then
    raise exception 'snapshot_not_found' using errcode='PT404';
  end if;
  if snap.size not between 1 and 2097152 or snap.sha256!~'^[a-f0-9]{64}$' then
    raise exception 'snapshot_conflict' using errcode='PT409';
  end if;
  if p_method='upload' and (snap.created_by is distinct from p_device
    or p_path is distinct from 'workspaces/'||p_workspace::text||'/'||p_generation::text||'/'||p_seq::text||'.bin') then
    raise exception 'snapshot_conflict' using errcode='PT409';
  end if;
  if p_method='download' and p_path is distinct from 'workspaces/'||p_workspace::text||'/'||p_generation::text||'/'||p_seq::text||'.bin'
    and p_path is distinct from 'workspaces/'||p_workspace::text||'/'||p_seq::text||'.bin' then
    raise exception 'snapshot_conflict' using errcode='PT409';
  end if;
  return query select snap.object_path,snap.sha256,snap.size;
end $$;
revoke all on function public.snapshot_transfer_access(uuid,uuid,uuid,bigint,text,text) from public,anon;
grant execute on function public.snapshot_transfer_access(uuid,uuid,uuid,bigint,text,text) to authenticated;

create or replace function public.realtime_can_read(p_topic text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
  if auth.uid() is null or sid is null or p_topic is null then return false; end if;
  return coalesce((service_private.evaluate(auth.uid())->>'eligible')::boolean,false)
    and exists(select 1 from public.workspaces w where w.user_id=auth.uid() and p_topic='cloud:v1:ws:'||w.id::text)
    and exists(select 1 from public.devices d where d.user_id=auth.uid() and d.auth_session_id=sid and d.status='authorized' and d.service_version=1)
    and exists(select 1 from auth.sessions s where s.id=sid and s.user_id=auth.uid());
end $$;
do $policies$ begin
  if exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname not in ('ws topic read','ws topic write')) then
    raise exception 'Unreviewed Realtime policy';
  end if;
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "ws topic read" on realtime.messages';
    execute 'drop policy if exists "ws topic write" on realtime.messages';
    execute 'create policy "ws topic read" on realtime.messages for select to authenticated using (extension=''broadcast'' and (select public.realtime_can_read(realtime.topic())))';
    execute 'create policy "ws topic write" on realtime.messages for insert to authenticated with check(false)';
  end if;
end $policies$;
revoke all on all functions in schema service_private from public,anon,authenticated,service_role;
notify pgrst,'reload schema';

-- Reconciliation shares the billing-account fence and samples time only after taking it.
create or replace function public.billing_commit(p_environment text,p_user uuid,p_lease uuid,p_subscriptions jsonb,p_transactions jsonb,p_grace jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb; x jsonb; g jsonb; c text; t timestamptz; allowed text[]; affected integer;
begin
  perform billing_assert_lease(p_environment,p_user,p_lease);
  t:=billing_now(p_environment,p_user);
  select customer_id into strict c from billing_customers where environment=p_environment and user_id=p_user;
  select array[monthly_price,annual_price] into strict allowed from billing_sources where environment=p_environment and source='stripe' and enabled;
  for s in select value from jsonb_array_elements(p_subscriptions) loop
    if s->>'customer_id'<>c or not(s->>'price_id'=any(allowed)) or s->>'subscription_id' !~ '^sub_[A-Za-z0-9]+$' then raise exception 'billing_identity'; end if;
    if exists(select 1 from billing_subscriptions where environment=p_environment and subscription_id=s->>'subscription_id' and user_id<>p_user) then raise exception 'billing_identity'; end if;
    insert into billing_subscriptions values(p_environment,p_user,s->>'subscription_id',c,s->>'status',s->>'price_id',(s->>'period_start')::timestamptz,(s->>'period_end')::timestamptz,(s->>'cancel_at_period_end')::boolean,s->>'schedule_id',s->>'next_price',t)
      on conflict(environment,subscription_id) do update set status=excluded.status,price_id=excluded.price_id,period_start=excluded.period_start,period_end=excluded.period_end,cancel_at_period_end=excluded.cancel_at_period_end,schedule_id=excluded.schedule_id,next_price=excluded.next_price,verified_at=t
      where billing_subscriptions.user_id=excluded.user_id and billing_subscriptions.customer_id=excluded.customer_id;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'billing_identity'; end if;
  end loop;
  for x in select value from jsonb_array_elements(p_transactions) loop
    if not(x->>'price_id'=any(allowed)) or not exists(select 1 from billing_subscriptions where environment=p_environment and user_id=p_user and subscription_id=x->>'subscription_id') then raise exception 'billing_identity'; end if;
    if exists(select 1 from billing_transactions where environment=p_environment and invoice_id=x->>'invoice_id' and (user_id<>p_user or subscription_id<>x->>'subscription_id')) then raise exception 'billing_identity'; end if;
    insert into billing_transactions values(p_environment,x->>'invoice_id',p_user,x->>'subscription_id',x->>'price_id',(x->>'starts_at')::timestamptz,(x->>'ends_at')::timestamptz,(x->>'paid_at')::timestamptz,(x->>'amount_cents')::integer,(x->>'refunded_cents')::integer,x->>'disposition',case when x->>'disposition'<>'paid' then t end,(x->>'rc_verified')::boolean,t,(x->>'financial_at')::timestamptz)
      on conflict(environment,invoice_id) do update set refunded_cents=excluded.refunded_cents,disposition=excluded.disposition,
        revoked_at=case when excluded.disposition='paid' then null else coalesce(billing_transactions.revoked_at,t) end,
        rc_verified=excluded.rc_verified,verified_at=t,financial_at=greatest(billing_transactions.financial_at,excluded.financial_at)
      where billing_transactions.user_id=excluded.user_id and billing_transactions.subscription_id=excluded.subscription_id
        and billing_transactions.price_id=excluded.price_id and billing_transactions.starts_at=excluded.starts_at and billing_transactions.ends_at=excluded.ends_at
        and billing_transactions.paid_at=excluded.paid_at and billing_transactions.amount_cents=excluded.amount_cents;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'billing_identity'; end if;
    -- A successful purchase consumes eligibility even if this reconciliation first sees its refund.
    -- trial_conversion_v2: financial success prevents a new grant; pending recognition preserves an existing grant.
    update billing_accounts set paid_ever=true,trial_consumed_at=case when (x->>'rc_verified')::boolean or x->>'disposition'<>'paid' then coalesce(trial_consumed_at,t) else trial_consumed_at end where environment=p_environment and user_id=p_user;
  end loop;
  update billing_grace set active=false where environment=p_environment and user_id=p_user;
  for g in select value from jsonb_array_elements(p_grace) loop
    if not exists(select 1 from billing_subscriptions where environment=p_environment and user_id=p_user and subscription_id=g->>'subscription_id')
      or not exists(select 1 from billing_transactions where environment=p_environment and user_id=p_user and subscription_id=g->>'subscription_id' and disposition='paid' and rc_verified and ends_at=(g->>'starts_at')::timestamptz) then raise exception 'billing_grace_invalid'; end if;
    insert into billing_grace values(p_environment,g->>'invoice_id',p_user,g->>'subscription_id',(g->>'starts_at')::timestamptz,(g->>'starts_at')::timestamptz+interval '72 hours',true)
      on conflict(environment,invoice_id) do update set active=true
      where billing_grace.user_id=excluded.user_id and billing_grace.subscription_id=excluded.subscription_id and billing_grace.starts_at=excluded.starts_at;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'billing_identity'; end if;
  end loop;
  update billing_accounts set verified_at=t,reconcile_at=clock_timestamp()+interval '15 minutes' where environment=p_environment and user_id=p_user;
  return billing_status(p_environment,p_user);
end $$;

