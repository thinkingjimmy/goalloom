/**
 * [INPUT]: Recovery CLI, synthetic owner metadata and loopback-only Management responses.
 * [OUTPUT]: Real-process inspection/refusal/package artifacts without real credential/provider/production access.
 * [POS]: Recovery operator-tool E2E. SQL generation is inspected, not executed in PostgreSQL.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {ROOT,REF,JOBS,inputs,hash,json} from '../source.mjs'
import {save} from '../io.mjs'
import {OUTPUT} from './recovery.mjs'
const id=randomUUID(),out=resolve(OUTPUT,`acceptance-${id}`),source=await inputs(),commands=[],checks=[],requests=[]
await mkdir(out,{recursive:true,mode:0o700})
const original={serverNow:new Date().toISOString(),postgres:'PostgreSQL fixture 17',policy:{id:1,environment:'production',project_ref:REF,enabled:false,min_service_version:2,source_fingerprint:null},
 billingPolicy:{environment:'production',enabled:false,version:1,trial_hours:192,grace_hours:72,retention_hours:720,online_delete_hours:168,backup_hours:840,discounts:false},
 lifecycle:{id:1,enabled:false,independent_ledger_ready:false,restore_admission_ready:false,cleanup_wiring_ready:false,restore_blocked:false},
 source:{environment:'production',source:'stripe',enabled:false,account_id:'acct_1QvwdlITpGuR8ZMB',rc_project:'projd720c733',rc_app:'app31d218cbde',monthly_price:'price_1UUS1EITpGuR8ZMB0dLbeL23',annual_price:'price_1UUS1OITpGuR8ZMBkPCS02CR',currency:'usd',monthly_cents:899,annual_cents:7900,inclusive:true},
 transferDrain:{id:1,verified:false},jobs:JOBS.map(j=>({name:j.name,schedule:'* * * * *',active:false,command:j.command})).sort((a,b)=>a.name.localeCompare(b.name)),
 otherJobs:[{name:'goalloom-sync-runtime-cleanup',schedule:'*/5 * * * *',active:true,commandHash:'a'.repeat(64)}],
 counts:{authUsers:3,sessions:1,workspaces:2,devices:2,storageObjects:0,billingAccounts:0,billingInbox:0,deletionRequests:0,transfers:0,unresolvedAI:0},
 lifecycleStates:[{state:'retained',boundaryVerified:false,profileVerified:true,count:2}],health:{version:1,billing:{},lifecycle:{},workers:{}},empty:true,queuedWorkers:0,unresolvedDispatches:0,
 protected:{budget:'b'.repeat(64),workspaces:'c'.repeat(64),devices:'d'.repeat(64),authUsers:3,storageObjects:0},lifecycleKeyDigest:'e'.repeat(64),
 history:source.migrations.map(({version,name,sha256})=>({version,name,sha256})),privateHistory:source.migrations.slice(13).map(({version,sha256})=>({version,sha256}))}
