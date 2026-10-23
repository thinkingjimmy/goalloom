/**
 * [INPUT]: Explicit environment ledger, private Management credential and disposable synthetic admission IDs.
 * [OUTPUT]: Real concurrent-transaction deduplication/concurrency evidence and verified fixture cleanup.
 * [POS]: Admission-only integration test. No provider is called; known synthetic reservations settle to zero.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import { actionId } from './content-minimization/identity.mjs'
import {client} from './client.mjs'
import { acceptanceTarget } from './acceptance-target.mjs'
const {args,environment,config,prefix}=acceptanceTarget()
assert.equal(args.length,0,'Unexpected concurrency arguments')
const db=await client(config,environment),user=randomUUID(),first=actionId(),email=`hosted-admission-${randomUUID()}@goalloom.test`
const report={ok:false,checks:[],scope:`Real ${environment} PostgreSQL concurrent Management transactions, synthetic admission-only user/actions; no Auth session or provider call.`,realProviderCalls:0,realCostUsd:0}
const admit=id=>db.query(`select public.ai_admit('${user}','${id}','evaluate','${environment}','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000) as admission;`,false)
let created=false,stage="budget_readback"
await mkdir('output/tests/hosted-ai',{recursive:true})
report.fixtureUserId=user;report.firstActionId=first;report.startedAt=new Date().toISOString()
await writeFile(`output/tests/hosted-ai/${prefix}concurrency-acceptance.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600})
try{
 const budget=(await db.query("select limit_micro,spent_micro,policy from public.ai_budget where id='integration-shared';"))[0]
 assert(budget.policy==='authenticated' && budget.limit_micro-budget.spent_micro>=2000000,'Four existing reservations are required')
 const expectedRejection=budget.limit_micro-budget.spent_micro>=2500000?'account_concurrency':'platform_budget'
 report.accountConcurrencyIsolated=expectedRejection==='account_concurrency'
 stage="fixture_create"
 await db.query(`insert into auth.users(id,email) values('${user}','${email}');`,false);created=true
 stage="duplicate_admission"
 const repeated=await Promise.allSettled([admit(first),admit(first)])
 for(const result of repeated)assert.equal(result.status,'fulfilled','Admission request failed')
 const values=repeated.map(result=>result.value[0].admission)
 assert.deepEqual(values.map(value=>value.existing).sort(),[false,true])
 const rows=await db.query(`select count(*)::int as count,sum(charged_micro)::text as charged from public.ai_actions where user_id='${user}';`)
 assert.equal(rows[0].count,1);assert.equal(Number(rows[0].charged),500000)
 report.checks.push('Two concurrent requests for the same action create one reservation and one reusable receipt')
 stage="parallel_admission"
 const parallel=await Promise.allSettled(Array.from({length:4},()=>admit(actionId())))
 for(const result of parallel)assert.equal(result.status,'fulfilled','Concurrent admission failed')
 const results=parallel.map(result=>result.value[0].admission)
 assert.equal(results.filter(value=>value.existing===false).length,3)
 assert.equal(results.filter(value=>value.error===expectedRejection).length,1)
 const active=await db.query(`select count(*)::int as count,sum(charged_micro)::text as charged from public.ai_actions where user_id='${user}';`)
 assert.equal(active[0].count,4);assert.equal(Number(active[0].charged),2000000)
 report.checks.push(expectedRejection==='account_concurrency'?'Parallel distinct actions cannot bypass the four-request account concurrency limit':'Parallel requests retain four reservations; the fifth hits the earlier platform budget guard. Account concurrency is verified separately in rollback SQL.')
 report.ok=true
}catch(error){report.error='concurrency_acceptance_incomplete';report.failureStage=stage;report.networkCode=['UND_ERR_SOCKET','ECONNRESET','ETIMEDOUT'].includes(error.cause?.code)?error.cause.code:null;report.transportStatus=error.message.match(/HTTP \d{3}/)?.[0]??null;process.exitCode=1}
finally{
 if(created){
  try{
   // These are direct SQL admissions from this process, so no provider charge can exist.
   await db.query(`begin;
select public.ai_settle(user_id,action_id,'failed',0,true,null,0,0,'outcome_lost') from public.ai_actions where user_id='${user}';
do $cleanup$ begin if exists(select 1 from public.ai_actions where user_id='${user}' and (not confirmed or charged_micro<>0 or provider_request_id is not null)) then raise exception 'Synthetic cleanup guard';end if;end $cleanup$;
delete from public.ai_actions where user_id='${user}';
delete from public.ai_limit_events where user_id='${user}';
delete from auth.users where id='${user}' and email='${email}';commit;`,false)
   const left=await db.query(`select count(*)::int as count from auth.users where id='${user}';`)
   assert.equal(left[0].count,0);report.syntheticFixturesRemoved=true
  }catch(error){report.ok=false;report.syntheticFixturesRemoved=false;report.cleanupError=db.safe(error.message);process.exitCode=1}
 }
 await mkdir('output/tests/hosted-ai',{recursive:true});await writeFile(`output/tests/hosted-ai/${prefix}concurrency-acceptance.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}
