/**
 * [INPUT]: Installer CLI, frozen failure cases, optional --private-readback and controlled loopback Management responses.
 * [OUTPUT]: Repeatable real-process/HTTP installation and unknown-outcome evidence, without real credentials.
 * [POS]: Installer E2E only; the separate PostgreSQL acceptance executes SQL semantics.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {ROOT,REF,URL,inputs,hash,json,JOBS,NAMES} from './source.mjs'
import {BASE,save} from './io.mjs'
const privateOnly=process.argv.length===3&&process.argv[2]==='--private-readback'
if(process.argv.length!==2&&!privateOnly)throw Error('invalid_arguments')
const id=randomUUID(),dir=resolve(BASE,`cli-${id}`),planDir=resolve(BASE,`plan-${id}`),source=await inputs(),checks=[],commands=[]
await mkdir(dir,{recursive:true,mode:0o700})
const env={SUPABASE_PROJECT_REF:REF,BILLING_CONFIG:JSON.stringify({environment:'production',account:'acct_1QvwdlITpGuR8ZMB',rcProject:'projd720c733',rcApp:'applivefixture',prices:{monthly:'price_LiveMonthlyFixture',annual:'price_LiveAnnualFixture'},portalConfiguration:'bpc_LiveFixture',returnUrl:'https://www.goalloom.com/billing/return/',cancelUrl:'https://www.goalloom.com/billing/continue/',webOrigin:'https://www.goalloom.com',automaticTax:false,taxRegistrationVerified:false}),
 BILLING_STRIPE_KEY:'rk_live_FixtureOnlyNeverReal',BILLING_STRIPE_WEBHOOK_SECRET:'whsec_FixtureOnlyNeverReal',BILLING_RC_PUBLIC_KEY:'rc_fixture_public',BILLING_RC_SECRET_KEY:'rc_fixture_private',BILLING_RC_WEBHOOK_SECRET:'r'.repeat(48),BILLING_WORKER_SECRET:'b'.repeat(48),LIFECYCLE_WORKER_SECRET:'l'.repeat(48),DELETION_LEDGER_URL:'https://ledger-fixture.example.test/',DELETION_LEDGER_TOKEN:'d'.repeat(48),DELETION_LEDGER_STORE_ID:'fixture-store',SNAPSHOT_PRODUCER_SHA256:source.edges.find(e=>e.slug==='snapshot-url').sha256}
const config=JSON.parse(env.BILLING_CONFIG),configPath=resolve(dir,'runtime.env')
const writeEnv=async(value,path=configPath)=>writeFile(path,Object.entries(value).map(([k,v])=>`${k}='${v}'`).join('\n')+'\n',{mode:0o600})
await writeEnv(env)
const state={history:13,protected:{budget:'a'.repeat(64),protection:'b'.repeat(64),actions:'c'.repeat(64),limits:'d'.repeat(64),workspaces:'e'.repeat(64),devices:'f'.repeat(64),authUsers:2,storageObjects:3},closed:true,
 edges:new Map([['hosted-ai',{source:'old-ai-source',verifyJwt:true}],['snapshot-url',{source:'old-snapshot-source',verifyJwt:true}]]),secrets:new Map([['HOSTED_AI_OPENROUTER_KEY',hash('never-a-real-key')]]),jobs:[],vault:false,bound:false,mutations:[],lose:null}
const originalJob={jobid:1,jobname:'goalloom-sync-runtime-cleanup',schedule:'*/5 * * * *',active:true,command_sha256:'0'.repeat(64)}
let healthData={version:1,environment:'production',serverNow:new Date().toISOString(),observation:{observedAt:new Date().toISOString(),retentionOk:true},workers:Object.fromEntries(['billing','lifecycle'].map(w=>[w,{lastComplete:new Date().toISOString(),recentFailures:0,unresolved:0,latestCounters:{}}])),billing:{overdueGrace:0,pendingCompensations:0},lifecycle:{overdueDeletion:0,deadlineRisk:0}}
const requests=[],vaultReads=[],healthReads=[]
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks),path=req.url.replace(`/v1/projects/${REF}`,'');requests.push({method:req.method,path})
  const send=value=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value))}
  const mutate=kind=>{state.mutations.push(kind);if(state.lose===kind){state.lose=null;res.destroy();return true}return false}
  if(req.headers.authorization!=='Bearer sbp_fixtureOnly')throw Error('real_credential_refused')
  if(path===''&&req.method==='GET')return send({id:REF,status:'ACTIVE_HEALTHY'})
  if(path==='/postgrest'&&req.method==='GET')return send({db_schema:'public,graphql_public'})
  if(path==='/functions'&&req.method==='GET')return send([...state.edges].map(([slug,e])=>({slug,version:1,status:'ACTIVE',verify_jwt:e.verifyJwt})))
  if(/^\/functions\/[a-z-]+\/body$/.test(path)){res.writeHead(200);return res.end(state.edges.get(path.split('/')[2]).source)}
  if(path==='/secrets'&&req.method==='GET')return send([...state.secrets].map(([name,value])=>({name,value})))
  if(path==='/secrets'&&req.method==='POST'){
   for(const row of JSON.parse(body))state.secrets.set(row.name,hash(row.value));if(mutate('secrets'))return;return send(null)
  }
  if(path.startsWith('/functions/deploy?slug=')&&req.method==='POST'){
   const form=await new Request('http://loopback/',{method:'POST',headers:req.headers,body}).formData(),m=JSON.parse(form.get('metadata')),slug=path.split('=')[1]
   assert.equal(m.name,slug);state.edges.set(slug,{source:await form.get('file').text(),verifyJwt:m.verify_jwt})
   if(mutate('edge:'+slug))return;return send({slug})
  }
  if(path==='/database/query'){
   const {query:sql,read_only:readOnly}=JSON.parse(body)
   if(sql.includes('from vault.decrypted_secrets')&&!sql.includes('vault.create_secret')){
    const sqlReadOnly=sql.startsWith('begin read only;')&&sql.endsWith(';commit;')
    vaultReads.push({apiReadOnly:readOnly,sqlReadOnly})
    if(readOnly){res.writeHead(400,{'content-type':'application/json'});return res.end(JSON.stringify({error:'vault_role_denied'}))}
    assert(sqlReadOnly);assert.equal(sql.split(';').filter(Boolean).length,3)
    assert(sql.includes("select name,encode(sha256(convert_to(decrypted_secret,'UTF8')),'hex') as digest"))
    return send(state.vault?['billing','lifecycle'].map(w=>({name:`goalloom-${w}-worker-auth-production`,digest:hash('Bearer '+env[w==='billing'?'BILLING_WORKER_SECRET':'LIFECYCLE_WORKER_SECRET'])})):[])
   }
   if(sql.includes('production_worker_health()')){
    const sqlReadOnly=sql==='begin read only;select service_private.production_worker_health() as health;commit;'
    healthReads.push({apiReadOnly:readOnly,sqlReadOnly})
    if(readOnly){res.writeHead(400,{'content-type':'application/json'});return res.end(JSON.stringify({error:'health_role_denied'}))}
    assert(sqlReadOnly);return send([{health:healthData}])
   }
   if(!readOnly){
    if(sql.includes('create table public.billing_policy')){assert(sql.includes('accepted_work_not_drained'));assert(sql.includes('protected_state_changed'));state.history=33;if(mutate('schema'))return;return send([])}
    if(sql.includes('vault.create_secret')){state.vault=true;state.bound=true;if(mutate('vault'))return;return send([])}
    if(sql.includes('cron.schedule(')){state.jobs=JOBS.map((j,i)=>({jobid:i+2,jobname:j.name,schedule:'* * * * *',active:false,command:j.command}));if(mutate('jobs'))return;return send([])}
    if(sql.includes('cron.alter_job(')){state.jobs.forEach(x=>x.active=false);if(mutate('pause'))return;return send([])}
    throw Error('unexpected_write')
   }
   if(sql.includes('select version,name,statements'))return send(source.migrations.slice(0,state.history).map(m=>({version:m.version,name:m.name,statements:[m.sql]})))
   if(sql.includes('select version,sha256 from service_private.migrations'))return send(source.migrations.slice(13).map(m=>({version:m.version,sha256:m.sha256})))
   if(sql.includes(' as protected;'))return send([{protected:state.protected}])
   if(sql.includes(' as digest from supabase_migrations'))return send([{digest:'1'.repeat(64)}])
   if(sql.includes(' as closed;'))return send([{closed:state.closed}])
   if(sql.includes('pg_stat_activity'))return send([{n:0}])
   if(sql.includes('select jobid,jobname,schedule,active,'))return send([originalJob,...state.jobs.map(({command,...r})=>({...r,command_sha256:hash(command)}))])
   if(sql.includes('select jobname,schedule,active,command'))return send(state.jobs.map(({jobid,...r})=>r))
   if(sql.includes('cron.job_run_details'))return send(JOBS.map(j=>({jobname:j.name,status:'succeeded',start_time:new Date().toISOString(),end_time:new Date().toISOString()})))
   if(sql.includes('select account_id,rc_project,rc_app'))return send(state.bound?[{account_id:config.account,rc_project:config.rcProject,rc_app:config.rcApp,monthly_price:config.prices.monthly,annual_price:config.prices.annual,enabled:false}]:[])
   throw Error('unexpected_read')
  }
  throw Error('unexpected_route')
 }catch(error){res.writeHead(500);res.end(JSON.stringify({error:'fixture_failed'}));requests.push({fixtureFailure:error.name})}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const port=server.address().port,preload=resolve(dir,'preload.mjs')
