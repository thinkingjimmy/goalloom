/**
 * [INPUT]: Exact D3 manifest, existing Test SDK/runtime, and optional operator-only Auth-absent fixture retirement.
 * [OUTPUT]: Scoped provider ownership, real settlement or explicit direct-fixture retirement; no fabricated lifecycle result.
 * [POS]: D3-only extension of existing lifecycle fixtures; default D2 remains provider-free.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {collectD3ProviderGraph,validateD3ProviderManifest,retireD3FixtureEvents,completeProviderList} from '../billing/provider-fixtures.mjs'

const policies=new WeakSet(),same=(a,b)=>canonicalJson(a)===canonicalJson(b)
const q=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`
const id=value=>typeof value==='string'?value:value?.id??null
export const d3WorkerMethods=new Set(['billing_take_work','billing_owner','billing_finish_work'])
const mutationFields={'subscriptions.cancel':'subscriptions','subscriptions.update':'subscriptions','subscriptionSchedules.release':'schedules','checkout.sessions.expire':'checkouts','invoices.voidInvoice':'invoices','invoices.del':'invoices'}
function knownEvent(m,provider,event){return(provider==='stripe'?m.events:provider==='revenuecat'?m.rcEvents:[]).find(e=>e.id===event)}
function resolvedEffects(m){assert(m.effects.every(e=>['confirmed','not_applied'].includes(e.state)),'Original provider/payment/clock effect remains unresolved')}
export function assertD3ProviderPolicy(policy,journal){
 assert(policies.has(policy)&&journal.profile==='d3-current-d2','Explicit D3 provider policy required')
 const m=validateD3ProviderManifest(policy.manifest),f=journal.fixtures.find(f=>f.ownerId===m.ownerId)
 assert(f&&f.subjectId===m.subjectId&&f.provider===m&&journal.project===m.project,'D3 policy must use the original protected fixture manifest')
 assert(policy.ownerId===m.ownerId&&policy.subjectId===m.subjectId,'Provider identity cannot change')
 if(policy.customer!==null)assert.equal(m.customer,policy.customer,'Provider customer cannot be replaced')
 else if(m.customer!==null)policy.customer=m.customer
 return f
}
export function attachD3ProviderPolicy(ctx,policy){
 assert(!ctx.providerPolicy||ctx.providerPolicy===policy,'Provider policy cannot be replaced')
 assertD3ProviderPolicy(policy,ctx.journal);ctx.providerPolicy=policy;policy.context=ctx
 return policy
}
function scopedStripe(stripe,policy){
 const cache=new WeakMap()
 const wrap=(target,path='')=>{
  if(cache.has(target))return cache.get(target)
  const proxy=new Proxy(target,{get(object,key){
   const value=Reflect.get(object,key),route=path?`${path}.${String(key)}`:String(key)
   if(typeof value==='function')return(...args)=>{
    policy.providerSdkCalls++
    const field=mutationFields[route]
    if(!field){assert(['retrieve','list','listLineItems','search'].includes(String(key)),'Provider method outside settlement port');return value.apply(object,args)}
    return policy.mutate(route,args[0],()=>value.apply(object,args),args.at(-1)?.idempotencyKey)
   }
   return value&&typeof value==='object'?wrap(value,route):value
  }})
  cache.set(target,proxy);return proxy
 }
 return wrap(stripe)
}
export function createD3ProviderPolicy({manifest,runtime,billingConfig,stripe,ledger,rcRequest=async(...args)=>(await import('../billing/d1-provider-cleanup.mjs')).cleanupRevenueCatRequest(...args)}){
 const m=validateD3ProviderManifest(manifest)
 assert(typeof runtime?.BillingService==='function'&&typeof runtime?.BillingProviders==='function','Actual billing runtime exports required')
 assert(billingConfig.environment==='development'&&billingConfig.account===m.stripeAccount&&billingConfig.rcProject===m.rcProject&&billingConfig.rcApp===m.rcApp)
 assert(/^[rs]k_test_/.test(billingConfig.stripeKey??''),'Existing Test credential required; live fallback forbidden')
 const policy={manifest:m,runtime,billingConfig,stripe,ledger,rcRequest,ownerId:m.ownerId,subjectId:m.subjectId,customer:m.customer,providerSdkCalls:0,providerHttpCalls:0}
 policies.add(policy)
 policy.providers=new runtime.BillingProviders(billingConfig,async(...args)=>{policy.providerHttpCalls++;return fetch(...args)},scopedStripe(stripe,policy))
 policy.graph=async()=>{
  const ctx=policy.context;assert(ctx);assertD3ProviderPolicy(policy,ctx.journal)
  if(!m.customer){
   assert.equal((await stripe.accounts.retrieve(m.stripeAccount)).id,m.stripeAccount)
   if(m.clock){assert(m.effects.some(e=>e.state==='confirmed'&&e.result?.id===m.clock),'Original clock creation result required');assert.equal((await stripe.testHelpers.testClocks.retrieve(m.clock)).id,m.clock);assert.equal((await completeProviderList(args=>stripe.customers.list(args),{test_clock:m.clock})).length,0,'Clock has an unrecorded customer')}
   const graph={customer:null,ownerId:m.ownerId,subjectId:m.subjectId,customerDeleted:true,objects:[],events:[],items:[],prices:[],records:Object.fromEntries(['subscriptions','invoices','invoicePayments','paymentIntents','charges','refunds','disputes','schedules','checkouts'].map(key=>[key,[]]))};m.cleanup??={};m.cleanup.graph=graph;await ctx.save();return graph
  }
  const graph=await collectD3ProviderGraph(stripe,m);m.events=graph.events;m.cleanup??={};m.cleanup.graph=graph;await ctx.save();return graph
 }
 policy.mutate=async(route,object,run,key)=>{
  const ctx=policy.context;assert(ctx);assertD3ProviderPolicy(policy,ctx.journal);await ctx.guard({subjectId:m.subjectId,ownerId:m.ownerId})
  assert(m[mutationFields[route]].includes(object),'Provider mutation outside exact recorded graph')
  assert(typeof key==='string'&&key.length>0,'Original service idempotency key required')
  await policy.graph();m.cleanup.actions??={};const actionId=`${route}:${object}`,prior=m.cleanup.actions[actionId]
  if(prior){assert(prior.key===key,'Original provider key changed');policy.blockedEffect=actionId;throw Error('provider_effect_requires_original_readback')}
  m.cleanup.actions[actionId]={key,object,route,outcome:'unknown',startedAt:new Date().toISOString()};await ctx.save()
  try{const result=await run();m.cleanup.actions[actionId].outcome='response_received';if(route==='invoices.del'&&result.deleted){m.cleanup.actions[actionId].terminalReadback=true;m.cleanup.deletedDraftInvoices??=[];m.cleanup.deletedDraftInvoices.push(object)}await ctx.save();await policy.graph();return result}
  catch(error){policy.blockedEffect=actionId;await ctx.save();throw error}
 }
 return policy
}
export async function assertD3DatabaseOwnership(ctx,f){
 const policy=ctx.providerPolicy;assertD3ProviderPolicy(policy,ctx.journal);const m=policy.manifest;assert.equal(f.subjectId,m.subjectId)
 const rows=await ctx.db.query(`select
 (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.billing_customers c where environment='development' and (subject_id=${q(m.subjectId)}${m.customer?` or customer_id=${q(m.customer)}`:''})) customers,
 (select coalesce(jsonb_agg(jsonb_build_object('id',subscription_id,'subject',subject_id,'customer',customer_id)),'[]') from public.billing_subscriptions where environment='development' and (subject_id=${q(m.subjectId)} or subscription_id=any(array[${m.subscriptions.map(q).join(',')}]::text[]))) subscriptions,
 (select coalesce(jsonb_agg(jsonb_build_object('id',invoice_id,'subject',subject_id,'subscription',subscription_id)),'[]') from public.billing_transactions where environment='development' and (subject_id=${q(m.subjectId)} or invoice_id=any(array[${m.invoices.map(q).join(',')}]::text[]))) invoices`)
 assert(rows.length===1)
 const proof=rows[0];assert(proof.customers.length<=1&&proof.customers.every(c=>c.subject_id===m.subjectId&&c.customer_id===m.customer&&c.source==='stripe'),'Foreign provider customer binding')
 assert(proof.subscriptions.length<=500&&proof.subscriptions.every(s=>s.subject===m.subjectId&&s.customer===m.customer&&m.subscriptions.includes(s.id)))
 assert(proof.invoices.length<=500&&proof.invoices.every(i=>i.subject===m.subjectId&&m.invoices.includes(i.id)&&m.subscriptions.includes(i.subscription)))
 return proof
}
export async function guardD3BillingRpc(ctx,name,args,result,after=false){
 const policy=ctx.providerPolicy;assertD3ProviderPolicy(policy,ctx.journal);const m=policy.manifest
 const members=ctx.journal.scopes[ctx.scope]?.manifest?.subjects
 assert(members?.length===1&&members[0].subjectId===m.subjectId&&members[0].ownerId===m.ownerId,'D3 worker scope must contain only its exact fixture')
 await ctx.guard({subjectId:m.subjectId,ownerId:m.ownerId});await assertD3DatabaseOwnership(ctx,ctx.fixture(m.ownerId))
 const rows=await ctx.db.query(`select provider,event_id,event_type,object_id,extract(epoch from occurred_at)::double precision created,subject_id,lease,status from public.billing_inbox where environment='development' and subject_id=${q(m.subjectId)} and ${name==='billing_finish_work'?`provider=${q(args.p_provider)} and event_id=${q(args.p_event)}`:"status in('pending','processing')"}`)
 assert(rows.length<=1000)
 for(const row of rows){const e=knownEvent(m,row.provider,row.event_id);assert(e&&e.type===row.event_type&&e.object===row.object_id&&e.created===row.created&&row.subject_id===m.subjectId,'Unrecorded/foreign signed delivery')}
 if(name==='billing_owner'){assert.equal(args.p_customer,m.customer);if(after)assert.equal(result,m.subjectId)}
 if(name==='billing_take_work'){
  assert(Number.isInteger(args.p_limit)&&args.p_limit>=1&&args.p_limit<=2)
  if(after){assert(Array.isArray(result.accounts)&&Array.isArray(result.events)&&result.accounts.length<=2&&result.events.length<=2);assert(result.accounts.every(s=>s===m.subjectId));for(const e of result.events)assert(e.subject_id===m.subjectId&&knownEvent(m,e.provider,e.event_id)&&rows.some(r=>r.provider===e.provider&&r.event_id===e.event_id&&r.lease===e.lease))}
 }
 if(name==='billing_finish_work'){assert(knownEvent(m,args.p_provider,args.p_event)&&rows.length===1);if(!after)assert.equal(rows[0].lease,args.p_lease);else assert(rows[0].lease===null&&rows[0].status===(args.p_ok?'complete':'pending'))}
}
export async function driveD3FixtureWorker(ctx,runtime,ledger,{steps=40,advance=true}={}){
 const p=ctx.providerPolicy;assertD3ProviderPolicy(p,ctx.journal);assert(runtime===p.runtime&&ledger===p.ledger,'Original runtime/independent ledger required')
 assert(Number.isInteger(steps)&&steps>=1&&steps<=40)
 const {advanceFixtureWork,assertFixtureRows}=await import('./fixture-support.mjs')
 const ports={url:'https://asqyvcnxdltzzfutbbqy.supabase.co',serviceKey:ctx.serviceKey,environment:'development'},storage=runtime.projectStorage(ports)
 const auth=runtime.projectAuth({...ports,fetch:async(url,init)=>{assert(new URL(url).origin===ports.url&&new URL(url).pathname===`/auth/v1/admin/users/${p.ownerId}`);await ctx.guard({subjectId:p.subjectId,ownerId:p.ownerId});return fetch(url,init)}})
 const worker=runtime.createLifecycleWorker({environment:'development',rpc:ctx.rpc,ledger,guard:runtime.workerScopeGuard(ctx.rpc,'development'),
  storage:{inventory:async(workspace,cursor)=>{const {fixture:f,target:t}=ctx.target(workspace);await ctx.guard({subjectId:f.subjectId,workspaceId:workspace,generation:t.generation});return storage.inventory(workspace,cursor)},remove:async(workspace,path)=>{const {fixture:f,target:t}=ctx.target(workspace);await ctx.guard({subjectId:f.subjectId,workspaceId:workspace,generation:t.generation,paths:[path]});return storage.remove(workspace,path)}},
  auth:{remove:async owner=>{assert.equal(owner,p.ownerId);await ctx.authIdentity(ctx.fixture(owner));return auth.remove(owner)}},
  settle:async subject=>{assert.equal(subject,p.subjectId);await assertFixtureRows(ctx,ctx.fixture(p.ownerId));resolvedEffects(p.manifest);await p.graph();await p.providers.verifyConfiguration();const service=new runtime.BillingService(p.billingConfig,ctx.rpc,p.providers);await service.configured();const result=await service.reconcile(subject);await p.graph();return result}})
 const before=p.providerSdkCalls+p.providerHttpCalls,results=[]
 for(let i=0;i<steps;i++){
  if(advance)await advanceFixtureWork(ctx)
  const result=await worker();results.push(result);ctx.journal.workerRuns??=[];ctx.journal.workerRuns.push({at:new Date().toISOString(),settleMode:'real-d3-provider',result});await ctx.save()
  assert(!p.blockedEffect,'Original provider effect requires readback; worker will not retry')
  const done=(await ctx.db.query(`select not exists(select 1 from service_private.deletion_requests where environment='development' and subject_id=${q(p.subjectId)} and confirmed_at is not null and (content<>'deleted' or auth_state not in('deleted','not_applicable') or renewal not in('stopped','not_applicable'))) and not exists(select 1 from service_private.deletion_outbox where environment='development' and subject_id=${q(p.subjectId)} and acknowledged_at is null) done`))[0].done
  if(done)break
 }
 return{settleMode:'real-d3-provider',steps:results.length,providerSdkAndHttpCalls:p.providerSdkCalls+p.providerHttpCalls-before,physicalNetworkAttemptCountEstablished:false,results}
}
function terminalGraph(graph){
 const r=graph.records
 assert(r.subscriptions.every(s=>['canceled','incomplete_expired'].includes(s.status)&&!s.schedule),'Renewal remains active')
 assert(r.checkouts.every(s=>['complete','expired'].includes(s.status)),'Checkout remains open')
 assert(r.schedules.every(s=>['released','canceled','completed'].includes(s.status)),'Schedule remains active')
 assert(r.invoices.every(i=>['paid','void','uncollectible'].includes(i.status)),'Invoice settlement remains unresolved')
 assert(r.paymentIntents.every(i=>['succeeded','canceled'].includes(i.status)),'Payment attempt remains unresolved')
 assert(r.refunds.every(r=>['succeeded','failed','canceled'].includes(r.status)),'Refund remains unresolved')
 assert(r.disputes.every(d=>['won','lost','warning_closed'].includes(d.status)),'Dispute remains unresolved')
}
async function retireRevenueCat(p,graph){
 const m=p.manifest,path=`/projects/${m.rcProject}/customers/${encodeURIComponent(m.ownerId)}`,request=p.rcRequest
 const customer=await request('GET',path)
 if(customer.status===404){m.cleanup.rcAbsent=true;await p.context.save();return}
 assert(customer.status===200&&customer.body?.id===m.ownerId,'RC canonical identity differs')
 const page=async route=>{const r=await request('GET',route);assert(r.status===200&&Array.isArray(r.body?.items)&&r.body.items.length<=100&&!r.body.next_page&&r.body.has_more!==true,'RC graph is incomplete');return r.body.items}
 const aliases=await page(`${path}/aliases?limit=100`);assert(aliases.every(a=>(typeof a==='string'?a:a.id)===m.ownerId),'RC aliases extend outside fixture')
 const subscriptions=await page(`${path}/subscriptions?limit=100`),purchases=await page(`${path}/purchases?limit=100`);assert(purchases.length===0,'RC non-subscription history must remain')
 for(const sub of subscriptions){assert(sub.store==='stripe'&&sub.environment==='sandbox'&&sub.customer_id===m.ownerId&&(!sub.original_customer_id||sub.original_customer_id===m.ownerId)&&graph.items.includes(sub.store_subscription_identifier));const r=await request('GET',`/projects/${m.rcProject}/products/${encodeURIComponent(sub.product_id)}`);assert(r.status===200&&r.body?.app_id===m.rcApp&&graph.prices.includes(r.body?.store_identifier),'Another RC app/product must remain')}
 if(m.cleanup.rcDeleteStarted)throw Error('rc_delete_original_outcome_unresolved')
 m.cleanup.rcDeleteStarted=true;await p.context.save();const deleted=await request('DELETE',path);assert([200,202,204,404].includes(deleted.status),'RC deletion not accepted')
 assert.equal((await request('GET',path)).status,404,'RC deletion remains asynchronous');m.cleanup.rcAbsent=true;await p.context.save()
}
async function deleteTestCustomer(p,graph){
 const m=p.manifest,ctx=p.context;terminalGraph(graph)
 if(m.customer&&!graph.customerDeleted){
  assert(!m.cleanup.customerDeleteStarted,'Original customer deletion outcome unresolved')
  m.cleanup.customerDeleteStarted=true;await ctx.save();await p.stripe.customers.del(m.customer)
  assert.equal((await p.stripe.customers.retrieve(m.customer)).deleted,true)
 }
 m.cleanup.customerAbsent=true;await ctx.save()
 if(m.clock&&!m.cleanup.clockAbsent){
  assert(m.effects.some(e=>e.state==='confirmed'&&e.result?.id===m.clock),'Only the original created clock may be removed')
  if(m.cleanup.clockDeleteStarted){try{await p.stripe.testHelpers.testClocks.retrieve(m.clock)}catch(error){assert(error.statusCode===404&&error.code==='resource_missing');m.cleanup.clockAbsent=true;await ctx.save();return}throw Error('original_clock_delete_outcome_unresolved')}
  const customers=await completeProviderList(args=>p.stripe.customers.list(args),{test_clock:m.clock})
  assert(customers.every(c=>c.id===m.customer),'Clock acquired an unowned customer; retain it')
  m.cleanup.clockDeleteStarted=true;await ctx.save();const result=await p.stripe.testHelpers.testClocks.del(m.clock);assert(result.deleted===true);m.cleanup.clockAbsent=true;await ctx.save()
 }
}
async function financialAbsence(ctx,m){
 const tables=['billing_compensations','billing_grace','billing_transactions','billing_subscriptions','billing_operations','billing_customers','billing_accounts']
 const row=(await ctx.db.query(`select jsonb_build_object(${tables.map(t=>`${q(t)},(select count(*) from public.${t} where environment='development' and subject_id=${q(m.subjectId)})`).join(',')},'financial_holds',(select count(*) from service_private.financial_holds where environment='development' and invoice_id=any(array[${m.invoices.map(q).join(',')}]::text[]))) counts,
 (select count(*) from pg_stat_activity where pid<>pg_backend_pid() and application_name=${q(m.cleanup.financialApplicationName??ctx.applicationName)} and state<>'idle') active`))[0]
 assert(Number(row.active)===0&&Object.values(row.counts).every(n=>Number(n)===0),'Original financial retirement is unresolved')
 return row.counts
}
export async function retireD3ProviderFinancials(ctx,{directFixture=false}={}){
 const p=ctx.providerPolicy;assertD3ProviderPolicy(p,ctx.journal);const m=p.manifest;resolvedEffects(m)
 assert(!directFixture||ctx.directFixtureCleanup===true,'Direct retirement is operator-only fixture cleanup')
 await ctx.guard({subjectId:m.subjectId,ownerId:m.ownerId});await assertD3DatabaseOwnership(ctx,ctx.fixture(m.ownerId))
 const graph=await p.graph();terminalGraph(graph)
 const terminal=(await ctx.db.query(`select state,(work_lease is null or work_lease_until<=clock_timestamp()) no_active_work,exists(select 1 from service_private.deletion_requests where environment='development' and subject_id=${q(m.subjectId)} and scope='account' and confirmed_at is not null and renewal='stopped' and auth_state='deleted' and content='deleted') settled from service_private.account_lifecycle where environment='development' and subject_id=${q(m.subjectId)}`))[0]
 if(directFixture){const absence=(await ctx.db.query(`select not exists(select 1 from auth.users where id=${q(m.ownerId)}) and not exists(select 1 from auth.sessions where user_id=${q(m.ownerId)}) absent`))[0];assert(terminal?.no_active_work&&absence?.absent,'Direct fixture Auth/work remains active')}
 else assert(terminal?.state==='deleted'&&terminal.no_active_work&&terminal.settled,'Real lifecycle settlement is incomplete')
 await deleteTestCustomer(p,graph);await retireRevenueCat(p,graph)
 const after=await p.graph();terminalGraph(after);assert(m.cleanup.customerAbsent&&m.cleanup.rcAbsent&&(!m.clock||m.cleanup.clockAbsent))
 // Every newly observed exact event is protected before its retirement mutation.
 m.events=after.events;await ctx.save();await retireD3FixtureEvents(ctx.db,m,after,{scopeHeader:ctx.scopeHeader()})
 if(m.cleanup.financialSqlAttempted){
  const counts=await financialAbsence(ctx,m);return{financialRowsAbsent:true,lateEventTombstonesPreserved:true,originalOutcomeReadback:true,counts}
 }
 m.cleanup.financialSqlAttempted=true;m.cleanup.financialApplicationName=ctx.applicationName;await ctx.save()
 await ctx.db.query(`begin;set local lock_timeout='3s';set local statement_timeout='15s';
 set local request.headers=${q(JSON.stringify({'x-goalloom-lifecycle-scope':ctx.scopeHeader()}))};
 select service_private.assert_worker_target('development',${q(m.subjectId)});
 select 1 from public.ai_budget where id='integration-shared' for update;
 select service_private.lock_account(${q(m.subjectId)},'development');
 do $$begin
 if not exists(select 1 from service_private.policy where id=1 and project_ref=${q(m.project)} and environment='development')
 or not exists(select 1 from service_private.account_lifecycle where environment='development' and subject_id=${q(m.subjectId)} and owner_tag=service_private.owner_tag(${q(m.ownerId)}) ${directFixture?'':"and state='deleted'"} and (work_lease is null or work_lease_until<=clock_timestamp()))
 ${directFixture?`or exists(select 1 from auth.users where id=${q(m.ownerId)}) or exists(select 1 from auth.sessions where user_id=${q(m.ownerId)})`:`or not exists(select 1 from service_private.deletion_requests where environment='development' and subject_id=${q(m.subjectId)} and scope='account' and confirmed_at is not null and renewal='stopped' and auth_state='deleted' and content='deleted')`}
 or exists(select 1 from public.billing_accounts where environment='development' and subject_id=${q(m.subjectId)} and lease is not null ${directFixture?'and lease_until>clock_timestamp()':''})
 or exists(select 1 from public.billing_operations where environment='development' and subject_id=${q(m.subjectId)} and status='pending')
 or exists(select 1 from public.billing_compensations where environment='development' and subject_id=${q(m.subjectId)} and status<>'complete')
 or exists(select 1 from public.billing_customers where environment='development' and subject_id=${q(m.subjectId)} and customer_id is distinct from ${q(m.customer)})
 or exists(select 1 from public.billing_transactions where environment='development' and subject_id=${q(m.subjectId)} and invoice_id<>all(array[${m.invoices.map(q).join(',')}]::text[]))
 or exists(select 1 from public.billing_transactions where environment='development' and invoice_id=any(array[${m.invoices.map(q).join(',')}]::text[]) and subject_id<>${q(m.subjectId)})
 or exists(select 1 from public.billing_compensations where environment='development' and invoice_id=any(array[${m.invoices.map(q).join(',')}]::text[]) and subject_id<>${q(m.subjectId)})
 or exists(select 1 from public.billing_subscriptions where environment='development' and subject_id=${q(m.subjectId)} and subscription_id<>all(array[${m.subscriptions.map(q).join(',')}]::text[]))
 or exists(select 1 from public.billing_inbox where environment='development' and subject_id=${q(m.subjectId)}) then raise exception 'd3_fixture_retirement_unresolved';end if;end$$;
 delete from service_private.financial_holds h using public.billing_transactions t where h.environment='development' and t.environment=h.environment and t.invoice_id=h.invoice_id and t.subject_id=${q(m.subjectId)} and t.invoice_id=any(array[${m.invoices.map(q).join(',')}]::text[]);
 delete from public.billing_compensations where environment='development' and subject_id=${q(m.subjectId)};
 delete from public.billing_grace where environment='development' and subject_id=${q(m.subjectId)};
 delete from public.billing_transactions where environment='development' and subject_id=${q(m.subjectId)};
 delete from public.billing_subscriptions where environment='development' and subject_id=${q(m.subjectId)};
 delete from service_private.operation_aliases where environment='development' and subject_id=${q(m.subjectId)};
 delete from service_private.continuations where environment='development' and subject_id=${q(m.subjectId)};
 delete from public.billing_operations where environment='development' and subject_id=${q(m.subjectId)};
 delete from public.billing_customers where environment='development' and subject_id=${q(m.subjectId)};
 delete from public.billing_accounts where environment='development' and subject_id=${q(m.subjectId)};
 commit;`,false)
 const counts=await financialAbsence(ctx,m);m.cleanup.financialRowsAbsent=true;await ctx.save()
 return{financialRowsAbsent:true,lateEventTombstonesPreserved:true,providerHistoryErased:false,revenueCatAbsent:true,stripeCustomerAbsent:true,counts}
}
/** Thin Backend entry: one policy, one graph/settlement engine and existing lifecycle cleanup. */
export async function cleanupD3Fixture({ctx,fixture,stripe,graph,persist}){
 const p=ctx.providerPolicy;assertD3ProviderPolicy(p,ctx.journal);assert(fixture===ctx.fixture(p.ownerId)&&stripe===p.stripe&&p.ledger,'Original fixture/Stripe/ledger required')
 if(graph)assert(graph.customer===p.manifest.customer&&graph.subjectId===p.subjectId)
 assert(typeof persist==='function');await persist(p.manifest)
 const {cleanupLifecycleFixtures}=await import('./fixture-maintenance.mjs')
 return cleanupLifecycleFixtures(ctx,p.runtime,p.ledger)
}
