/**
 * [INPUT]: Installed D1 development schema and isolated synthetic signed workspace fixtures.
 * [OUTPUT]: Independent transaction evidence for post-lock expiry/revocation with unchanged business writes.
 * [POS]: D1 hosted concurrency acceptance; no provider, Storage, model, production or owner-data access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {client,developmentRef} from '../hosted-ai/client.mjs'
import {d1Migrations} from './d1-schema.mjs'
import {syncFixture,identitySql,authSql,literal as q,json,bytea} from './d1-sync-fixtures.mjs'

const db=await client(),directory='output/tests/billing/desktop/d1-backend'
await mkdir(directory,{recursive:true})
const migrations=await d1Migrations(db)
assert(migrations.every(x=>x.installed),'Install reviewed D1 schema first')
assert((await db.query('select enabled from service_private.policy where id=1'))[0].enabled,'Development service must be configured')
const report={ok:false,project:developmentRef,migrations:migrations.map(({file,sha256})=>({file,sha256})),cases:[],fixtures:[],
 scope:'Real independent development PostgreSQL transactions, synthetic opaque data; no external providers or models',platform:{node:process.version,os:process.platform,arch:process.arch}}
report.database=(await db.query('select version() as version'))[0].version
const t='2026-10-23T00:00:00Z'
const snapshot=f=>`select jsonb_build_object('workspace',(select jsonb_build_object('head',head_seq,'roster',roster_version,'hash',(select body_hash from public.device_roster where workspace_id=w.id and version=w.roster_version),'epoch',key_epoch) from public.workspaces w where id=${q(f.workspace)}),
 'ops',(select count(*) from public.ops where workspace_id=${q(f.workspace)}),'receipts',(select count(*) from public.op_receipts where workspace_id=${q(f.workspace)}),
 'rosters',(select count(*) from public.device_roster where workspace_id=${q(f.workspace)}),'heads',(select count(*) from public.control_events where device_id=${q(f.device)} and event='head')) as state;`
async function barrier(name,blocker=null){
 const end=Date.now()+12000
 while(Date.now()<end){
  const rows=await db.query(`select pid,wait_event_type,pg_blocking_pids(pid) as blockers from pg_stat_activity where application_name=${q(name)} and state='active'`)
  if(rows.length&&(blocker===null||rows.some(x=>x.wait_event_type==='Lock'&&x.blockers.includes(blocker))))return rows[0].pid
  await new Promise(resolve=>setTimeout(resolve,100))
 }
 throw Error(blocker!==null?'waiting_transaction_not_observed':'holder_transaction_not_observed')
}
async function clean(f){
 await db.query(`begin;do $$begin if exists(select 1 from auth.users where id=${q(f.user)} and email<>${q(`billing-${f.user}@goalloom.test`)}) then raise exception 'Fixture identity mismatch';end if;end$$;
 delete from public.billing_grace where user_id=${q(f.user)};delete from public.billing_transactions where user_id=${q(f.user)};
 delete from public.billing_subscriptions where user_id=${q(f.user)};delete from public.billing_operations where user_id=${q(f.user)};
 delete from public.billing_customers where user_id=${q(f.user)};delete from public.billing_accounts where user_id=${q(f.user)};
 delete from public.control_events where device_id=${q(f.device)};delete from public.rpc_buckets where device_id=${q(f.device)};
 delete from auth.users where id=${q(f.user)} and email=${q(`billing-${f.user}@goalloom.test`)};commit;`,false)
 const absent=(await db.query(`select not exists(select 1 from auth.users where id=${q(f.user)})
  and not exists(select 1 from public.workspaces where id=${q(f.workspace)})
  and not exists(select 1 from public.devices where id=${q(f.device)})
  and not exists(select 1 from public.billing_accounts where user_id=${q(f.user)})
  and not exists(select 1 from public.control_events where device_id=${q(f.device)})
  and not exists(select 1 from public.rpc_buckets where device_id=${q(f.device)}) as absent`))[0].absent
 assert(absent,'Concurrency fixture cleanup incomplete')
}
try{
 for(const mutation of ['push','roster'])for(const transition of ['expiry','revocation']){
  const f=syncFixture(),suffix=f.user.replaceAll('-',''),holder=`d1-holder-${f.user}`,waiter=`d1-waiter-${f.user}`
  report.fixtures.push({user:f.user,workspace:f.workspace,cleaned:false})
  let a,b
  try{
   await db.query(`begin;${identitySql(f)}
    insert into public.billing_accounts(environment,user_id,test_now,reconcile_at) values('development',${q(f.user)},${q(t)},clock_timestamp()+interval '1 day');
    select public.billing_claim_trial('development',${q(f.user)},${q(f.request)});
    ${authSql(f)}select public.bootstrap_workspace(${f.workspaceArguments});commit;`,false)
   const before=await db.query(snapshot(f))
   a=db.query(`begin;set local application_name=${q(holder)};set local statement_timeout='25s';set local lock_timeout='5s';
    select id from public.workspaces where id=${q(f.workspace)} for update;
    do $$declare deadline timestamptz:=clock_timestamp()+interval '20 seconds';begin
     while coalesce((public.billing_status('development',${q(f.user)})->>'eligible')::boolean,false) loop
      if clock_timestamp()>deadline then raise exception 'Transition barrier timed out';end if;
      perform pg_sleep(0.05);
     end loop;
    end$$;commit;`,false)
   a.catch(()=>{})
   const holderPid=await barrier(holder)
   const call=mutation==='push'?`public.push_ops(${q(f.workspace)},${q(f.device)},${q(f.generation)},${json([f.operation])})`
    :`public.commit_roster(${q(f.workspace)},${q(f.device)},1,${q(f.rosterHash)},${json(f.nextRoster)},${q(f.nextRosterHash)},${bytea(f.nextRosterSig)},'device')`
   const expected=transition==='expiry'?'service_expired':'service_revoked'
   b=db.query(`begin;set local application_name=${q(waiter)};set local statement_timeout='25s';set local lock_timeout='20s';${authSql(f)}
    do $$begin perform ${call};raise exception 'Expired/revoked waiting write succeeded';
     exception when sqlstate 'PT403' then if sqlerrm<>${q(expected)} then raise;end if;end$$;
    select ${q(expected)} as rejected;commit;`,false)
   b.catch(()=>{})
   await barrier(waiter,holderPid)
   if(transition==='expiry')await db.query(`update public.billing_accounts set test_now=trial_ends_at where environment='development' and user_id=${q(f.user)};`,false)
   else await db.query(`do $$declare k uuid;s jsonb;x jsonb;p text;begin
    k:=(public.billing_lock('development',${q(f.user)})->>'lease')::uuid;
    perform public.billing_bind_customer('development',${q(f.user)},k,${q(`cus_D1${suffix}`)});
    select monthly_price into p from public.billing_sources where environment='development' and source='stripe';
    s:=jsonb_build_array(jsonb_build_object('subscription_id',${q(`sub_D1${suffix}`)},'customer_id',${q(`cus_D1${suffix}`)},'status','canceled','price_id',p,'period_start',${q(t)},'period_end','2026-11-23T00:00:00Z','cancel_at_period_end',false));
    x:=jsonb_build_array(jsonb_build_object('invoice_id',${q(`in_D1${suffix}`)},'subscription_id',${q(`sub_D1${suffix}`)},'price_id',p,'starts_at',${q(t)},'ends_at','2026-11-23T00:00:00Z','paid_at',${q(t)},'amount_cents',899,'refunded_cents',899,'disposition','refunded','rc_verified',true,'financial_at',${q(t)}));
    perform public.billing_commit('development',${q(f.user)},k,s,x,'[]');
    perform public.billing_unlock('development',${q(f.user)},k);
    end$$;`,false)
   const results=await Promise.allSettled([a,b])
   for(const result of results)if(result.status==='rejected')throw result.reason
   assert(results[1].value.some(x=>x.rejected===expected),'Missing definitive denial')
   assert.deepEqual(await db.query(snapshot(f)),before,'Waiting denied write changed ops/receipts/roster/head')
   report.cases.push({mutation,transition,observedBlockedBeforeTransition:true,error:expected,unchanged:true})
  }finally{
   if(a||b)await Promise.allSettled([a,b].filter(Boolean))
   await clean(f);report.fixtures.at(-1).cleaned=true
  }
 }
 report.ok=true
}catch(error){report.error={type:error.name,message:error.name==='AssertionError'||/^Management [A-Z]+ \/[\w/?=-]+: HTTP \d+$/.test(error.message)?error.message:'d1_concurrency_incomplete'};process.exitCode=1}
await writeFile(`${directory}/concurrency.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
