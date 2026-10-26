/**
 * [INPUT]: Reviewed billing source, exact installed RPCs and owner-only test provider credentials.
 * [OUTPUT]: Development Edge deployment, private Secrets, source read-back and Vault-backed minute worker.
 * [POS]: D0 deployment only. No production access, AI/sync policy change, payment or public purchase activation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {client,developmentRef,developmentUrl} from '../hosted-ai/client.mjs'
import {eszipOriginalSource} from '../deploy/edge-source.mjs'
import {bundle} from './build.mjs'
import {privateConfig} from './private-config.mjs'
import {billingMigrations,assertBillingSource} from './schema.mjs'
const mode=process.argv[2]??'--plan';assert(['--plan','--apply'].includes(mode),'Use --plan or --apply')
const report={ok:false,mode,project:developmentRef,scope:'Development billing only; no production, live payment, AI/sync gate or budget change'}
const quote=value=>`'${String(value).replaceAll("'","''")}'`
try{
  report.stage='schema_readback'
  const db=await client(),migrations=await billingMigrations(db);assert(migrations.every(entry=>entry.installed),'Deploy reviewed billing migrations first');await assertBillingSource(db,migrations)
  const env=await privateConfig(),required=['BILLING_CONFIG','BILLING_STRIPE_KEY','BILLING_STRIPE_WEBHOOK_SECRET','BILLING_RC_PUBLIC_KEY','BILLING_RC_SECRET_KEY','BILLING_RC_WEBHOOK_SECRET','BILLING_WORKER_SECRET']
  assert(required.every(name=>env[name]),'Billing test configuration is incomplete')
  const config=JSON.parse(env.BILLING_CONFIG);assert(config.environment==='development'&&config.account==='acct_1QvwdlITpGuR8ZMB'&&config.rcApp==='appc06dd78ed3','Unexpected provider target')
  assert(/^[rs]k_test_/.test(env.BILLING_STRIPE_KEY),'Never deploy a live Stripe key to development')
  report.stage='bundle'
  const source=await bundle('supabase/functions/billing/index.ts');report.sha256=createHash('sha256').update(source).digest('hex')
  if(mode==='--apply'){
    const budgetBefore=await db.query('select environment,policy,limit_micro,spent_micro,blocked from ai_budget order by id')
    report.stage='secrets'
    await db.request('/secrets',{method:'POST',json:required.map(name=>({name,value:env[name]})),binary:true})
    const secrets=await db.request('/secrets');assert(required.every(name=>secrets.some(value=>value.name===name)),'Development secret upload incomplete')
    const form=new FormData();form.set('metadata',JSON.stringify({name:'billing',entrypoint_path:'index.ts',verify_jwt:false}));form.append('file',new Blob([source],{type:'application/typescript'}),'index.ts')
    report.stage='deploy'
    await db.request('/functions/deploy?slug=billing',{method:'POST',form})
    const metadata=await db.request('/functions/billing');assert(metadata.status==='ACTIVE'&&metadata.verify_jwt===false,'Expected active manually-authenticated billing ingress')
    const downloaded=await db.request('/functions/billing/body',{binary:true}),original=downloaded.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(downloaded):downloaded.toString('utf8')
    assert.equal(createHash('sha256').update(original).digest('hex'),report.sha256,'Edge source read-back mismatch')
    report.stage='enable_development'
    await db.query(`begin;set local lock_timeout='5s';set local statement_timeout='30s';
      insert into billing_sources(environment,source,account_id,rc_project,rc_app,monthly_price,annual_price,enabled)
        values('development','stripe',${quote(config.account)},${quote(config.rcProject)},${quote(config.rcApp)},${quote(config.prices.monthly)},${quote(config.prices.annual)},true)
        on conflict(environment,source) do update set enabled=true where billing_sources.account_id=excluded.account_id and billing_sources.rc_app=excluded.rc_app and billing_sources.monthly_price=excluded.monthly_price and billing_sources.annual_price=excluded.annual_price;
      do $$ begin if not exists(select 1 from billing_sources where environment='development' and rc_app=${quote(config.rcApp)} and enabled) then raise exception 'Billing source drift';end if;end $$;
      update billing_policy set enabled=true where environment='development';commit;`,false)
    const workerName='goalloom-billing-worker-development',vaultName='goalloom-billing-worker-auth-development'
    const workerSql=`select net.http_post(url:='${developmentUrl}/functions/v1/billing/worker',headers:=jsonb_build_object('content-type','application/json','authorization',(select decrypted_secret from vault.decrypted_secrets where name='${vaultName}')),body:='{}'::jsonb,timeout_milliseconds:=30000);`
    report.stage='schedule'
    await db.query('create extension if not exists pg_net with schema extensions;',false)
    const deployed=await db.query(`begin;set local lock_timeout='5s';set local statement_timeout='30s';
      do $$ declare existing text;begin
        select decrypted_secret into existing from vault.decrypted_secrets where name='${vaultName}';
        if existing is null then perform vault.create_secret(${quote(`Bearer ${env.BILLING_WORKER_SECRET}`)},'${vaultName}','Development billing worker authentication');
        elsif existing<>${quote(`Bearer ${env.BILLING_WORKER_SECRET}`)} then raise exception 'Worker secret drift';end if;
      end $$;
      select cron.schedule('${workerName}','* * * * *',${quote(workerSql)}) as job;
      commit;`,false)
    report.worker={name:workerName,job:deployed.find(row=>row.job!==undefined)?.job,schedule:'* * * * *',credential:'Vault reference only',verifiedInvocation:false}
    const denied=await fetch(`${developmentUrl}/functions/v1/billing`,{signal:AbortSignal.timeout(15000)});assert.equal(denied.status,401,'Unauthenticated endpoint did not fail authentication')
    const budgetAfter=await db.query('select environment,policy,limit_micro,spent_micro,blocked from ai_budget order by id');assert.deepEqual(budgetAfter,budgetBefore,'Billing rollout changed AI budget/policy')
    report.sourceMatched=true;report.unauthenticatedStatus=denied.status;report.aiUnchanged=true;report.providerEnvironment='test/sandbox';report.deployedAt=new Date().toISOString()
  }
  report.stage='complete';report.ok=true
}catch(error){report.error={type:error.name,code:error.code??null,message:/^AssertionError/.test(error.name)||/^Management [A-Z]+ \/[\w/?=-]+: HTTP \d+$/.test(error.message)?error.message:'development_deployment_incomplete'};process.exitCode=1}
await writeFile('output/tests/billing/desktop/edge-deployment.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
