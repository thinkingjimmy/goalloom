-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Verified live owner/session and 0025's locked, immutable retained boundary.
-- OUTPUT: Service-only fixed-log build, challenge, capability and bounded ciphertext pages.
-- POS: D2 retained-copy admission; grants no ordinary sync, device or Storage authority.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

-- 1. Private, bounded-lifetime state. A content purge cascades all derived authority.
create table service_private.retrieval_builds (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 environment text not null check(environment in ('development','production')),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 generation uuid not null,
 boundary jsonb not null,
 proof_kind text not null check(proof_kind in ('recovery','device')),
 device_id uuid,
 trusted_pub bytea not null check(octet_length(trusted_pub)=32),
 checkpoint jsonb not null,
 recovery_envelope jsonb not null,
 roster_after bigint not null default 0,
 metadata_after bigint not null default 0,
 manifest jsonb,
 manifest_hash text,
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 check((proof_kind='recovery')=(device_id is null))
);
create index retrieval_builds_scope on service_private.retrieval_builds(workspace_id,generation,expires_at);
create index retrieval_builds_session on service_private.retrieval_builds(owner_id,session_id,expires_at);
create table service_private.retrieval_challenges (
 id uuid primary key default gen_random_uuid(),
 build_id uuid not null unique references service_private.retrieval_builds(id) on delete cascade,
 proof_body jsonb not null,
 expires_at timestamptz not null,
 consumed_at timestamptz
);
create table service_private.retrieval_capabilities (
 token_hash bytea primary key check(octet_length(token_hash)=32),
 build_id uuid not null references service_private.retrieval_builds(id) on delete cascade,
 expires_at timestamptz not null
);
alter table service_private.retrieval_builds enable row level security;
alter table service_private.retrieval_challenges enable row level security;
alter table service_private.retrieval_capabilities enable row level security;
revoke all on service_private.retrieval_builds,service_private.retrieval_challenges,service_private.retrieval_capabilities from public,anon,authenticated,service_role;

-- 2. Fixed-schema validation and cryptographic primitives, without legacy randomness.
create function service_private.retrieval_time(p_time timestamptz) returns text
language sql immutable set search_path='' as $$ select service_private.format_utc(p_time); $$;
create function service_private.retrieval_result(p_error text,p_reason text default null,p_now timestamptz default clock_timestamp()) returns jsonb
language sql volatile set search_path='' as $$
 select jsonb_build_object('ok',false,'version',1,'serverNow',service_private.retrieval_time(p_now),'error',p_error)||case when p_reason is null then '{}'::jsonb else jsonb_build_object('reason',p_reason) end;
