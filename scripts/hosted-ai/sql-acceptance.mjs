/**
 * [INPUT]: Existing development database and private Management credential; synthetic UUIDs only.
 * [OUTPUT]: Rollback-only real PostgreSQL admission, settlement, privacy, replay and protection evidence.
 * [POS]: Hosted SQL acceptance. No provider requests, permanent fixtures or budget changes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { mkdir,writeFile,readFile } from 'node:fs/promises'
import { actionId } from './content-minimization/identity.mjs'
import { client } from './client.mjs'
import { hostedSchemaMatches } from './schema-state.mjs'
const db=await client(),user=randomUUID(),other=randomUUID(),action=actionId(),unknown=actionId()
const installed=await hostedSchemaMatches(db)
const priorPrivacy=await hostedSchemaMatches(db,true,false), priorDecision=await hostedSchemaMatches(db,true,true,false)
const migration=installed?'':(priorPrivacy||priorDecision?'':await readFile('supabase/migrations/0011_hosted_ai_content_minimization.sql','utf8'))+'\n'+(priorDecision?'':await readFile('supabase/migrations/0012_hosted_ai_decision_receipts.sql','utf8'))+'\n'+await readFile('supabase/migrations/0013_hosted_ai_assistance_revision.sql','utf8')
const old=actionId(Date.now()-91*86400000)
const sql=`begin; set local lock_timeout='5s'; set local statement_timeout='30s';
-- Stage the forward migration only inside this rollback transaction. No service state survives.
select 1 from public.ai_budget where id='integration-shared' for update;
update public.ai_budget set policy='disabled' where id='integration-shared';
update public.ai_actions set status='unknown' where status='running';
${migration}
update public.ai_budget set policy='authenticated',limit_micro=10000000,spent_micro=0,blocked=false where id='integration-shared';
insert into auth.users(id,email) values('${user}','${user}@goalloom.test'),('${other}','${other}@goalloom.test');
do $acceptance$
declare r jsonb; before bigint; after bigint; v boolean;
begin
select spent_micro into before from public.ai_budget where id='integration-shared' for update;
if has_function_privilege('authenticated','public.ai_admit(uuid,uuid,text,text,text,text,bigint)','EXECUTE') then raise exception 'Authenticated can call admission directly';end if;
if has_table_privilege('authenticated','public.ai_actions','SELECT') then raise exception 'Authenticated can read cost ledger';end if;
if exists(select 1 from pg_class where oid in ('public.ai_actions'::regclass,'public.ai_budget'::regclass,'public.ai_protection'::regclass,'public.ai_limit_events'::regclass) and not relrowsecurity) then raise exception 'RLS disabled';end if;
r:=public.ai_admit('${user}','${action}','evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if (r->>'existing')::boolean is distinct from false then raise exception 'First admission failed';end if;
r:=public.ai_admit('${user}','${action}','evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if (r->>'existing')::boolean is distinct from true then raise exception 'Duplicate admission called provider again';end if;
select spent_micro into after from public.ai_budget where id='integration-shared';
if after<>before+500000 then raise exception 'Reservation duplicated';end if;
if public.ai_receipt('${other}','${action}') is not null then raise exception 'Cross-account receipt';end if;
r:=public.ai_settle('${user}','${action}','ready',123,true,'gen-dec-1792700000000-acceptance1',100,10,null);
perform public.ai_settle('${user}','${action}','ready',123,true,'gen-dec-1792700000000-acceptance1',100,10,null);
select spent_micro into after from public.ai_budget where id='integration-shared';
if after<>before+123 then raise exception 'Settlement duplicated';end if;
r:=public.ai_receipt('${user}','${action}');
if r->>'status'<>'ready' or r ? 'result_cipher' or r ? 'result_expires_at' then raise exception 'Receipt leaked content';end if;
if exists(select 1 from information_schema.columns where table_schema='public' and table_name='ai_actions' and column_name in ('result_cipher','result_expires_at')) then raise exception 'Result columns retained';end if;
if to_regprocedure('public.ai_settle(uuid,uuid,text,bigint,boolean,text,bigint,bigint,text,text)') is not null then raise exception 'Content settlement overload retained';end if;
r:=public.ai_admit('${other}','${actionId()}','assistance','development','deepseek/deepseek-v4.1-flash','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'permission_denied' then raise exception 'Old assistance model admitted';end if;
r:=public.ai_admit('${other}','${actionId()}','draft','development','deepseek/deepseek-v4.1-flash-1017','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'permission_denied' then raise exception 'Assistance revision crossed capability';end if;
r:=public.ai_admit('${other}','${actionId()}','assistance','development','deepseek/deepseek-v4.1-flash-1017','openrouter-2026-10-23-v1',500000);
if (r->>'existing')::boolean is distinct from false then raise exception 'Assistance revision rejected';end if;
perform public.ai_settle('${other}',(r->'receipt'->>'action_id')::uuid,'failed',0,true,null,0,0,'provider_failed');
r:=public.ai_admit('${user}','${old}','evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'action_expired' then raise exception 'Old action replayed';end if;
r:=public.ai_admit('${user}','${unknown}','evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
update public.ai_actions set created_at=now()-interval '11 minutes' where user_id='${user}' and action_id='${unknown}';
r:=public.ai_receipt('${user}','${unknown}');
if r->>'status'<>'failed' or (r->>'charged_micro')::bigint<>500000 or (r->>'confirmed')::boolean then raise exception 'Unknown cost became zero or unbounded';end if;
perform public.ai_settle('${user}','${unknown}','failed',77,true,'gen-1792700000000-acceptance2',100,0,null);
select spent_micro into after from public.ai_budget where id='integration-shared';
if after<>before+200 then raise exception 'Late receipt added instead of replacing cost';end if;
insert into public.ai_protection(user_id,blocked,reason) values('${other}',true,'manual_review');
r:=public.ai_admit('${other}',(('${actionId()}')::uuid),'evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'account_protection' then raise exception 'Account protection bypass';end if;
update public.ai_protection set blocked=false,reason='released' where user_id='${other}';
r:=public.ai_admit('${user}',(('${actionId()}')::uuid),'evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',499999);
if r->>'error'<>'permission_denied' then raise exception 'Reservation amount changed';end if;
update public.ai_actions set charged_micro=5000000 where user_id='${user}' and action_id='${action}';
r:=public.ai_admit('${user}',(('${actionId()}')::uuid),'evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'account_budget' then raise exception 'Account daily cap bypass';end if;
update public.ai_actions set charged_micro=123 where user_id='${user}' and action_id='${action}';
insert into public.ai_actions(user_id,action_id,capability,environment,eligibility,status,model,rate_version,reserved_micro,charged_micro,confirmed)
select '${other}',gen_random_uuid(),'evaluate','development','authenticated','running','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000,0,false from generate_series(1,16);
r:=public.ai_admit('${user}',(('${actionId()}')::uuid),'evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'platform_concurrency' then raise exception 'Platform concurrency bypass';end if;
delete from public.ai_actions where user_id='${other}';
insert into public.ai_actions(user_id,action_id,capability,environment,eligibility,status,model,rate_version,reserved_micro,charged_micro,confirmed)
select '${other}',gen_random_uuid(),'evaluate','development','authenticated','running','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000,0,false from generate_series(1,4);
r:=public.ai_admit('${other}',(('${actionId()}')::uuid),'evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'account_concurrency' then raise exception 'Account concurrency bypass';end if;
delete from public.ai_actions where user_id='${other}';
insert into public.ai_actions(user_id,action_id,capability,environment,eligibility,status,model,rate_version,reserved_micro,charged_micro,confirmed)
select '${other}',gen_random_uuid(),'evaluate','development','authenticated','failed','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000,0,true from generate_series(1,120);
r:=public.ai_admit('${other}',(('${actionId()}')::uuid),'evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'account_rate' then raise exception 'Account rate bypass';end if;
insert into public.ai_actions(user_id,action_id,capability,environment,eligibility,status,model,rate_version,reserved_micro,charged_micro,confirmed)
select '${other}',gen_random_uuid(),'evaluate','development','authenticated','failed','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000,0,true from generate_series(1,480);
r:=public.ai_admit('${user}',(('${actionId()}')::uuid),'evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'platform_rate' then raise exception 'Platform rate bypass';end if;
delete from public.ai_actions where user_id='${other}';
r:=public.ai_admit('${other}',(('${actionId()}')::uuid),'evaluate','production','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'permission_denied' then raise exception 'Environment crossed';end if;
update public.ai_budget set policy='trial_or_paid' where id='integration-shared';
if public.ai_eligibility('development') then raise exception 'Future paid policy failed open';end if;
r:=public.ai_admit('${other}',(('${actionId()}')::uuid),'evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'permission_denied' then raise exception 'Unknown eligibility admitted';end if;
update public.ai_budget set policy='authenticated',limit_micro=spent_micro where id='integration-shared';
r:=public.ai_admit('${other}',(('${actionId()}')::uuid),'evaluate','development','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000);
if r->>'error'<>'platform_budget' then raise exception 'Shared budget exceeded';end if;
end $acceptance$;
rollback;`
const report={ok:false,scope:'Real development PostgreSQL, rollback-only synthetic users; no model calls, no persistent budget or user changes. Pending migration staged inside rollback; concurrent-transaction acceptance is separate.',checks:['RLS and direct-role denial','atomic reservation and action deduplication','cross-account receipt denial','idempotent confirmed settlement','forward migration removes content columns and overload','bounded unknown outcome and late cost replacement','manual protection recovery','environment isolation','future policy fails closed','shared budget hard stop','expired UUIDv7 cannot replay after receipt cleanup']}
report.schemaMode=installed?'installed-privacy-rpc':'rollback-staged-migration'
if(installed)report.scope='Real development PostgreSQL installed privacy RPCs; rollback-only synthetic users and boundary states. No provider calls or persistent schema, budget, user or admission changes. Concurrent transactions are separate.'
report.checks.push('assistance-only revision and incorrect capability/model denial','fixed reservation amount','account daily budget cap','platform and account concurrency caps','account and platform minute-rate caps')
try {await db.query(sql,false);report.ok=true;report.realProviderCalls=0;report.realCostUsd=0}
catch(error){report.error='sql_acceptance_failed';report.transportStatus=error.message.match(/HTTP \d{3}/)?.[0]??null;report.networkCode=error.cause?.code??null;process.exitCode=1}
await mkdir('output/tests/hosted-ai',{recursive:true})
await writeFile('output/tests/hosted-ai/sql-acceptance.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
