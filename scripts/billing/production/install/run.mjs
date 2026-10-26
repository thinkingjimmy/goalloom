/**
 * [INPUT]: Exact local plan, shared pure runtime validation, fixed-project metadata and a reviewed stage hash.
 * [OUTPUT]: One durable stage intent plus independent readback; unknown writes are never replayed.
 * [POS]: BILL-29 staged installation, without activation, model/provider calls or publication.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {inputs,hash,json,REF,MODES,NAMES,JOBS,q,closedSql,preservationSql,schemaSql,jobsSql,pauseSql,jobStateSql} from './source.mjs'
import {save,readJson,maybeJson,privateEnv} from './io.mjs'
import {runtimeValues} from './runtime.mjs'
import {eszipOriginalSource} from '../../../deploy/edge-source.mjs'
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const manifest=source=>({fingerprints:source.fingerprints,migrations:source.migrations.map(({sql,...m})=>m),edges:source.edges.map(({source,...e})=>e)})
const historySql=`select version,name,statements from supabase_migrations.schema_migrations order by version;`
const digestSql=`select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(h) order by version),'[]'::jsonb)::text,'UTF8')),'hex') as digest from supabase_migrations.schema_migrations h;`
const cronSql=`select jobid,jobname,schedule,active,encode(sha256(convert_to(command,'UTF8')),'hex') command_sha256 from cron.job order by jobid;`
async function platform(db){
 const config=await db.request('/postgrest'),schemas=String(config.db_schema??'').split(',').map(x=>x.trim())
 if(!schemas.includes('public')||['net','vault','service_private'].some(s=>schemas.includes(s)))throw Error('production_identity')
 return{privateSchemasNotExposed:true}
}
export async function prepare(dir){
 const source=await inputs(),plan={version:1,kind:'goalloom-production-install',project:REF,id:randomUUID(),...manifest(source),jobs:JOBS,sql:{jobsSha256:hash(jobsSql),pauseSha256:hash(pauseSql)},activationIncluded:false,oldClientImpact:'Schema0018 closes existing1.9.10 sync; coordinated cloud cutover is required. AI budget/policy/protection remain unchanged.'}
 plan.sha256=hash(json(plan));await save(resolve(dir,'plan.json'),plan)
 for(const edge of source.edges)await writeFile(resolve(dir,`${edge.slug}.ts`),edge.source,{flag:'wx',mode:0o600})
 await writeFile(resolve(dir,'jobs.sql'),jobsSql,{flag:'wx',mode:0o600});await writeFile(resolve(dir,'pause.sql'),pauseSql,{flag:'wx',mode:0o600})
 return{ok:true,mode:'plan',planSha256:plan.sha256,migrations:20,edges:6,productionWrites:0,credentialReads:0,launchReady:false}
}
export async function load(dir){
 const plan=await readJson(resolve(dir,'plan.json')),{sha256,...body}=plan
 if(plan.project!==REF||plan.version!==1||hash(json(body))!==sha256)throw Error('plan_changed')
 const source=await inputs()
 if(!same(manifest(source),{fingerprints:plan.fingerprints,migrations:plan.migrations,edges:plan.edges}))throw Error('source_changed')
 for(const edge of source.edges)if(hash(await readFile(resolve(dir,`${edge.slug}.ts`)))!==edge.sha256)throw Error('source_changed')
 if(hash(await readFile(resolve(dir,'jobs.sql')))!==plan.sql.jobsSha256||hash(await readFile(resolve(dir,'pause.sql')))!==plan.sql.pauseSha256)throw Error('plan_changed')
 return{plan,source}
}
function verifyHistory(rows,source){
 if(!Array.isArray(rows)||rows.length<13||rows.length>33)throw Error('migration_history_changed')
 for(let i=0;i<rows.length;i++){
  const r=rows[i],m=source.migrations[i]
  if(r.version!==m.version||r.name!==m.name||!Array.isArray(r.statements)||hash(r.statements.join(''))!==m.sha256)throw Error('migration_history_changed')
 }
 return rows.map(r=>({version:r.version,name:r.name,sha256:hash(r.statements.join(''))}))
}
export async function edgeState(db,slug,capture,listing){
 const metadata=(listing??await db.request('/functions')).find(e=>e.slug===slug)
 if(!metadata)return{slug,present:false}
 const bytes=await db.request(`/functions/${slug}/body`,{binary:true}),source=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8')
 if(capture)await capture(source)
 return{slug,present:true,version:metadata.version,status:metadata.status,verifyJwt:metadata.verify_jwt,sha256:hash(source)}
}
async function secretState(db){
 const rows=await db.request('/secrets')
 if(!Array.isArray(rows)||rows.some(x=>typeof x.name!=='string'||!/^[a-f0-9]{64}$/.test(x.value)))throw Error('management_response')
 return rows.map(x=>({name:x.name,digest:x.value})).sort((a,b)=>a.name.localeCompare(b.name))
}
export async function inspect(db,dir,loaded){
 const {plan,source}=loaded,project=await db.request('');if(project.id!==REF||project.status!=='ACTIVE_HEALTHY')throw Error('production_identity')
 const raw=await db.query(historySql),history=verifyHistory(raw,source),installed=history.length===33
 if(history.length!==13&&!installed)throw Error('migration_history_changed')
 const baseline={history,historyDigest:(await db.query(digestSql))[0].digest,protected:(await db.query(preservationSql(installed)))[0].protected,platform:await platform(db),
  cron:await db.query(cronSql),secrets:await secretState(db),edges:[]}
 const captureId=randomUUID(),listing=await db.request('/functions')
 for(const [slug] of MODES)baseline.edges.push(await edgeState(db,slug,async source=>{
  await writeFile(resolve(dir,`prior-${captureId}-${slug}.ts`),source,{flag:'wx',mode:0o600})
 },listing))
 if(installed){if((await db.query(closedSql))[0]?.closed!==true)throw Error('readiness_not_closed')}
 const intent=`bill29-install:${randomUUID()}`,schema=installed?null:schemaSql(source,baseline,intent)
 const evidence={version:1,kind:'goalloom-production-install-inspection',project:REF,planSha256:plan.sha256,observedAt:new Date().toISOString(),intent,priorEdgePrefix:`prior-${captureId}-`,baseline,schemaSha256:schema?hash(schema):null}
 evidence.reviewedHash=hash(json(evidence));const filename=`inspection-${randomUUID()}.json`
 await save(resolve(dir,filename),evidence)
 if(schema)await writeFile(resolve(dir,`${filename}.sql`),schema,{flag:'wx',mode:0o600})
 return{ok:true,mode:'inspect',file:filename,reviewedHash:evidence.reviewedHash,installed,productionWrites:0,launchReady:false}
}
export async function reviewed(dir,loaded,filename,expected){
 if(!/^inspection-[a-f0-9-]{36}\.json$/.test(filename??'')||!/^[a-f0-9]{64}$/.test(expected??''))throw Error('reviewed_hash_required')
 const evidence=await readJson(resolve(dir,filename)),{reviewedHash,...body}=evidence
 if(reviewedHash!==expected||hash(json(body))!==expected||evidence.planSha256!==loaded.plan.sha256||evidence.project!==REF)throw Error('plan_changed')
 const sql=evidence.schemaSha256?schemaSql(loaded.source,evidence.baseline,evidence.intent):null
 for(const edge of evidence.baseline.edges.filter(e=>e.present))if(hash(await readFile(resolve(dir,`${evidence.priorEdgePrefix}${edge.slug}.ts`)))!==edge.sha256)throw Error('plan_changed')
 if(sql&&(hash(sql)!==evidence.schemaSha256||hash(await readFile(resolve(dir,`${filename}.sql`)))!==evidence.schemaSha256))throw Error('plan_changed')
 return{...evidence,sql}
}
async function installed(db,source){
 const history=verifyHistory(await db.query(historySql),source);if(history.length!==33)throw Error('stage_order')
 const privateRows=await db.query('select version,sha256 from service_private.migrations order by version;')
 if(!same(privateRows,source.migrations.slice(13).map(m=>({version:m.version,sha256:m.sha256}))))throw Error('migration_history_changed')
 if((await db.query(closedSql))[0]?.closed!==true)throw Error('readiness_not_closed')
 return history
}
export async function runtimeConfig(path,source){
 if(!path)throw Error('missing_runtime_config')
 return runtimeValues(await privateEnv(path),source)
}
const sourceSql=c=>`insert into public.billing_sources(environment,source,account_id,rc_project,rc_app,monthly_price,annual_price,enabled)
 values('production','stripe',${q(c.account)},${q(c.rcProject)},${q(c.rcApp)},${q(c.prices.monthly)},${q(c.prices.annual)},false)
 on conflict(environment,source) do nothing;
 do $binding$ begin if not exists(select 1 from public.billing_sources where environment='production' and source='stripe' and not enabled
 and account_id=${q(c.account)} and rc_project=${q(c.rcProject)} and rc_app=${q(c.rcApp)} and monthly_price=${q(c.prices.monthly)} and annual_price=${q(c.prices.annual)}) then raise exception 'source_binding_changed';end if;end $binding$;`
const vaultSql=env=>['billing','lifecycle'].map(worker=>{
 const name=`goalloom-${worker}-worker-auth-production`,value=`Bearer ${env[worker==='billing'?'BILLING_WORKER_SECRET':'LIFECYCLE_WORKER_SECRET']}`
 return `do $vault$ declare v text;begin select decrypted_secret into v from vault.decrypted_secrets where name=${q(name)};
 if v is null then perform vault.create_secret(${q(value)},${q(name)},'Production bounded worker authentication');
 elsif v<>${q(value)} then raise exception 'worker_secret_changed';end if;end $vault$;`
}).join('\n')
async function configReadback(db,config,env){
 const secrets=await secretState(db),matched=NAMES.every(name=>secrets.find(s=>s.name===name)?.digest===hash(env[name]))
 const rows=await db.query(`select account_id,rc_project,rc_app,monthly_price,annual_price,enabled from public.billing_sources where environment='production' and source='stripe';`)
 const binding=rows.length===1&&same(rows[0],{account_id:config.account,rc_project:config.rcProject,rc_app:config.rcApp,monthly_price:config.prices.monthly,annual_price:config.prices.annual,enabled:false})
 return{matched:matched&&binding,secretsMatched:matched,disabledSourceMatched:binding}
}
async function vaultReadback(db,env){
 // The API read-only role cannot decrypt Vault; constrain the existing operator in SQL.
 const rows=await db.query(`begin read only;select name,encode(sha256(convert_to(decrypted_secret,'UTF8')),'hex') as digest from vault.decrypted_secrets where name in ('goalloom-billing-worker-auth-production','goalloom-lifecycle-worker-auth-production');commit;`,false)
 return ['billing','lifecycle'].every(w=>rows.find(x=>x.name===`goalloom-${w}-worker-auth-production`)?.digest===hash(`Bearer ${env[w==='billing'?'BILLING_WORKER_SECRET':'LIFECYCLE_WORKER_SECRET']}`))
}
export async function stage(db,dir,loaded,evidence,options){
 const {source}=loaded,{action,maintenance,configPath,replace=[]}=options
 if(!['schema','secrets','vault','jobs','pause',...MODES.map(([s])=>`edge:${s}`)].includes(action))throw Error('invalid_arguments')
 const key=action.replace(':','-'),path=resolve(dir,`${key}.intent.json`),prior=await maybeJson(path)
 if(prior)throw Error('stage_intent_exists')
 if(action==='schema'&&maintenance!=='coordinated-cloud-cutover')throw Error('maintenance_required')
 if(action!=='schema'&&action!=='pause')await installed(db,source)
 const credential=['secrets','vault'].includes(action)?await runtimeConfig(configPath,source):null
 if(action==='schema'){
  if(!evidence.sql||hash(evidence.sql)!==evidence.schemaSha256)throw Error('schema_baseline_required')
  verifyHistory(await db.query(historySql),source)
 }
 let payloadDigest=action==='schema'?evidence.schemaSha256:credential?hash(json(NAMES.map(n=>({name:n,digest:hash(credential.env[n])})))):null
 if(action==='secrets'){
  const old=await secretState(db),names=NAMES.filter(n=>old.some(s=>s.name===n&&s.digest!==hash(credential.env[n])))
  if(replace.some(n=>!NAMES.includes(n))||!same([...names].sort(),[...replace].sort()))throw Error('secret_drift')
  payloadDigest=hash(json(NAMES.map(n=>({name:n,digest:hash(credential.env[n])}))))
 }
 if(action==='jobs'){
  await platform(db)
  const jobs=await db.query(jobStateSql);if(jobs.length)throw Error('worker_job_drift')
 }
 const intent={version:1,project:REF,action,planSha256:loaded.plan.sha256,reviewedHash:evidence.reviewedHash,transaction:action==='schema'?evidence.intent:null,payloadDigest,
  dispatchedAt:new Date().toISOString(),unrelatedSecrets:action==='secrets'?(await secretState(db)).filter(s=>!NAMES.includes(s.name)):null,originalCron:await db.query(cronSql)}
 await save(path,intent)
 // Each awaited mutation has a separately persisted immutable intent; no catch branch dispatches it again.
 try{
 if(action==='schema')await db.query(evidence.sql,false)
 else if(action==='secrets'){
  await db.request('/secrets',{method:'POST',json:NAMES.map(name=>({name,value:credential.env[name]}))})
  // A separate stage keeps SQL source binding recoverable after an unknown Secret upload result.
 }
 else if(action==='vault')await db.query(`begin;set local lock_timeout='5s';set local statement_timeout='30s';${sourceSql(credential.config)}\n${vaultSql(credential.env)}commit;`,false)
 else if(action==='jobs')await db.query(jobsSql,false)
 else if(action==='pause')await db.query(pauseSql,false)
 else{
  const edge=source.edges.find(e=>action===`edge:${e.slug}`),form=new FormData()
  form.set('metadata',JSON.stringify({name:edge.slug,entrypoint_path:'index.ts',verify_jwt:edge.verifyJwt}));form.append('file',new Blob([edge.source],{type:'application/typescript'}),'index.ts')
  await db.request(`/functions/deploy?slug=${edge.slug}`,{method:'POST',form})
 }
 return await check(db,dir,loaded,evidence,{...options,intent})
 }catch(error){error.writeDispatched=true;throw error}
}
export async function check(db,dir,loaded,evidence,options){
 const {action,configPath}=options,key=action.replace(':','-'),intent=options.intent??await readJson(resolve(dir,`${key}.intent.json`))
 if(intent.project!==REF||intent.action!==action||intent.reviewedHash!==evidence.reviewedHash||intent.planSha256!==loaded.plan.sha256)throw Error('plan_changed')
 const {source}=loaded;let result={matched:false}
 if(action==='schema'){
  const active=await db.query(`select count(*)::int n from pg_stat_activity where pid<>pg_backend_pid() and application_name=${q(evidence.intent)} and state<>'idle';`)
  if(active[0]?.n!==0)throw Error('outcome_unresolved')
  const rows=verifyHistory(await db.query(historySql),source)
  if(rows.length===33){await installed(db,source);const after=(await db.query(preservationSql(true)))[0].protected
   if(!same(after,evidence.baseline.protected))throw Error('protected_state_changed');result={matched:true,historyMatched:true,protectedStateMatched:true,closed:true}}
  else if(rows.length===13&&same(rows,evidence.baseline.history))result={matched:false,outcome:'not_applied',replayAllowed:false}
 }
 else if(action.startsWith('edge:')){
  const edge=source.edges.find(e=>action===`edge:${e.slug}`),state=await edgeState(db,edge.slug)
  result={matched:state.present&&state.sha256===edge.sha256&&state.verifyJwt===edge.verifyJwt&&state.status==='ACTIVE',state}
 }
 else if(action==='secrets'){
  const c=await runtimeConfig(configPath,source),state=await secretState(db),unrelated=state.filter(s=>!NAMES.includes(s.name))
  if(!same(unrelated,intent.unrelatedSecrets))throw Error('secret_drift')
  const digest=hash(json(NAMES.map(n=>({name:n,digest:hash(c.env[n])}))))
  if(intent.payloadDigest!==digest)throw Error('invalid_runtime_config')
  result={matched:NAMES.every(n=>state.find(s=>s.name===n)?.digest===hash(c.env[n])),unrelatedSecretsMatched:true}
 }
 else if(action==='vault'){
  const c=await runtimeConfig(configPath,source),bound=await configReadback(db,c.config,c.env)
  if(intent.payloadDigest!==hash(json(NAMES.map(n=>({name:n,digest:hash(c.env[n])})))))throw Error('invalid_runtime_config')
  result={...bound,vaultMatched:await vaultReadback(db,c.env)};result.matched=result.matched&&result.vaultMatched
 }
 else if(['jobs','pause'].includes(action)){
  const jobs=await db.query(jobStateSql)
  result={matched:jobs.length===3&&JOBS.every(j=>jobs.some(r=>r.jobname===j.name&&r.schedule==='* * * * *'&&r.command===j.command&&r.active===false)),jobs}
 }
 const cron=await db.query(cronSql),old=intent.originalCron.filter(j=>!JOBS.some(n=>n.name===j.jobname)),after=cron.filter(j=>!JOBS.some(n=>n.name===j.jobname))
 if(!same(old,after))throw Error('worker_job_drift')
 const report={ok:result.matched,mode:'check',action,at:new Date().toISOString(),intentSha256:hash(json(intent)),result,oldCronUnchanged:true,launchReady:false}
 await save(resolve(dir,`${key}.readback-${randomUUID()}.json`),report)
 return report
}
export async function health(db){
 const data=(await db.query('begin read only;select service_private.production_worker_health() as health;commit;',false))[0]?.health
 if(data?.version!==1||data.environment!=='production')throw Error('management_response')
 const now=Date.parse(data.serverNow),alerts=[],stale=time=>!Number.isFinite(Date.parse(time))||now-Date.parse(time)>300000
 if(!Number.isFinite(now))throw Error('management_response')
 const jobs=await db.query(jobStateSql)
 for(const job of JOBS)if(!jobs.some(j=>j.jobname===job.name&&j.schedule==='* * * * *'&&j.active&&j.command===job.command))alerts.push(`${job.name}_inactive_or_changed`)
 const runs=await db.query(`select jobname,status,start_time,end_time from(select j.jobname,d.status,d.start_time,d.end_time,
  row_number() over(partition by j.jobname order by d.runid desc) n from cron.job j join cron.job_run_details d on d.jobid=j.jobid
  where j.jobname in(${JOBS.map(j=>q(j.name)).join(',')})) r where n=1;`)
 for(const run of runs)if(run.status==='failed')alerts.push(`${run.jobname}_cron_failure`)
 if(stale(data.observation?.observedAt))alerts.push('observation_stale')
 for(const name of ['billing','lifecycle']){
  const worker=data.workers?.[name]
  if(stale(worker?.lastComplete))alerts.push(`${name}_completion_stale`)
  if(worker?.recentFailures>0)alerts.push(`${name}_http_failure`)
  if(worker?.unresolved>2)alerts.push(`${name}_unresolved_requests`)
  const c=worker?.latestCounters;if((c?.retry??0)>0||(c?.pending??0)>0||(c?.renewalPending??0)>0)alerts.push(`${name}_work_pending`)
 }
 for(const [object,key] of [['billing','overdueGrace'],['billing','pendingCompensations'],['lifecycle','overdueDeletion'],['lifecycle','deadlineRisk']])if(data[object]?.[key]>0)alerts.push(`${object}_${key}`)
 if(data.billing?.oldestEvent&&stale(data.billing.oldestEvent))alerts.push('billing_event_backlog')
 if((data.billing?.maxAttempts??0)>=5)alerts.push('billing_retry_growth')
 if(data.observation?.retentionOk===false)alerts.push('retention_cleanup_failed')
 return{ok:alerts.length===0,mode:'health',project:REF,alerts,data,jobs,runs,readOnly:true,productionWrites:0,launchReady:false,providerRetryAlignmentVerified:false}
}