$$;
create function service_private.retrieval_keys(p_body jsonb,p_keys text[]) returns boolean
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p_body)='object' then (select array_agg(k order by k) from jsonb_object_keys(p_body) k)=(select array_agg(k order by k) from unnest(p_keys) k) else false end;
$$;
create function service_private.retrieval_uuid(p_value jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(p_value)='string' and (p_value#>>'{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$$;
create function service_private.retrieval_hex(p_value jsonb,p_width integer) returns boolean
language sql immutable set search_path='' as $$ select jsonb_typeof(p_value)='string' and length(p_value#>>'{}')=p_width and (p_value#>>'{}')~'^[0-9a-f]+$'; $$;
create function service_private.retrieval_integer(p_value jsonb,p_min bigint default 0) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p_value) is distinct from 'number' or coalesce(p_value#>>'{}','')!~'^(0|[1-9][0-9]{0,15})$' then return false;end if;
 return (p_value#>>'{}')::numeric between p_min and 9007199254740991;
end $$;
create function service_private.retrieval_random() returns bytea
language plpgsql volatile security definer set search_path='' as $$
declare r bytea;
begin
 r:=service_private.secure_random(32);
 if octet_length(r) is distinct from 32 then return null;end if;
 return r;
exception when undefined_function or invalid_schema_name then return null;
 when raise_exception then if sqlerrm='lifecycle_configuration' then return null;else raise;end if;
end $$;
create function service_private.retrieval_session(p_owner uuid,p_session uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select p_owner is not null and p_session is not null and exists(
  select 1 from auth.users u join auth.sessions s on s.user_id=u.id
  where u.id=p_owner and s.id=p_session and to_jsonb(u)->>'deleted_at' is null
   and ((to_jsonb(u)->>'banned_until') is null or (to_jsonb(u)->>'banned_until')::timestamptz<=clock_timestamp())
   and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>clock_timestamp()));
$$;
create function service_private.retrieval_lock(p_owner uuid,p_environment text,p_workspace uuid,p_generation uuid,p_revision bigint default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare g jsonb;subject uuid;t timestamptz;
begin
 g:=service_private.lock_retained_boundary(p_owner,p_environment,p_workspace,p_generation,p_revision);
 -- Resolve only the live mapping. A subject UUID or deleted owner's pseudonym
 -- must never select the clock/account used by an authenticated retrieval.
 select a.subject_id into subject from service_private.account_lifecycle a where a.environment=p_environment and a.user_id=p_owner and a.state='active';
 t:=case when subject is null then clock_timestamp() else service_private.lifecycle_now(p_environment,subject) end;
 return jsonb_build_object('version',1,'serverNow',service_private.format_utc(t))||g;
end $$;
create function service_private.retrieval_wire_roster(p_workspace uuid,p_version bigint) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('version',r.version,'roster',r.roster,'bodyHash',r.body_hash,'signature',encode(r.signature,'hex'),'signerType',r.signer_type,'signerDevice',r.signer_device)
 from public.device_roster r where r.workspace_id=p_workspace and r.version=p_version;
$$;

-- The lifecycle lock precedes every build/challenge/capability row lock. A first
-- nonlocking lookup supplies scope only; the row is reread after the shared fence.
create function service_private.retrieval_context(p_owner uuid,p_session uuid,p_environment text,p_build uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b service_private.retrieval_builds;g jsonb;t timestamptz;d public.devices;
begin
 if not service_private.retrieval_session(p_owner,p_session) then return service_private.retrieval_result('authentication_failed');end if;
 select x.* into b from service_private.retrieval_builds x where x.id=p_build and x.owner_id=p_owner and x.session_id=p_session and x.environment=p_environment;
 if b.id is null then return service_private.retrieval_result('retrieval_proof_invalid');end if;
 g:=service_private.retrieval_lock(p_owner,p_environment,b.workspace_id,b.generation,(b.boundary->>'lifecycleVersion')::bigint);
 if not service_private.retrieval_session(p_owner,p_session) then return service_private.retrieval_result('authentication_failed',null,(g->>'serverNow')::timestamptz);end if;
 if g->'ok' is distinct from 'true'::jsonb then return g;end if;
 t:=(g->>'serverNow')::timestamptz;
 if t is null then return service_private.retrieval_result('retrieval_configuration');end if;
 if g->'boundary' is distinct from b.boundary then return service_private.retrieval_result('retrieval_boundary_changed',null,t);end if;
 if b.proof_kind='device' then
  select x.* into d from public.devices x where x.id=b.device_id and x.user_id=p_owner;
  if d.id is null or d.status<>'authorized' or d.auth_session_id is distinct from p_session or d.sign_pub is distinct from b.trusted_pub then
   return service_private.retrieval_result('retrieval_proof_invalid',null,t);
  end if;
 end if;
 if t>=b.expires_at then return service_private.retrieval_result('retrieval_capability_expired',null,t);end if;
 return g;
end $$;

-- 3. Initial control-source freeze. Unsupported history remains untouched.
create function public.service_retrieval_prepare(p_owner uuid,p_session uuid,p_environment text,p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare g jsonb;v jsonb;cp jsonb;env jsonb;pub bytea;d public.devices;b uuid;t timestamptz;kind text;dev uuid;w uuid;gen uuid;keys text[];
begin
 if not service_private.retrieval_session(p_owner,p_session) then return service_private.retrieval_result('authentication_failed');end if;
 if service_private.retrieval_keys(p_request,array['version','workspaceId','generation','proof']) is distinct from true or p_request->'version' is distinct from '1'::jsonb
  or service_private.retrieval_uuid(p_request->'workspaceId') is distinct from true or service_private.retrieval_uuid(p_request->'generation') is distinct from true then return service_private.retrieval_result('invalid_request');end if;
 kind:=p_request->'proof'->>'kind';
 if kind='recovery' then
  if service_private.retrieval_keys(p_request->'proof',array['kind']) is distinct from true then return service_private.retrieval_result('invalid_request');end if;
 elsif kind='device' then
  if service_private.retrieval_keys(p_request->'proof',array['kind','deviceId']) is distinct from true or service_private.retrieval_uuid(p_request->'proof'->'deviceId') is distinct from true then return service_private.retrieval_result('invalid_request');end if;
  dev:=(p_request->'proof'->>'deviceId')::uuid;
 else return service_private.retrieval_result('invalid_request');end if;
 w:=(p_request->>'workspaceId')::uuid;gen:=(p_request->>'generation')::uuid;
 g:=service_private.retrieval_lock(p_owner,p_environment,w,gen,null);
 if not service_private.retrieval_session(p_owner,p_session) then return service_private.retrieval_result('authentication_failed',null,(g->>'serverNow')::timestamptz);end if;
 if g->'ok' is distinct from 'true'::jsonb then return g;end if;
 v:=g->'boundary';t:=(g->>'serverNow')::timestamptz;
 if t is null or not(v?'initializationCompleted') or not(v?'initialization') then return service_private.retrieval_result('retrieval_configuration');end if;
 if v->'minRetainedSeq' is distinct from '0'::jsonb or v->'keyEpoch' is distinct from '1'::jsonb or v->'checkpointVersion' is distinct from '1'::jsonb
  or service_private.retrieval_integer(v->'headSeq') is distinct from true or service_private.retrieval_integer(v->'rosterVersion',1) is distinct from true then return service_private.retrieval_result('retrieval_data_unavailable','unsupported_profile',t);end if;
 if exists(select 1 from public.ops x where x.workspace_id=w and (x.seq<1 or x.seq>(v->>'headSeq')::bigint))
  or exists(select 1 from public.op_receipts x where x.workspace_id=w and (x.seq<1 or x.seq>(v->>'headSeq')::bigint)) then
  return service_private.retrieval_result('retrieval_data_unavailable','integrity_failure',t);
 end if;
 if v->'initialization'<>'null'::jsonb then
  if service_private.retrieval_keys(v->'initialization',array['requestId','creatorDeviceId','finalOpId','finalPayloadHash','finalSeq']) is distinct from true
   or service_private.retrieval_uuid(v->'initialization'->'requestId') is distinct from true or service_private.retrieval_uuid(v->'initialization'->'creatorDeviceId') is distinct from true
   or service_private.retrieval_uuid(v->'initialization'->'finalOpId') is distinct from true or service_private.retrieval_hex(v->'initialization'->'finalPayloadHash',64) is distinct from true
   or service_private.retrieval_integer(v->'initialization'->'finalSeq',1) is distinct from true
   or v->'initializationCompleted' not in ('true'::jsonb,'false'::jsonb) then return service_private.retrieval_result('retrieval_data_unavailable','integrity_failure',t);end if;
  if (v->'initialization'->>'finalSeq')::bigint>(v->>'headSeq')::bigint
   or v->'initializationCompleted'='false'::jsonb and v->'initialization'->'finalSeq' is distinct from v->'headSeq'
   or not exists(select 1 from public.ops o join public.op_receipts r on r.workspace_id=o.workspace_id and r.op_id=o.op_id
    where o.workspace_id=w and o.seq=(v->'initialization'->>'finalSeq')::bigint and o.op_id=(v->'initialization'->>'finalOpId')::uuid
     and o.device_id=(v->'initialization'->>'creatorDeviceId')::uuid and o.payload_hash=v->'initialization'->>'finalPayloadHash' and r.seq=o.seq and r.payload_hash=o.payload_hash)
   then return service_private.retrieval_result('retrieval_data_unavailable','incomplete_history',t);end if;
 elsif v->'initializationCompleted' is distinct from 'null'::jsonb then return service_private.retrieval_result('retrieval_data_unavailable','incomplete_history',t);end if;
 delete from service_private.retrieval_builds where id in(select x.id from service_private.retrieval_builds x
  where x.owner_id=p_owner and x.session_id=p_session and x.workspace_id=w and x.generation=gen and x.expires_at<=t order by x.id limit 200);
 if (select count(*) from service_private.retrieval_builds x where x.owner_id=p_owner and x.session_id=p_session and x.expires_at>t)>=8 then return service_private.retrieval_result('retrieval_rate_limited',null,t);end if;
 select jsonb_build_object('cpVersion',c.cp_version,'body',c.body,'recSig',encode(c.rec_sig,'hex'),'devSig',encode(c.dev_sig,'hex')) into cp
  from public.recovery_checkpoints c where c.workspace_id=w and c.cp_version=1;
 select jsonb_build_object('epoch',e.epoch,'recipient',e.recipient,'ciphertext',encode(e.ciphertext,'hex'),'signature',encode(e.signature,'hex'),'rosterVersion',e.roster_version,'signerDevice',e.signer_device) into env
  from public.key_envelopes e where e.workspace_id=w and e.epoch=1 and e.recipient='recovery';
 if cp is null or env is null or exists(select 1 from public.op_receipts r left join public.ops o on o.workspace_id=r.workspace_id and o.op_id=r.op_id and o.seq=r.seq and o.payload_hash=r.payload_hash
  where r.workspace_id=w and r.seq<=(v->>'headSeq')::bigint and o.op_id is null) then return service_private.retrieval_result('retrieval_data_unavailable','incomplete_history',t);end if;
 if octet_length(public._canonical_json(cp->'body'))>4096 or length(env->>'ciphertext')>131072
  or exists(select 1 from public.op_blobs x where x.workspace_id=w)
  or exists(select 1 from public.recovery_checkpoints x where x.workspace_id=w and x.cp_version<>1)
  or exists(select 1 from public.key_envelopes x where x.workspace_id=w and x.epoch<>1) then return service_private.retrieval_result('retrieval_data_unavailable','unsupported_profile',t);end if;
 if service_private.retrieval_hex(cp->'body'->'recoverySignPub',64) is distinct from true then return service_private.retrieval_result('retrieval_data_unavailable','integrity_failure',t);end if;
 if kind='device' then
  select x.* into d from public.devices x where x.id=dev and x.user_id=p_owner;
  if d.id is null or d.status<>'authorized' or d.auth_session_id is distinct from p_session
   or not exists(select 1 from public.device_roster r,jsonb_array_elements(case when jsonb_typeof(r.roster->'devices')='array' then r.roster->'devices' else '[]'::jsonb end) x where r.workspace_id=w and r.version=(v->>'rosterVersion')::integer and x->>'id'=dev::text and x->>'signPub'=encode(d.sign_pub,'hex')) then return service_private.retrieval_result('retrieval_proof_invalid',null,t);end if;
  pub:=d.sign_pub;
 else
  pub:=decode(cp->'body'->>'recoverySignPub','hex');
 end if;
 insert into service_private.retrieval_builds(owner_id,session_id,environment,workspace_id,generation,boundary,proof_kind,device_id,trusted_pub,checkpoint,recovery_envelope,expires_at)
 values(p_owner,p_session,p_environment,w,gen,v,kind,dev,pub,cp,env,least(t+interval '300 seconds',(v->>'retrieveUntil')::timestamptz)) returning id into b;
 return jsonb_build_object('ok',true,'version',1,'serverNow',service_private.retrieval_time(t),'buildId',b,'boundary',v,'checkpoint',cp,'recoveryEnvelope',env,'proofPublicKey',encode(pub,'hex'));
end $$;

-- 4. Complete source traversal, bounded before JSON aggregation. Plaintext payload
-- hashes are receipt identities; they are deliberately not ciphertext SHA-256.
create function public.service_retrieval_source(p_owner uuid,p_session uuid,p_environment text,p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b service_private.retrieval_builds;g jsonb;r record;rows jsonb:='[]';item jsonb;result jsonb;cursor bigint;lim bigint;section text;last bigint;t timestamptz;actual_hash text;
begin
 if service_private.retrieval_keys(p_request,array['buildId','section','after']) is distinct from true or service_private.retrieval_uuid(p_request->'buildId') is distinct from true
  or service_private.retrieval_integer(p_request->'after') is distinct from true or coalesce(p_request->>'section','') not in ('rosters','metadata') then return service_private.retrieval_result('invalid_request');end if;
 g:=service_private.retrieval_context(p_owner,p_session,p_environment,(p_request->>'buildId')::uuid);if g->'ok' is distinct from 'true'::jsonb then return g;end if;
 t:=(g->>'serverNow')::timestamptz;
 select x.* into b from service_private.retrieval_builds x where x.id=(p_request->>'buildId')::uuid for update;
 cursor:=(p_request->>'after')::bigint;section:=p_request->>'section';last:=cursor;
 lim:=case when section='rosters' then (b.boundary->>'rosterVersion')::bigint else (b.boundary->>'headSeq')::bigint end;
 if cursor>(case when section='rosters' then b.roster_after else b.metadata_after end) or cursor>lim or b.manifest is not null then return service_private.retrieval_result('invalid_request',null,t);end if;
 if section='rosters' then
  for r in select x.* from public.device_roster x where x.workspace_id=b.workspace_id and x.version>cursor and x.version<=lim order by x.version limit 64 loop
   if r.version<>last+1 then return service_private.retrieval_result('retrieval_data_unavailable','incomplete_history',t);end if;
   if octet_length(public._canonical_json(r.roster))>65536 or r.roster->'epoch' is distinct from '1'::jsonb then return service_private.retrieval_result('retrieval_data_unavailable','unsupported_profile',t);end if;
   begin actual_hash:=encode(public._sha256(convert_to(public._canonical_json(r.roster),'UTF8')),'hex');
   exception when insufficient_privilege or undefined_function or invalid_schema_name then return service_private.retrieval_result('retrieval_configuration',null,t);end;
   if r.roster->'version' is distinct from to_jsonb(r.version) or r.body_hash is distinct from actual_hash then return service_private.retrieval_result('retrieval_data_unavailable','integrity_failure',t);end if;
   item:=service_private.retrieval_wire_roster(b.workspace_id,r.version);
   exit when octet_length((rows||jsonb_build_array(item))::text)>4190208;
   rows:=rows||jsonb_build_array(item);last:=r.version;
  end loop;
 else
  for r in select o.*,x.seq as receipt_seq,x.payload_hash as receipt_hash from public.ops o left join public.op_receipts x on x.workspace_id=o.workspace_id and x.op_id=o.op_id
   where o.workspace_id=b.workspace_id and o.seq>cursor and o.seq<=lim order by o.seq limit 200 loop
   if r.seq<>last+1 or r.receipt_seq is distinct from r.seq or r.receipt_hash is distinct from r.payload_hash then return service_private.retrieval_result('retrieval_data_unavailable','incomplete_history',t);end if;
   if r.format_version<>1 or r.key_epoch<>1 or cardinality(r.blob_refs)<>0 or octet_length(r.ciphertext) not between 1 and 1048576 then return service_private.retrieval_result('retrieval_data_unavailable','unsupported_profile',t);end if;
   if r.payload_hash!~'^[0-9a-f]{64}$' then return service_private.retrieval_result('retrieval_data_unavailable','integrity_failure',t);end if;
   if b.boundary->'initialization'<>'null'::jsonb and r.seq<=(b.boundary->'initialization'->>'finalSeq')::bigint
    and r.device_id::text is distinct from b.boundary->'initialization'->>'creatorDeviceId' then return service_private.retrieval_result('retrieval_data_unavailable','integrity_failure',t);end if;
   rows:=rows||jsonb_build_array(jsonb_build_object('seq',r.seq,'opId',r.op_id,'payloadHash',r.payload_hash,'formatVersion',r.format_version,'keyEpoch',r.key_epoch,'deviceId',r.device_id));last:=r.seq;
  end loop;
 end if;
 if last=cursor and cursor<lim then return service_private.retrieval_result('retrieval_data_unavailable','incomplete_history',t);end if;
 if section='rosters' then update service_private.retrieval_builds set roster_after=greatest(roster_after,last) where id=b.id;
 else update service_private.retrieval_builds set metadata_after=greatest(metadata_after,last) where id=b.id;end if;
 result:=jsonb_build_object('ok',true,'version',1,'serverNow',service_private.retrieval_time(t),'after',cursor,'next',last,'done',last=lim,'rows',rows);
 if octet_length(result::text)>4194304 then return service_private.retrieval_result('retrieval_data_unavailable','unsupported_profile',t);end if;
 return result;
end $$;

-- Greedy exact-wire paging also budgets the complete challenge wrapper.
create function service_private.retrieval_roster_page(p_build uuid,p_after bigint,p_base jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare b service_private.retrieval_builds;r record;rows jsonb:='[]';item jsonb;result jsonb;last bigint:=p_after;t timestamptz:=(p_base->>'serverNow')::timestamptz;
begin
 select x.* into b from service_private.retrieval_builds x where x.id=p_build;
 if p_after>(b.boundary->>'rosterVersion')::bigint then return service_private.retrieval_result('invalid_request',null,t);end if;
 for r in select version from public.device_roster where workspace_id=b.workspace_id and version>p_after and version<=(b.boundary->>'rosterVersion')::bigint order by version limit 64 loop
  if r.version<>last+1 then return service_private.retrieval_result('retrieval_data_unavailable','incomplete_history',t);end if;
  item:=service_private.retrieval_wire_roster(b.workspace_id,r.version);
  result:=p_base||jsonb_build_object('rosterPage',jsonb_build_object('afterRosterVersion',p_after,'nextAfterRosterVersion',r.version,'rosters',rows||jsonb_build_array(item),'done',r.version=(b.boundary->>'rosterVersion')::bigint));
  exit when octet_length(result::text)>4194304;
  rows:=rows||jsonb_build_array(item);last:=r.version;
 end loop;
 if last=p_after and p_after<(b.boundary->>'rosterVersion')::bigint then return service_private.retrieval_result('retrieval_data_unavailable','unsupported_profile',t);end if;
 return p_base||jsonb_build_object('rosterPage',jsonb_build_object('afterRosterVersion',p_after,'nextAfterRosterVersion',last,'rosters',rows,'done',last=(b.boundary->>'rosterVersion')::bigint));
end $$;

-- 5. Trusted builder final CAS. Only its streamed head digest is accepted as input;
-- all remaining public manifest fields are independently derived from stored rows.
create function public.service_retrieval_finalize(p_owner uuid,p_session uuid,p_environment text,p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b service_private.retrieval_builds;g jsonb;m jsonb;expected jsonb;hash text;proof jsonb;nonce bytea;cid uuid;expires timestamptz;t timestamptz;project text;result jsonb;
begin
 if service_private.retrieval_keys(p_request,array['buildId','manifest']) is distinct from true or service_private.retrieval_uuid(p_request->'buildId') is distinct from true
  or jsonb_typeof(p_request->'manifest') is distinct from 'object' then return service_private.retrieval_result('invalid_request');end if;
 g:=service_private.retrieval_context(p_owner,p_session,p_environment,(p_request->>'buildId')::uuid);if g->'ok' is distinct from 'true'::jsonb then return g;end if;t:=(g->>'serverNow')::timestamptz;
 select x.* into b from service_private.retrieval_builds x where x.id=(p_request->>'buildId')::uuid for update;m:=p_request->'manifest';
 if b.manifest is not null or b.roster_after<>(b.boundary->>'rosterVersion')::bigint or b.metadata_after<>(b.boundary->>'headSeq')::bigint then return service_private.retrieval_result('retrieval_data_unavailable','incomplete_history',t);end if;
 select project_ref into project from service_private.policy where id=1;
 begin
 expected:=jsonb_build_object('version',1,'purpose','retained-copy','environment',p_environment,'projectRef',project,'workspaceId',b.workspace_id,'generation',b.generation,
  'lifecycleVersion',b.boundary->'lifecycleVersion','accessEndedAt',b.boundary->'accessEndedAt','retrieveUntil',b.boundary->'retrieveUntil','headSeq',b.boundary->'headSeq',
  'minRetainedSeq',0,'operationCount',b.boundary->'headSeq','keyEpoch',1,'checkpointVersion',1,'checkpointHash',encode(public._sha256(convert_to(public._canonical_json(b.checkpoint->'body'),'UTF8')),'hex'),
  'rosterVersion',b.boundary->'rosterVersion','rosterHash',(select body_hash from public.device_roster where workspace_id=b.workspace_id and version=b.roster_after),
  'recoveryKeyId',encode(public._sha256(decode(b.checkpoint->'body'->>'recoverySignPub','hex')),'hex'),'envelopeSetHash',encode(public._sha256(convert_to(public._canonical_json(jsonb_build_array(b.recovery_envelope)),'UTF8')),'hex'),
  'proofKind',b.proof_kind,'deviceId',b.device_id,'initialization',b.boundary->'initialization');
 hash:=encode(public._sha256(convert_to(public._canonical_json(m),'UTF8')),'hex');
 exception when insufficient_privilege or undefined_function or invalid_schema_name then return service_private.retrieval_result('retrieval_configuration',null,t);end;
 if m-'headHash' is distinct from expected or service_private.retrieval_hex(m->'headHash',64) is distinct from true then return service_private.retrieval_result('retrieval_data_unavailable','integrity_failure',t);end if;
 nonce:=service_private.retrieval_random();if nonce is null then return service_private.retrieval_result('retrieval_configuration',null,t);end if;
 cid:=gen_random_uuid();expires:=least(t+interval '300 seconds',(b.boundary->>'retrieveUntil')::timestamptz);
 proof:=jsonb_build_object('version',1,'purpose','retained-copy','environment',p_environment,'projectRef',project,'ownerId',p_owner,'authSessionId',p_session,'challengeId',cid,
  'nonce',encode(nonce,'hex'),'manifestHash',hash,'workspaceId',b.workspace_id,'generation',b.generation,'lifecycleVersion',m->'lifecycleVersion','headSeq',m->'headSeq',
  'headHash',m->'headHash','checkpointHash',m->'checkpointHash','rosterHash',m->'rosterHash','retrieveUntil',m->'retrieveUntil',
  'challengeExpiresAt',service_private.retrieval_time(expires),'proofKind',b.proof_kind,'deviceId',b.device_id);
 result:=service_private.retrieval_roster_page(b.id,0,jsonb_build_object('ok',true,'version',1,'serverNow',service_private.retrieval_time(t),'kind','challenge','manifest',m,'manifestHash',hash,'checkpoint',b.checkpoint,'recoveryEnvelope',b.recovery_envelope,'proofBody',proof));
 if result->'ok' is distinct from 'true'::jsonb then return result;end if;
 update service_private.retrieval_builds set manifest=m,manifest_hash=hash,expires_at=least(t+interval '1200 seconds',(b.boundary->>'retrieveUntil')::timestamptz) where id=b.id;
 insert into service_private.retrieval_challenges(id,build_id,proof_body,expires_at) values(cid,b.id,proof,expires);
 return result;
end $$;

-- 6. One challenge, one authorization; reusable capability with original expiry.
create function public.service_retrieval_continue(p_owner uuid,p_session uuid,p_environment text,p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c service_private.retrieval_challenges;b service_private.retrieval_builds;g jsonb;t timestamptz;
begin
 if service_private.retrieval_keys(p_request,array['version','challengeId','afterRosterVersion']) is distinct from true or p_request->'version' is distinct from '1'::jsonb
  or service_private.retrieval_uuid(p_request->'challengeId') is distinct from true or service_private.retrieval_integer(p_request->'afterRosterVersion') is distinct from true then return service_private.retrieval_result('invalid_request');end if;
 select x.* into c from service_private.retrieval_challenges x where x.id=(p_request->>'challengeId')::uuid;
 g:=service_private.retrieval_context(p_owner,p_session,p_environment,c.build_id);if g->'ok' is distinct from 'true'::jsonb then return g;end if;t:=(g->>'serverNow')::timestamptz;
 select x.* into c from service_private.retrieval_challenges x where x.id=(p_request->>'challengeId')::uuid for update;
 if c.id is null then return service_private.retrieval_result('retrieval_proof_invalid',null,t);end if;
 if c.consumed_at is not null then return service_private.retrieval_result('retrieval_proof_invalid',null,t);end if;
 if t>=c.expires_at then return service_private.retrieval_result('retrieval_capability_expired',null,t);end if;
 select x.* into b from service_private.retrieval_builds x where x.id=c.build_id;
 return service_private.retrieval_roster_page(b.id,(p_request->>'afterRosterVersion')::bigint,jsonb_build_object('ok',true,'version',1,'serverNow',service_private.retrieval_time(t),'kind','control','challengeId',c.id,'manifestHash',b.manifest_hash));
end $$;
create function public.service_retrieval_authorize(p_owner uuid,p_session uuid,p_environment text,p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c service_private.retrieval_challenges;b service_private.retrieval_builds;g jsonb;t timestamptz;token bytea;expires timestamptz;verified boolean;
begin
 if service_private.retrieval_keys(p_request,array['version','challengeId','signature']) is distinct from true or p_request->'version' is distinct from '1'::jsonb
  or service_private.retrieval_uuid(p_request->'challengeId') is distinct from true or service_private.retrieval_hex(p_request->'signature',128) is distinct from true then return service_private.retrieval_result('invalid_request');end if;
 select x.* into c from service_private.retrieval_challenges x where x.id=(p_request->>'challengeId')::uuid;
 g:=service_private.retrieval_context(p_owner,p_session,p_environment,c.build_id);if g->'ok' is distinct from 'true'::jsonb then return g;end if;t:=(g->>'serverNow')::timestamptz;
 select x.* into c from service_private.retrieval_challenges x where x.id=(p_request->>'challengeId')::uuid for update;
 if c.id is null then return service_private.retrieval_result('retrieval_proof_invalid',null,t);end if;
 if c.consumed_at is not null then return service_private.retrieval_result('retrieval_proof_invalid',null,t);end if;
 if t>=c.expires_at then return service_private.retrieval_result('retrieval_capability_expired',null,t);end if;
 select x.* into b from service_private.retrieval_builds x where x.id=c.build_id;
 begin
  verified:=public._ed25519_verify(b.trusted_pub,public._sha256(convert_to('goalloom/retrieval-proof/v1|'||public._canonical_json(c.proof_body),'UTF8')),decode(p_request->>'signature','hex'));
 exception when insufficient_privilege or undefined_function or invalid_schema_name then return service_private.retrieval_result('retrieval_configuration',null,t);end;
 if verified is distinct from true then return service_private.retrieval_result('retrieval_proof_invalid',null,t);end if;
 token:=service_private.retrieval_random();if token is null then return service_private.retrieval_result('retrieval_configuration',null,t);end if;
 expires:=least(t+interval '900 seconds',(b.boundary->>'retrieveUntil')::timestamptz);
 update service_private.retrieval_challenges set consumed_at=t where id=c.id;
 insert into service_private.retrieval_capabilities(token_hash,build_id,expires_at) values(public._sha256(token),b.id,expires);
 return jsonb_build_object('ok',true,'version',1,'serverNow',service_private.retrieval_time(t),'capability',encode(token,'hex'),'manifestHash',b.manifest_hash,'expiresAt',service_private.retrieval_time(expires));
end $$;
create function public.service_retrieval_read(p_owner uuid,p_session uuid,p_environment text,p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c service_private.retrieval_capabilities;b service_private.retrieval_builds;g jsonb;t timestamptz;r record;rows jsonb:='[]';item jsonb;result jsonb;cursor bigint;last bigint;head bigint;digest bytea;
begin
 if service_private.retrieval_keys(p_request,array['version','capability','afterSeq']) is distinct from true or p_request->'version' is distinct from '1'::jsonb
  or service_private.retrieval_hex(p_request->'capability',64) is distinct from true or service_private.retrieval_integer(p_request->'afterSeq') is distinct from true then return service_private.retrieval_result('invalid_request');end if;
 digest:=public._sha256(decode(p_request->>'capability','hex'));select x.* into c from service_private.retrieval_capabilities x where x.token_hash=digest;
 g:=service_private.retrieval_context(p_owner,p_session,p_environment,c.build_id);if g->'ok' is distinct from 'true'::jsonb then return g;end if;t:=(g->>'serverNow')::timestamptz;
 select x.* into c from service_private.retrieval_capabilities x where x.token_hash=digest for share;
 if c.token_hash is null or t>=c.expires_at then return service_private.retrieval_result('retrieval_capability_expired',null,t);end if;
 select x.* into b from service_private.retrieval_builds x where x.id=c.build_id;cursor:=(p_request->>'afterSeq')::bigint;last:=cursor;head:=(b.boundary->>'headSeq')::bigint;
 if cursor>head then return service_private.retrieval_result('invalid_request',null,t);end if;
 result:=jsonb_build_object('ok',true,'version',1,'serverNow',service_private.retrieval_time(t),'manifestHash',b.manifest_hash,'afterSeq',cursor);
 for r in select o.*,x.seq as receipt_seq,x.payload_hash as receipt_hash from public.ops o left join public.op_receipts x on x.workspace_id=o.workspace_id and x.op_id=o.op_id
  where o.workspace_id=b.workspace_id and o.seq>cursor and o.seq<=head order by o.seq limit 200 loop
  if r.seq<>last+1 or r.receipt_seq is distinct from r.seq or r.receipt_hash is distinct from r.payload_hash then return service_private.retrieval_result('retrieval_data_unavailable','incomplete_history',t);end if;
  if r.key_epoch<>1 or r.format_version<>1 or cardinality(r.blob_refs)<>0 or octet_length(r.ciphertext) not between 1 and 1048576 then return service_private.retrieval_result('retrieval_data_unavailable','unsupported_profile',t);end if;
  if b.boundary->'initialization'<>'null'::jsonb and r.seq<=(b.boundary->'initialization'->>'finalSeq')::bigint
   and r.device_id::text is distinct from b.boundary->'initialization'->>'creatorDeviceId' then return service_private.retrieval_result('retrieval_data_unavailable','integrity_failure',t);end if;
  item:=jsonb_build_object('seq',r.seq,'opId',r.op_id,'payloadHash',r.payload_hash,'formatVersion',r.format_version,'keyEpoch',r.key_epoch,'ciphertext',encode(r.ciphertext,'hex'));
  exit when octet_length((result||jsonb_build_object('operations',rows||jsonb_build_array(item),'nextAfterSeq',r.seq,'done',r.seq=head))::text)>4194304;
  rows:=rows||jsonb_build_array(item);last:=r.seq;
 end loop;
 if last=cursor and cursor<head then return service_private.retrieval_result('retrieval_data_unavailable','incomplete_history',t);end if;
 return result||jsonb_build_object('operations',rows,'nextAfterSeq',last,'done',last=head);
end $$;

-- 7. Bounded lifecycle-worker hook; the caller must first close the lifecycle fence.
create function service_private.cleanup_retrieval(p_workspace uuid,p_generation uuid,p_limit integer default 200) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare removed bigint;remaining bigint;challenges bigint;capabilities bigint;
begin
 if p_workspace is null or p_generation is null or p_limit is null or p_limit not between 1 and 200 then raise exception 'invalid_request';end if;
 select count(*) into challenges from service_private.retrieval_challenges c join service_private.retrieval_builds b on b.id=c.build_id where b.id in(select x.id from service_private.retrieval_builds x where x.workspace_id=p_workspace and x.generation=p_generation order by x.id limit p_limit);
 select count(*) into capabilities from service_private.retrieval_capabilities c join service_private.retrieval_builds b on b.id=c.build_id where b.id in(select x.id from service_private.retrieval_builds x where x.workspace_id=p_workspace and x.generation=p_generation order by x.id limit p_limit);
 delete from service_private.retrieval_builds where id in(select x.id from service_private.retrieval_builds x where x.workspace_id=p_workspace and x.generation=p_generation order by x.id limit p_limit);get diagnostics removed=row_count;
 select count(*) into remaining from service_private.retrieval_builds where workspace_id=p_workspace and generation=p_generation;
 return jsonb_build_object('builds',removed,'challenges',challenges,'capabilities',capabilities,'remaining',remaining);
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='service_private' and (p.proname like 'retrieval_%' or p.proname='cleanup_retrieval') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.name);
 end loop;
 for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('service_retrieval_prepare','service_retrieval_source','service_retrieval_finalize','service_retrieval_continue','service_retrieval_authorize','service_retrieval_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.name);
  execute format('grant execute on function %s to service_role',f.name);
 end loop;
end $$;
notify pgrst,'reload schema';