let state=structuredClone(original),drift=false,authExpiry=3600,transportFailure=false,privateSchema=false
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks),path=req.url.replace(`/v1/projects/${REF}`,'');requests.push({method:req.method,path})
  assert.equal(req.headers.authorization,'Bearer sbp_recoveryFixtureOnly')
  const send=value=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value))}
  if(transportFailure){res.destroy();return}
  if(req.method==='GET'&&path==='')return send({id:REF,status:'ACTIVE_HEALTHY'})
  if(req.method==='GET'&&path==='/config/auth')return send({jwt_exp:authExpiry,unloggedFixtureSecret:'auth-response-private-marker'})
  if(req.method==='GET'&&path==='/postgrest')return send({db_schema:privateSchema?'public,service_private':'public,graphql_public'})
  if(req.method==='GET'&&path==='/functions')return send(source.edges.map(e=>({slug:e.slug,verify_jwt:e.verifyJwt,status:'ACTIVE',version:1})))
  if(req.method==='GET'&&/^\/functions\/[a-z-]+\/body$/.test(path)){
   const edge=source.edges.find(e=>e.slug===path.split('/')[2]);res.writeHead(200);res.end(edge.source+(drift?'\n// fixture drift':''));return
  }
  if(req.method==='POST'&&path==='/database/query'){
   const body=JSON.parse(bytes);assert.equal(body.read_only,false);assert(body.query.startsWith('begin read only;'));assert(body.query.endsWith(';commit;'))
   assert(!/\b(insert|update|delete|alter|drop|create|truncate)\b/i.test(body.query));assert(body.query.includes(' as state;'))
   return send([{state}])
  }
  throw Error('fixture_unexpected_request')
 }catch{res.writeHead(500);res.end('{"error":"fixture_refused"}')}
})
await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done)})
const preload=resolve(out,'preload.mjs'),fixtureEnv=resolve(out,'operator.env'),operator=resolve(ROOT,'.env.deploy.production.local')
await writeFile(fixtureEnv,`SUPABASE_PROJECT_REF=${REF}\nSUPABASE_ACCESS_TOKEN=sbp_recoveryFixtureOnly\n`,{mode:0o600})
await writeFile(preload,`import fs from 'node:fs/promises';import{syncBuiltinESMExports}from'node:module';import{resolve}from'node:path';
const read=fs.readFile,lstat=fs.lstat,realpath=fs.realpath,network=globalThis.fetch,operator=${JSON.stringify(operator)},fixture=${JSON.stringify(fixtureEnv)},out=${JSON.stringify(out)};let reads=0,calls=0;
fs.lstat=(p,...a)=>lstat(resolve(String(p))===operator?fixture:p,...a);fs.realpath=async(p,...a)=>resolve(String(p))===operator?operator:realpath(p,...a);
fs.readFile=(p,...a)=>{const path=resolve(String(p));if(path===operator){reads++;return read(fixture,...a)}if(path.includes('/.env')&&!path.startsWith(out+'/'))throw Error('credential_firewall');return read(p,...a)};syncBuiltinESMExports();
globalThis.fetch=(url,options)=>{const u=new URL(String(url));if(u.origin!=='https://api.supabase.com'||!u.pathname.startsWith('/v1/projects/${REF}'))throw Error('network_firewall');calls++;return network('http://127.0.0.1:${server.address().port}'+u.pathname+u.search,options)};
process.on('exit',()=>process.stderr.write(JSON.stringify({syntheticCredentialReads:reads,network:calls,realCredentialReads:0})+'\\n'));`,{mode:0o600})
async function cli(args,script='scripts/billing/production/install/operations/recovery.mjs'){
 const result=await new Promise((done,fail)=>{const p=spawn(process.execPath,['--import',preload,script,...args],{cwd:ROOT,env:{...process.env,NODE_OPTIONS:''},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',c=>stdout+=c);p.stderr.on('data',c=>stderr+=c);p.on('error',fail);p.on('close',exit=>done({exit,stdout,stderr}))})
 const stats=JSON.parse(result.stderr.trim().split('\n').at(-1));let report;try{report=JSON.parse(result.stdout.trim())}catch{report={help:true}}
 commands.push({script,args,exit:result.exit,report,stats});return{...result,report,stats}
}
const mark=name=>checks.push(name)
const newDirectory=()=>resolve(OUTPUT,`window-fixture-${randomUUID()}`)
let report
try{
 let r=await cli([]);assert.equal(r.exit,0);assert.equal(r.stats.network,0);assert.equal(r.stats.syntheticCredentialReads,0);mark('help_reads_no_credential_or_network')
 r=await cli(['--apply','unused']);assert.equal(r.report.code,'invalid_arguments');assert.equal(r.stats.network,0);mark('apply_activation_and_write_dispatch_not_supported')
 const routeTest=resolve(out,'auth-config-write.mjs');await writeFile(routeTest,`import{client}from${JSON.stringify(resolve(ROOT,'scripts/billing/production/install/client.mjs'))};try{await(await client()).request('/config/auth',{method:'PATCH',json:{jwt_exp:1}});process.exitCode=1}catch(e){console.log(JSON.stringify({code:e.message}))}`)
 r=await cli([],routeTest);assert.equal(r.report.code,'invalid_arguments');assert.equal(r.stats.network,0);mark('auth_config_mutation_refused_before_network')
 r=await cli(['--inspect']);assert.equal(r.exit,0);assert.deepEqual(r.report.blockers,[]);assert(r.report.readOnly);const inspectionPath=r.report.path,inspection=JSON.parse(await readFile(inspectionPath,'utf8'))
 assert.equal(inspection.jwtExpirySeconds,3600);assert.equal(inspection.state.counts.authUsers,3);assert.equal(inspection.state.counts.workspaces,2);assert.equal(inspection.legacyDrainVerified,false);assert.equal(inspection.naturalExpiryObserved,false);mark('real_process_readonly_inspection_preserves_nonempty_owner_metadata_and_honest_drain_status')
 assert(!(await readFile(inspectionPath,'utf8')).includes('auth-response-private-marker'));mark('auth_full_config_and_credentials_never_enter_evidence')
 const planDir=newDirectory();r=await cli(['--plan',inspectionPath,'--output',planDir]);assert.equal(r.exit,0);assert.equal(r.stats.network,0);assert.equal(r.stats.syntheticCredentialReads,0)
 const plan=JSON.parse(await readFile(resolve(planDir,'plan.json'),'utf8'));assert.match(plan.exposure,/Authenticated billing.*Checkout/);assert.match(plan.duration,/not a hard HTTP admission lease/);assert.equal(plan.activationExecuted,false);assert.equal(plan.launchReady,false);mark('offline_immutable_package_declares_authenticated_billing_exposure')
 const files={};for(const name of ['arm','restore','finalize','read']){files[name]=await readFile(resolve(planDir,`${name}.sql`),'utf8');assert.equal(hash(files[name]),plan.sql[name].sha256)}
 assert.match(files.arm,/inspection_stale/);assert.match(files.arm,/current_query\(\)/);assert.match(files.arm,/enabled=true where environment='production'/);assert(!/update service_private\.(policy|lifecycle_policy)|vault\.|auth\.users set|delete from|create table|cron\.schedule\(/i.test(files.arm));assert.match(files.restore,/worker_job_drift/);assert.match(files.restore,/enabled=false where environment='production'/);assert.match(files.finalize,/worker_response_pending/);assert.match(files.read,/responsePresent/);assert(!files.read.includes('r.content'));mark('sql_artifacts_bound_expiry_exact_jobs_protected_state_and_body_free_response_readback')
 r=await cli(['--plan',inspectionPath,'--output',planDir]);assert.equal(r.report.code,'evidence_exists');mark('package_is_exclusive_and_cannot_overwrite_a_reviewed_plan')
 for(const [name,change,blocker] of [
  ['pending',s=>{s.empty=false},'original_work_not_empty'],['unknown_response',s=>{s.unresolvedDispatches=1},'original_work_not_empty'],
  ['open_billing',s=>{s.billingPolicy.enabled=true},'billing_policy_not_closed'],['open_cloud',s=>{s.policy.enabled=true},'service_policy_changed'],
  ['restore_barrier',s=>{s.lifecycle.restore_blocked=true},'lifecycle_not_closed'],['job_drift',s=>{s.jobs[0].command='select 1;'},'worker_job_drift'],
  ['wrong_source',s=>{s.source.rc_app='appforeign'},'source_binding_changed']]){
  state=structuredClone(original);change(state);r=await cli(['--inspect']);assert.equal(r.exit,0);assert(r.report.blockers.includes(blocker));const denied=await cli(['--plan',r.report.path,'--output',newDirectory()]);assert.equal(denied.report.code,'window_blocked');assert.equal(denied.stats.network,0);mark(name+'_blocks_window_without_production_write')
 }
 state=structuredClone(original);drift=true;r=await cli(['--inspect']);assert(r.report.blockers.includes('current_deployed_source_mismatch'));drift=false;mark('downloaded_source_drift_is_not_hidden_by_local_hashes')
 state.history[32].sha256='0'.repeat(64);r=await cli(['--inspect']);assert.equal(r.report.code,'migration_history_changed');state=structuredClone(original);mark('actual_migration_statement_drift_refused')
 authExpiry=0;r=await cli(['--inspect']);assert.equal(r.report.code,'auth_lifetime_unverified');authExpiry=3600;mark('unknown_auth_expiry_is_never_assumed_one_hour')
 privateSchema=true;r=await cli(['--inspect']);assert.equal(r.report.code,'private_schema_exposed');privateSchema=false;mark('private_schema_exposure_refused')
 transportFailure=true;r=await cli(['--inspect']);assert.equal(r.report.code,'management_transport');transportFailure=false;mark('read_transport_failure_is_finite_without_mutation_or_replay')
 const forged=structuredClone(inspection);forged.state.source.enabled=true;const tampered=resolve(out,'tampered.json');await save(tampered,forged);r=await cli(['--plan',tampered,'--output',newDirectory()]);assert.equal(r.report.code,'inspection_changed');mark('inspection_tampering_refused_before_credentials')
 forged.sha256=hash(json(Object.fromEntries(Object.entries(forged).filter(([k])=>k!=='sha256'))));forged.manifest.continuation[0].sha256='0'.repeat(64);forged.sha256=hash(json(Object.fromEntries(Object.entries(forged).filter(([k])=>k!=='sha256'))));const changed=resolve(out,'source-changed.json');await save(changed,forged);r=await cli(['--plan',changed,'--output',newDirectory()]);assert.equal(r.report.code,'source_changed');mark('continuation_source_change_requires_new_inspection')
 report={ok:true,at:new Date().toISOString(),scope:'Real child-process/filesystem/loopback HTTP operator-tool E2E; generated SQL not executed in PostgreSQL',checks,commands,requests,platform:{node:process.version,os:process.platform,arch:process.arch},productionWrites:0,providerCalls:0,modelCalls:0,realCredentialReads:0,launchReady:false}
}finally{
 server.closeAllConnections();await new Promise(done=>server.close(done))
 if(report){await save(resolve(out,'report.json'),report);console.log(JSON.stringify({ok:true,checks:checks.length,evidence:resolve(out,'report.json'),productionWrites:0}))}
}
