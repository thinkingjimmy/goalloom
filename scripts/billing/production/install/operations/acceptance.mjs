/**
 * [INPUT]: Config/gateway CLIs, synthetic private handoffs and controlled loopback metadata/denials.
 * [OUTPUT]: Real-process/filesystem/HTTP E2E evidence with no real credential read, durable target write or production call.
 * [POS]: Focused operator-helper acceptance. It never starts Docker or reruns product suites.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {readFile,writeFile,mkdir,lstat,chmod} from 'node:fs/promises'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {ROOT,REF,URL as ORIGIN,MODES,inputs,hash,json} from '../source.mjs'
import {BASE,save} from '../io.mjs'
import {CASES} from './gateway.mjs'
const id=randomUUID(),out=resolve(BASE,`operations-${id}`),planDir=resolve(BASE,`operations-install-${id}`),source=await inputs(),checks=[],commands=[]
await mkdir(out,{mode:0o700})
const target=resolve(ROOT,'.env.billing.production.local'),fixtureTarget=resolve(out,'durable.env'),provider=resolve(out,'provider.env'),ledger=resolve(out,'ledger.env')
const env={SUPABASE_PROJECT_REF:REF,BILLING_CONFIG:JSON.stringify({environment:'production',account:'acct_1QvwdlITpGuR8ZMB',rcProject:'projd720c733',rcApp:'applivefixture',prices:{monthly:'price_LiveMonthlyFixture',annual:'price_LiveAnnualFixture'},portalConfiguration:'bpc_LiveFixture',returnUrl:'https://www.goalloom.com/billing/return/',cancelUrl:'https://www.goalloom.com/billing/continue/',webOrigin:'https://www.goalloom.com',automaticTax:false,taxRegistrationVerified:false}),BILLING_STRIPE_KEY:'rk_live_FixtureOnlyNeverReal',BILLING_STRIPE_WEBHOOK_SECRET:'whsec_FixtureOnlyNeverReal',BILLING_RC_PUBLIC_KEY:'fixture_public_sdk',BILLING_RC_SECRET_KEY:'fixture_rc_secret',BILLING_RC_WEBHOOK_SECRET:'r'.repeat(48),BILLING_WORKER_SECRET:'b'.repeat(48),LIFECYCLE_WORKER_SECRET:'l'.repeat(48),DELETION_LEDGER_URL:'https://ledger-fixture.example.test/',DELETION_LEDGER_TOKEN:'d'.repeat(48),DELETION_LEDGER_STORE_ID:'fixture-store'}
const encodeEnv=value=>Object.entries(value).map(([k,v])=>`${k}='${v}'`).join('\n')+'\n'
const providerValues=Object.fromEntries(Object.entries(env).filter(([k])=>!k.startsWith('DELETION_'))),ledgerValues=Object.fromEntries(Object.entries(env).filter(([k])=>k.startsWith('DELETION_')))
await writeFile(provider,encodeEnv({...providerValues,STRIPE_OPERATOR_KEY:'excluded-operator-fixture'}),{mode:0o600});await writeFile(ledger,encodeEnv(ledgerValues),{mode:0o600})
const state={closed:true,empty:true,manualWrongLayer:false,large:false,mutates:false,reads:0},requests=[]
const server=createServer(async(req,res)=>{
 const chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks),isManagement=req.url.startsWith('/v1/projects/'),path=isManagement?req.url.replace('/v1/projects/'+REF,''):req.url.replace('/functions/v1/','')
 const authorization=req.headers.authorization??''
 requests.push({method:req.method,path,management:isManagement,emptyBody:!bytes.length||bytes.toString()==='{}',authKind:!authorization?'missing':authorization==='Bearer invalid-production-probe-credential'?'wrong_worker':authorization.split('.').length===3?'forged':'operator'})
 const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value))}
 if(isManagement){
  if(req.headers.authorization!=='Bearer sbp_fixtureOnly')return send(500,{error:'fixture_credential_failure'})
  if(path==='')return send(200,{id:REF,status:'ACTIVE_HEALTHY'})
  if(path==='/functions')return send(200,MODES.map(([slug,jwt])=>({slug,status:'ACTIVE',verify_jwt:jwt})))
  if(path==='/database/query'){
   const body=JSON.parse(bytes);if(body.read_only!==true)return send(500,{error:'write_refused'})
   const sql=body.query
   if(sql.includes(' as closed;'))return send(200,[{closed:state.closed}])
   if(sql.includes(' as empty;'))return send(200,[{empty:state.empty}])
   if(sql.includes('select version,sha256'))return send(200,source.migrations.slice(13).map(m=>({version:m.version,sha256:m.sha256})))
   if(sql.includes(' as protected;')){state.reads++;return send(200,[{protected:{budget:(state.mutates&&state.reads>1?'b':'a').repeat(64),protection:'c'.repeat(64)}}])}
  }
  return send(500,{error:'fixture_route_failure'})
 }
 const test=CASES.find(c=>c.path===path&&c.method===req.method)
 if(!test)return send(500,{error:'fixture_unknown_probe'})
 if(state.manualWrongLayer&&path==='lifecycle/status')return send(401,{code:401,message:'handler_not_reached'})
 if(state.large&&path==='billing/stripe'){res.writeHead(401);return res.end('unlogged-marker'.repeat(400))}
 return send(test.status,test.code?{error:test.code}:{code:401,message:'gateway_denial'})
})
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
const preload=resolve(out,'preload.mjs'),port=server.address().port
await writeFile(preload,`import fs from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';import {resolve} from 'node:path';
const original={readFile:fs.readFile,lstat:fs.lstat,open:fs.open,realpath:fs.realpath},realFetch=globalThis.fetch,target=${JSON.stringify(target)},fixture=${JSON.stringify(fixtureTarget)},root=${JSON.stringify(ROOT)},dir=${JSON.stringify(out)};let credentials=0,network=0,writes=0;
const mapped=p=>resolve(String(p))===target?fixture:p;
fs.lstat=(p,...a)=>original.lstat(mapped(p),...a);
fs.realpath=async(p,...a)=>resolve(String(p))===target?target:original.realpath(p,...a);
fs.readFile=async(p,...a)=>{if(resolve(String(p))===${JSON.stringify(resolve(ROOT,'.env.deploy.production.local'))}){credentials++;return 'SUPABASE_PROJECT_REF=${REF}\\nSUPABASE_ACCESS_TOKEN=sbp_fixtureOnly\\n'}if(resolve(String(p))===target)return original.readFile(fixture,...a);if(String(p).includes('/.env')&&!String(p).startsWith(dir+'/'))throw Error('credential_firewall');return original.readFile(p,...a)};
fs.open=async(p,...a)=>{const pathname=resolve(String(p));const file=await original.open(pathname===target?fixture:pathname===root?dir:p,...a);if(pathname===target&&String(a[0]).includes('w'))writes++;if(pathname===root&&process.env.CUSTODY_FAIL_ACK==='1'){const sync=file.sync.bind(file);file.sync=async()=>{await sync();throw Error('synthetic_ack_loss')}}return file};syncBuiltinESMExports();
globalThis.fetch=(url,init)=>{const u=new URL(String(url));if(u.origin==='https://api.supabase.com'&&u.pathname.startsWith('/v1/projects/${REF}')){if(init?.headers?.authorization!=='Bearer sbp_fixtureOnly')throw Error('credential_firewall')}else if(u.origin!==${JSON.stringify(ORIGIN)}||!u.pathname.startsWith('/functions/v1/'))throw Error('network_firewall');network++;return realFetch('http://127.0.0.1:${port}'+u.pathname+u.search,init)};
process.on('exit',()=>process.stderr.write(JSON.stringify({fixture:true,syntheticCredentialReads:credentials,network,targetWritesMappedToFixture:writes})+'\\n'));`,{mode:0o600})
const configCli='scripts/billing/production/install/operations/persist-config.mjs',gatewayCli='scripts/billing/production/install/operations/gateway.mjs'
async function cli(script,args,extra={}){
 const result=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--import',preload,script,...args],{cwd:ROOT,env:{...process.env,NODE_OPTIONS:'',...extra},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);p.on('error',reject);p.on('close',exit=>resolve({exit,stdout,stderr}))})
 const stats=JSON.parse(result.stderr.trim().split('\n').at(-1));let report;try{report=JSON.parse(result.stdout.trim())}catch{report={help:true}}
 commands.push({script,args,exit:result.exit,report,stats});return{...result,report,stats}
}
const check=(name,fn)=>{fn();checks.push(name)}
let report
try{
 let r=await cli(configCli,[]);check('config_help_no_private_read_or_network',()=>{assert.equal(r.exit,0);assert.equal(r.stats.syntheticCredentialReads,0);assert.equal(r.stats.network,0)})
 const incomplete=resolve(out,'incomplete.env');await writeFile(incomplete,encodeEnv(providerValues),{mode:0o600})
 r=await cli(configCli,['--save','--source',incomplete]);check('incomplete_merge_refused_before_destination_write',()=>{assert.equal(r.report.code,'invalid_runtime_config');assert.equal(r.stats.targetWritesMappedToFixture,0)})
 const saveArgs=['--save','--source',provider,'--source',ledger]
 r=await cli(configCli,saveArgs,{CUSTODY_FAIL_ACK:'1'});check('lost_save_ack_retains_original_durable_copy',()=>{assert.equal(r.report.ok,false);assert.equal(r.stats.targetWritesMappedToFixture,1)})
 r=await cli(configCli,['--verify']);check('private_readback_resolves_save_without_rewrite',()=>{assert(r.report.ok);assert(r.report.privateReadbackMatched);assert.equal(r.stats.targetWritesMappedToFixture,0)})
 const before=await lstat(fixtureTarget),beforeBytes=await readFile(fixtureTarget)
 r=await cli(configCli,saveArgs);check('identical_config_is_idempotent',()=>{assert(r.report.ok);assert.equal(r.report.created,false);assert.equal(r.report.names,13);assert.equal(r.stats.targetWritesMappedToFixture,0)})
 check('operator_key_excluded_and_exact0600',()=>{assert(!beforeBytes.toString().includes('excluded-operator-fixture'));assert.equal(before.mode&0o777,0o600)})
 const different=resolve(out,'different.env');await writeFile(different,encodeEnv({...providerValues,BILLING_RC_SECRET_KEY:'different-valid-fixture'}),{mode:0o600})
 r=await cli(configCli,['--save','--source',different,'--source',ledger]);check('different_existing_target_never_overwritten',()=>{assert.equal(r.report.code,'private_target_differs');assert.equal(r.stats.targetWritesMappedToFixture,0)})
 const conflict=resolve(out,'conflict.env');await writeFile(conflict,encodeEnv({...ledgerValues,BILLING_WORKER_SECRET:'x'.repeat(48)}),{mode:0o600})
 r=await cli(configCli,['--save','--source',provider,'--source',conflict]);check('conflicting_sources_refused',()=>assert.equal(r.report.code,'private_input_conflict'))
 await chmod(provider,0o644);r=await cli(configCli,saveArgs);check('unsafe_source_refused',()=>assert.equal(r.report.code,'unsafe_private_config'));await chmod(provider,0o600)
 await chmod(fixtureTarget,0o644);r=await cli(configCli,['--verify']);check('unsafe_target_not_chmodded_or_read_as_valid',()=>assert.equal(r.report.code,'unsafe_private_config'));await chmod(fixtureTarget,0o600)
 const afterBytes=await readFile(fixtureTarget),afterStat=await lstat(fixtureTarget)
 check('target_content_and_inode_preserved',()=>{assert.equal(hash(afterBytes),hash(beforeBytes));assert.equal(afterStat.ino,before.ino)})
 r=await cli('scripts/billing/production/install/cli.mjs',['--plan',planDir]);assert(r.report.ok)
 r=await cli(gatewayCli,['--plan',planDir]);check('gateway_plan_offline',()=>{assert(r.report.ok);assert.equal(r.report.cases,12);assert.equal(r.stats.network,0);assert.equal(r.stats.syntheticCredentialReads,0)})
 const gatewayPlan=r.report,runArgs=['--run',gatewayPlan.path,'--reviewed',gatewayPlan.reviewedHash]
 r=await cli(gatewayCli,['--run',gatewayPlan.path]);check('gateway_requires_review_before_credentials',()=>{assert.equal(r.report.code,'invalid_arguments');assert.equal(r.stats.syntheticCredentialReads,0)})
 state.reads=0;r=await cli(gatewayCli,runArgs);check('twelve_actual_http_denial_journeys_pass',()=>{assert(r.report.ok);assert.equal(r.report.passed,12);assert(r.report.protectedStateMatched)})
 state.manualWrongLayer=true;state.reads=0;r=await cli(gatewayCli,runArgs);check('generic_gateway401_cannot_replace_manual_auth',()=>{assert.equal(r.report.ok,false);assert(r.report.passed<12)});state.manualWrongLayer=false
 const probeCount=()=>requests.filter(r=>!r.management).length
 state.closed=false;const count=probeCount();r=await cli(gatewayCli,runArgs);check('open_gates_refused_before_probes',()=>{assert.equal(r.report.ok,false);assert.equal(r.report.checks,0);assert.equal(probeCount(),count)});state.closed=true
 state.empty=false;r=await cli(gatewayCli,runArgs);check('pending_business_work_refused_before_probes',()=>{assert.equal(r.report.checks,0);assert.equal(probeCount(),count)});state.empty=true
 state.large=true;state.reads=0;r=await cli(gatewayCli,runArgs);check('oversized_denial_body_is_finite_failure',()=>{assert.equal(r.report.ok,false);assert.equal(r.report.passed,11)});state.large=false
 state.mutates=true;state.reads=0;r=await cli(gatewayCli,runArgs);check('unexpected_protected_change_is_unverified',()=>{assert.equal(r.report.ok,false);assert.equal(r.report.protectedStateMatched,false)});state.mutates=false
 check('no_valid_body_or_production_call',()=>{const probes=requests.filter(r=>!r.management);assert(probes.every(r=>r.emptyBody&&r.authKind!=='operator'));for(const kind of ['missing','wrong_worker','forged'])assert(probes.some(p=>p.authKind===kind));assert(commands.every(c=>(c.report.businessMutations??0)===0))})
 const serialized=JSON.stringify(commands);check('no_secret_values_in_cli_reports',()=>{for(const k of ['BILLING_STRIPE_KEY','BILLING_RC_SECRET_KEY','BILLING_WORKER_SECRET','DELETION_LEDGER_TOKEN'])assert(!serialized.includes(env[k]))})
 report={ok:true,checks:checks.length,names:checks,commands,realCredentialReads:0,actualDurableTargetWrites:0,productionRequests:0,providerCalls:0,modelCalls:0,vmStarted:false,scope:'Actual child-process/filesystem/loopback HTTP with isolated fixed-target mapping and synthetic keys; not production gateway acceptance.'}
}catch(error){report={ok:false,checks:checks.length,names:checks,error:{type:error.name,code:error.code??null},commands};process.exitCode=1}
finally{await new Promise(resolve=>server.close(resolve));await save(resolve(out,'report.json'),report);console.log(JSON.stringify({ok:report.ok,checks:report.checks,path:resolve(out,'report.json')}))}