await writeFile(preload,`import fs from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';import {resolve} from 'node:path';
const read=fs.readFile,realFetch=globalThis.fetch;let credentials=0,network=0;
fs.readFile=async function(path,...args){if(resolve(String(path))===${JSON.stringify(resolve(ROOT,'.env.deploy.production.local'))}){credentials++;return 'SUPABASE_PROJECT_REF=${REF}\\nSUPABASE_ACCESS_TOKEN=sbp_fixtureOnly\\n'}if(/\\.env(?:\\.|$)/.test(String(path))&&!String(path).includes(${JSON.stringify(dir)}))throw Error('credential_firewall');return read.call(this,path,...args)};syncBuiltinESMExports();
globalThis.fetch=async function(url,init){const u=new URL(String(url));if(u.origin!=='https://api.supabase.com'||!u.pathname.startsWith('/v1/projects/${REF}'))throw Error('network_firewall');if(init?.headers?.authorization!=='Bearer sbp_fixtureOnly')throw Error('credential_firewall');if(process.env.BILL29_PRIVATE_READONLY_ROLE==='1'&&u.pathname.endsWith('/database/query')){const body=JSON.parse(init.body);if(body.query.includes('production_worker_health()')||body.query.includes('from vault.decrypted_secrets')&&!body.query.includes('vault.create_secret'))init={...init,body:JSON.stringify({...body,read_only:true})}}network++;return realFetch('http://127.0.0.1:${port}'+u.pathname+u.search,init)};
process.on('exit',()=>{process.stderr.write(JSON.stringify({fixture:true,credentials,network})+'\\n')});`,{mode:0o600})
async function cli(args,{privateReadOnlyRole=false}={}){
 const result=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--import',preload,'scripts/billing/production/install/cli.mjs',...args],{cwd:ROOT,env:{...process.env,NODE_OPTIONS:'',BILL29_PRIVATE_READONLY_ROLE:privateReadOnlyRole?'1':'0'},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);p.on('error',reject);p.on('close',code=>resolve({code,stdout,stderr}))})
 const stats=JSON.parse(result.stderr.trim().split('\n').at(-1)),line=result.stdout.trim().split('\n').at(-1);let report;try{report=JSON.parse(line)}catch{report={help:line}}
 commands.push({args:args.map(a=>a===configPath?'<synthetic-private-config>':a),exit:result.code,report,stats});return{...result,report,stats}
}
const verify=(name,fn)=>{fn();checks.push(name)}
async function verifyVault(base){
 state.lose='vault';let r=await cli(['--apply',planDir,'--stage','vault',...base,'--config',configPath]);verify('vault_response_loss_preserves_original_intent',()=>{assert.equal(r.report.code,'management_transport');assert(r.report.writeDispatched)})
 r=await cli(['--check',planDir,'--stage','vault',...base,'--config',configPath],{privateReadOnlyRole:true})
 verify('vault_api_readonly_role_denied_without_write_replay',()=>{assert.equal(r.report.code,'management_http');assert.equal(r.report.httpStatus,400);assert.equal(r.report.writeDispatched,false);assert.equal(state.mutations.filter(x=>x==='vault').length,1);assert(vaultReads.some(x=>x.apiReadOnly))})
 r=await cli(['--check',planDir,'--stage','vault',...base,'--config',configPath]);verify('atomic_disabled_source_and_separate_vault_readback',()=>{assert(r.report.ok);assert(r.report.result.vaultMatched);assert(r.report.result.disabledSourceMatched);assert.equal(state.mutations.filter(x=>x==='vault').length,1)})
 verify('vault_operator_digest_read_is_sql_readonly',()=>{assert(vaultReads.some(x=>!x.apiReadOnly));assert(vaultReads.every(x=>x.sqlReadOnly))})
 r=await cli(['--apply',planDir,'--stage','vault',...base,'--config',configPath]);verify('second_vault_apply_refused',()=>{assert.equal(r.report.code,'stage_intent_exists');assert.equal(state.mutations.filter(x=>x==='vault').length,1)})
}
async function verifyPrivateHealth(){
 const mutations=state.mutations.length
 let r=await cli(['--health'],{privateReadOnlyRole:true})
 verify('health_api_readonly_role_denied_without_mutation',()=>{assert.equal(r.report.code,'management_http');assert.equal(r.report.httpStatus,400);assert.equal(r.report.writeDispatched,false);assert.equal(state.mutations.length,mutations)})
 r=await cli(['--health'])
 verify('health_operator_sql_readonly_preserves_non_green_alerts',()=>{
  assert.equal(r.code,1);assert.equal(r.report.ok,false);assert.equal(r.report.productionWrites,0);assert.equal(state.mutations.length,mutations)
  for(const name of JOBS.map(j=>`${j.name}_inactive_or_changed`).concat('billing_completion_stale','billing_http_failure'))assert(r.report.alerts.includes(name))
  assert(healthReads.some(x=>x.apiReadOnly));assert(healthReads.some(x=>!x.apiReadOnly));assert(healthReads.every(x=>x.sqlReadOnly))
 })
}
let finalReport
try{
 let plan
 if(privateOnly){
  let r=await cli(['--plan',planDir]);assert(r.report.ok)
  plan=JSON.parse(await readFile(resolve(planDir,'plan.json'),'utf8'))
  r=await cli(['--inspect',planDir]);assert(r.report.ok)
  const base=['--baseline',r.report.file,'--reviewed',r.report.reviewedHash]
  state.history=33;for(const name of NAMES)state.secrets.set(name,hash(env[name]))
  await verifyVault(base)
  state.jobs=JOBS.map((j,i)=>({jobid:i+2,jobname:j.name,schedule:'* * * * *',active:false,command:j.command}))
  healthData.workers.billing.lastComplete=null;healthData.workers.billing.recentFailures=2
  await verifyPrivateHealth()
 }else{
 let r=await cli([]);verify('default_help_no_credentials_or_network',()=>{assert.equal(r.code,0);assert.equal(r.stats.credentials,0);assert.equal(r.stats.network,0)})
 r=await cli(['--apply',planDir]);verify('missing_review_refused_before_credentials',()=>{assert.equal(r.report.code,'reviewed_hash_required');assert.equal(r.stats.credentials,0)})
 r=await cli(['--plan',planDir]);verify('offline_exact_artifacts',()=>{assert(r.report.ok);assert.equal(r.report.migrations,20);assert.equal(r.stats.credentials,0);assert.equal(r.stats.network,0)})
 plan=JSON.parse(await readFile(resolve(planDir,'plan.json'),'utf8'))
 r=await cli(['--inspect',planDir]);assert(r.report.ok);const inspection=r.report,base=['--baseline',inspection.file,'--reviewed',inspection.reviewedHash]
 verify('actual_cli_readonly_http_inspection',()=>{assert(r.stats.network>0);assert.equal(state.mutations.length,0);assert.equal(r.report.productionWrites,0)})
 r=await cli(['--apply',planDir,'--stage','schema',...base]);verify('maintenance_decision_before_credentials',()=>{assert.equal(r.report.code,'maintenance_required');assert.equal(r.stats.credentials,0)})
 const artifact=resolve(planDir,'billing.ts'),original=await readFile(artifact,'utf8');await writeFile(artifact,original+'\n')
 r=await cli(['--inspect',planDir]);verify('bundle_drift_before_credentials',()=>{assert.equal(r.report.code,'source_changed');assert.equal(r.stats.credentials,0)});await writeFile(artifact,original)
 state.lose='schema';r=await cli(['--apply',planDir,'--stage','schema',...base,'--maintenance','coordinated-cloud-cutover'])
 verify('lost_schema_response_preserves_intent',()=>{assert.equal(r.report.code,'management_transport');assert.equal(state.mutations.filter(x=>x==='schema').length,1)})
 r=await cli(['--check',planDir,'--stage','schema',...base]);verify('unknown_schema_resolved_by_history_not_replay',()=>{assert(r.report.ok);assert(r.report.result.protectedStateMatched);assert.equal(state.mutations.filter(x=>x==='schema').length,1)})
 r=await cli(['--apply',planDir,'--stage','schema',...base,'--maintenance','coordinated-cloud-cutover']);verify('second_schema_apply_refused',()=>{assert.equal(r.report.code,'stage_intent_exists');assert.equal(state.mutations.filter(x=>x==='schema').length,1)})
 const testConfig=resolve(dir,'test.env');await writeEnv({...env,BILLING_STRIPE_KEY:'rk_test_FixtureOnly'},testConfig)
 r=await cli(['--apply',planDir,'--stage','secrets',...base,'--config',testConfig]);verify('test_key_refused_for_production',()=>{assert.equal(r.report.code,'invalid_runtime_config');assert(!state.mutations.includes('secrets'))})
 await chmod(configPath,0o644);r=await cli(['--apply',planDir,'--stage','secrets',...base,'--config',configPath]);verify('unsafe_private_file_refused',()=>assert.equal(r.report.code,'unsafe_private_config'));await chmod(configPath,0o600)
 state.secrets.set('BILLING_WORKER_SECRET',hash('existing-different'));r=await cli(['--apply',planDir,'--stage','secrets',...base,'--config',configPath]);verify('existing_secret_not_silently_replaced',()=>assert.equal(r.report.code,'secret_drift'))
 state.lose='secrets';r=await cli(['--apply',planDir,'--stage','secrets',...base,'--config',configPath,'--replace-secret','BILLING_WORKER_SECRET']);verify('lost_secret_upload_not_replayed',()=>{assert.equal(r.report.code,'management_transport');assert.equal(state.mutations.filter(x=>x==='secrets').length,1)})
 r=await cli(['--check',planDir,'--stage','secrets',...base,'--config',configPath]);verify('secret_digest_readback_and_unrelated_preservation',()=>{assert(r.report.ok);assert(r.report.result.unrelatedSecretsMatched)})
 await verifyVault(base)
 for(const edge of source.edges){
  if(edge.slug==='lifecycle')state.lose='edge:lifecycle'
  r=await cli(['--apply',planDir,'--stage','edge:'+edge.slug,...base])
  if(edge.slug==='lifecycle'){
   verify('lost_edge_deployment_response_preserves_intent',()=>{assert.equal(r.report.code,'management_transport');assert(r.report.writeDispatched)})
   r=await cli(['--check',planDir,'--stage','edge:'+edge.slug,...base])
  }
  verify('downloaded_source_and_jwt_'+edge.slug,()=>{assert(r.report.ok);assert.equal(r.report.result.state.sha256,edge.sha256);assert.equal(r.report.result.state.verifyJwt,edge.verifyJwt)})
 }
 state.lose='jobs';r=await cli(['--apply',planDir,'--stage','jobs',...base]);verify('job_setup_unknown_response_not_retried',()=>{assert.equal(r.report.code,'management_transport');assert.equal(state.mutations.filter(x=>x==='jobs').length,1)})
 r=await cli(['--check',planDir,'--stage','jobs',...base]);verify('three_exact_minute_jobs_inactive_and_old_job_preserved',()=>{assert(r.report.ok);assert(r.report.oldCronUnchanged);assert.equal(r.report.result.jobs.length,3);assert(r.report.result.jobs.every(j=>!j.active))})
 state.jobs.forEach(j=>j.active=true)
 r=await cli(['--health']);verify('healthy_completion_readonly',()=>{assert(r.report.ok);assert.equal(r.report.productionWrites,0);assert.equal(r.report.providerRetryAlignmentVerified,false)})
 healthData.workers.billing.lastComplete='2020-01-01T00:00:00Z';healthData.billing.overdueGrace=1;healthData.lifecycle.deadlineRisk=1;healthData.workers.lifecycle.latestCounters={pending:1}
 r=await cli(['--health']);verify('outage_original_72h_cutoff_and_cleanup_risk_observable',()=>{assert.equal(r.code,1);for(const alert of ['billing_completion_stale','billing_overdueGrace','lifecycle_deadlineRisk','lifecycle_work_pending'])assert(r.report.alerts.includes(alert))})
 r=await cli(['--apply',planDir,'--stage','pause',...base]);verify('exact_jobs_can_pause_without_other_cron_change',()=>assert(r.report.ok))
 }
 const serialized=JSON.stringify(commands)
 verify('no_secret_values_in_reports',()=>{for(const name of NAMES.filter(n=>!['BILLING_CONFIG','DELETION_LEDGER_URL','DELETION_LEDGER_STORE_ID','SNAPSHOT_PRODUCER_SHA256'].includes(n)))assert(!serialized.includes(env[name]))})
 verify('no_provider_or_production_network_and_no_activation',()=>{assert(!requests.some(r=>r.fixtureFailure));assert(state.closed);assert(state.jobs.every(j=>j.active===false));assert(!state.mutations.includes('activation'))})
 finalReport={ok:true,checks:checks.length,names:checks,scope:privateOnly?'Focused private-readback CLI child processes and loopback HTTP; controlled role differences, digest-only Vault recovery, original-intent replay refusal and non-green health metadata. No PostgreSQL or production acceptance.':'Actual CLI child processes and loopback HTTP; controlled Management metadata/write results, not PostgreSQL or production acceptance.',runtime:{node:process.version,platform:process.platform,arch:process.arch},planSha256:plan.sha256,requests:requests.length,vaultReads,healthReads,realCredentialReads:0,productionWrites:0,providerCalls:0,modelCalls:0,commands}
}catch(error){finalReport={ok:false,checks:checks.length,names:checks,error:{type:error.name,code:error.code??null},commands};process.exitCode=1}
finally{await new Promise(resolve=>server.close(resolve));await save(resolve(dir,'report.json'),finalReport);console.log(JSON.stringify({ok:finalReport.ok,checks:finalReport.checks,path:resolve(dir,'report.json')}))}
