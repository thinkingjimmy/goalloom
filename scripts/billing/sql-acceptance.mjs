/**
 * [INPUT]: Scoped development SQL access, reviewed migration and synthetic account/provider facts.
 * [OUTPUT]: Rollback-only real PostgreSQL evidence; no provider connectivity claim.
 * [POS]: D0 database integration acceptance. Failure cases are frozen in docs/features/billing.md.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { billingMigrations } from './schema.mjs'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { client } from '../hosted-ai/client.mjs'
const db = await client(), user = randomUUID(), other = randomUUID(), request = randomUUID()
const migrations=await billingMigrations(db),present=migrations.every(entry=>entry.installed)
const sql = `begin; set local lock_timeout='5s'; set local statement_timeout='30s';
${migrations.filter(entry=>!entry.installed).map(entry=>entry.sql).join('\n')}
insert into auth.users(id,email) values('${user}','${user}@goalloom.test'),('${other}','${other}@goalloom.test');
do $acceptance$
declare r jsonb; k uuid; k2 uuid; t timestamptz:='2026-10-23T00:00:00Z'; tx jsonb; subs jsonb;
begin
  if has_function_privilege('authenticated','public.billing_claim_trial(text,uuid,uuid)','EXECUTE') then raise exception 'trial RPC exposed'; end if;
  if has_table_privilege('authenticated','public.billing_transactions','SELECT') then raise exception 'private ledger exposed'; end if;
  if exists(select 1 from pg_class where relname like 'billing_%' and relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity) then raise exception 'RLS disabled'; end if;
  r:=billing_status('development','${user}');
  if r->>'error'<>'billing_configuration' or (r->>'eligible')::boolean then raise exception 'missing config authorized'; end if;
  update billing_policy set enabled=true where environment='development';
  insert into billing_sources(environment,source,account_id,rc_project,rc_app,monthly_price,annual_price,enabled)
    values('development','stripe','acct_1QvwdlITpGuR8ZMB','projd720c733','appFixture','price_month','price_year',true)
    on conflict(environment,source) do update set enabled=true,monthly_price='price_month',annual_price='price_year';
  r:=billing_status('development','${user}');
  if r->>'status'<>'none' or not (r->>'trialEligible')::boolean then raise exception 'unclaimed state wrong'; end if;
  insert into billing_accounts(environment,user_id,test_now) values('development','${user}',t),('development','${other}',t);
  r:=billing_claim_trial('development','${user}','${request}');
  if r->>'status'<>'trialing' or (r->>'trialEndsAt')::timestamptz<>t+interval '192 hours' then raise exception 'trial boundary wrong'; end if;
  r:=billing_claim_trial('development','${user}','${randomUUID()}');
  if r->>'trialReceipt'<>'${request}' then raise exception 'second device reissued trial'; end if;
  if exists(select 1 from billing_customers where user_id='${user}') then raise exception 'trial created payment customer'; end if;
  update billing_accounts set test_now=t+interval '192 hours' where user_id='${user}';
  r:=billing_status('development','${user}');
  if r->>'status'<>'expired' or (r->>'eligible')::boolean then raise exception 'exact end admitted'; end if;
  update billing_accounts set test_now=t+interval '24 hours' where user_id='${user}';
  r:=billing_lock('development','${user}'); k:=(r->>'lease')::uuid;
  if k is null then raise exception 'lease missing'; end if;
  r:=billing_lock('development','${user}');
  if r->>'error'<>'billing_pending' then raise exception 'overlapping worker admitted'; end if;
  perform billing_bind_customer('development','${user}',k,'cus_Fixture');
  r:=billing_lock('development','${other}'); k2:=(r->>'lease')::uuid;
  begin
    perform billing_bind_customer('development','${other}',k2,'cus_Fixture');
    raise exception 'cross-account binding accepted';
  exception when unique_violation then null; end;
  perform billing_bind_customer('development','${other}',k2,'cus_Other');
  subs:=jsonb_build_array(jsonb_build_object('subscription_id','sub_Fixture','customer_id','cus_Fixture','status','active','price_id','price_month','period_start',t,'period_end',t+interval '30 days','cancel_at_period_end',true));
  tx:=jsonb_build_array(jsonb_build_object('invoice_id','in_Paid','subscription_id','sub_Fixture','price_id','price_month','starts_at',t,'ends_at',t+interval '30 days','paid_at',t,'amount_cents',899,'refunded_cents',0,'disposition','paid','rc_verified',true,'financial_at',t));
  r:=billing_commit('development','${user}',k,subs,tx,'[]');
  if r->>'status'<>'active' or not(r->>'trialConsumed')::boolean then raise exception 'paid did not replace trial'; end if;
  if (billing_status('production','${user}')->>'eligible')::boolean then raise exception 'test crossed live'; end if;
  if (billing_status('development','${other}')->>'eligible')::boolean then raise exception 'account crossed'; end if;
  tx:=jsonb_set(tx,'{0,disposition}','"refunded"');tx:=jsonb_set(tx,'{0,refunded_cents}','899');
  r:=billing_commit('development','${user}',k,subs,tx,'[]');
  if r->>'status'<>'revoked' or (r->>'eligible')::boolean then raise exception 'refund resurrected trial'; end if;
  r:=billing_claim_trial('development','${user}','${randomUUID()}');
  if (r->>'trialEligible')::boolean or not(r->>'trialConsumed')::boolean then raise exception 'trial reset after refund'; end if;
  tx:=tx||jsonb_build_array(jsonb_build_object('invoice_id','in_Later','subscription_id','sub_Fixture','price_id','price_month','starts_at',t+interval '24 hours','ends_at',t+interval '31 days','paid_at',t+interval '24 hours','amount_cents',899,'refunded_cents',1,'disposition','paid','rc_verified',true,'financial_at',t+interval '24 hours'));
  r:=billing_commit('development','${user}',k,subs,tx,'[]');
  if r->>'status'<>'active' then raise exception 'old refund removed later period or partial refund shortened'; end if;
  update billing_accounts set test_now=t+interval '31 days' where user_id='${user}';
  r:=billing_commit('development','${user}',k,subs,tx,jsonb_build_array(jsonb_build_object('invoice_id','in_Failed','subscription_id','sub_Fixture','starts_at',t+interval '31 days')));
  if not(r->>'grace')::boolean or (r->>'effectiveEnd')::timestamptz<>t+interval '34 days' then raise exception 'grace anchor wrong'; end if;
  update billing_accounts set test_now=t+interval '34 days' where user_id='${user}';
  r:=billing_status('development','${user}');
  if (r->>'eligible')::boolean then raise exception 'grace extended'; end if;
  update billing_accounts set lease_until=clock_timestamp()-interval '1 second' where user_id='${user}';
  begin perform billing_commit('development','${user}',k,subs,tx,'[]');raise exception 'stale worker committed';
  exception when raise_exception then if sqlerrm<>'billing_lease_lost' then raise; end if; end;
  perform billing_receive('development','revenuecat','fixture-event','RENEWAL','${user}',null,t);
  perform billing_receive('development','revenuecat','fixture-event','RENEWAL','${user}',null,t);
  if (select count(*) from billing_inbox where event_id='fixture-event')<>1 then raise exception 'event duplicate'; end if;
  r:=billing_take_work('development',20);
  if jsonb_array_length(r->'events')<>1 then raise exception 'work claim failed'; end if;
  k:=(r->'events'->0->>'lease')::uuid;
  perform billing_finish_work('development','revenuecat','fixture-event',k,false,'fixture_retry');
  if not exists(select 1 from billing_inbox where event_id='fixture-event' and status='pending' and attempts=1 and retry_at>clock_timestamp()) then raise exception 'retry lost'; end if;
  perform billing_finish_work('development','revenuecat','fixture-event',k,true,null);
  if not exists(select 1 from billing_inbox where event_id='fixture-event' and status='pending') then raise exception 'stale event worker completed'; end if;
end $acceptance$;
select version() as database_version; rollback;`
const report = { ok: false, migrations:migrations.map(({file,sha256})=>({file,sha256})), scope: 'Real development PostgreSQL, rollback-only synthetic provider facts; not Stripe/RevenueCat connectivity or concurrent-transaction acceptance', schema: present ? 'installed' : 'rollback-staged',
  checks: ['private RPC and table grants/RLS','missing config fails closed','one account trial and original receipt','192-hour exact expiry','trial creates no payment binding',
    'worker lease exclusion and stale fencing','immutable customer ownership','early purchase consumes trial','refund never resurrects trial','later invoice and partial refund survive old refund',
    'source/environment/account isolation','72-hour fixed grace and exact expiry','durable event deduplication and fenced retry'], platform: { node: process.version, os: process.platform, arch: process.arch }, realProviderCalls: 0 }
await mkdir('output/tests/billing/desktop', { recursive: true })
try { report.database = await db.query(sql, false); report.ok = true }
catch (error) { report.error = error.message; process.exitCode = 1 }
await writeFile('output/tests/billing/desktop/sql-acceptance.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
