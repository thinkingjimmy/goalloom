/**
 * [INPUT]: Current reviewed rollback evidence and explicit development deployment credentials.
 * [OUTPUT]: Separate schema, exact-source Edge and service-activation receipts with bounded legacy drain.
 * [POS]: D1 development installer. It never changes production, budgets, provider configuration or cron.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {client,developmentRef} from '../hosted-ai/client.mjs'
import {eszipOriginalSource} from '../deploy/edge-source.mjs'
import {bundle} from './build.mjs'
import {d1Migrations,d1Snapshot,sameMigrations} from './d1-schema.mjs'

const mode=process.argv[2]??'--plan'
assert(['--plan','--schema','--edges','--billing','--check','--activate'].includes(mode),'Use --plan, --schema, --edges, --billing, --check or --activate')
const directory='output/tests/billing/desktop/d1-backend',file=`${directory}/deployment.json`
await mkdir(directory,{recursive:true})
const db=await client(),migrations=await d1Migrations(db)
let previous={}
try{previous=JSON.parse(await readFile(file,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
const report={...previous,ok:false,mode,project:developmentRef,migrations:migrations.map(({file,sha256})=>({file,sha256})),
 scope:'Development only; no production, model request, provider mutation or AI budget allocation'}
delete report.error
const quote=value=>`'${String(value).replaceAll("'","''")}'`
const aiState=()=>db.query(`select jsonb_build_object('budget',(select jsonb_agg(to_jsonb(b) order by id) from public.ai_budget b),
 'actions',(select count(*) from public.ai_actions),'protections',(select coalesce(jsonb_agg(to_jsonb(p) order by user_id),'[]') from public.ai_protection p),
 'limits',(select count(*) from public.ai_limit_events)) as state`)
const sources=[]
for(const slug of ['billing','hosted-ai','snapshot-url']){
 const source=await bundle(`supabase/functions/${slug}/index.ts`)
 sources.push({slug,source,sha256:createHash('sha256').update(source).digest('hex')})
}
report.plannedEdges=sources.map(({slug,sha256})=>({slug,sha256}))
try{
 if(mode!=='--plan'){
  report.stage='reviewed_evidence'
  const evidence=JSON.parse(await readFile(`${directory}/sql-acceptance.json`,'utf8'))
  assert(evidence.ok&&sameMigrations(evidence,migrations)&&evidence.reviewedSchema,'Current reviewed rollback SQL evidence is required')
  report.stage='protected_ai_state';const before=await aiState()
  if(mode==='--schema'){
   const pending=migrations.filter(x=>!x.installed)
   report.stage='schema_transaction';if(pending.length)await db.query(`begin;set local lock_timeout='5s';set local statement_timeout='45s';
    select pg_advisory_xact_lock(hashtextextended('goalloom-development-d1-deploy',0));
    ${pending.map(x=>`${x.sql}\ninsert into service_private.migrations(version,sha256) values(${quote(x.file.slice(0,4))},${quote(x.sha256)});`).join('\n')}
    commit;`,false)
   assert.deepEqual(await d1Snapshot(db),evidence.reviewedSchema,'Installed D1 schema differs from reviewed rollback schema')
   const installed=await d1Migrations(db);assert(installed.every(x=>x.installed))
   const clock=(await db.query("select installed_at,clock_timestamp() as observed_at from service_private.migrations where version='0018'"))[0]
   const retired=previous.schema?.verified&&previous.schema.migrationInstalledAt===clock.installed_at?previous.schema.retiredAt:clock.observed_at
   const config=await db.request('/config/auth');assert(Number.isInteger(config.jwt_exp)&&config.jwt_exp>0&&config.jwt_exp<=604800,'Unexpected Auth JWT lifetime')
   const cutoff=Date.parse(retired),inflight=400
   report.schema={verified:true,migrationInstalledAt:clock.installed_at,retiredAt:retired}
   report.legacyDrain={inflightSeconds:inflight,signedUploadTtlSeconds:7200,signedDownloadTtlSeconds:60,jwtTtlSeconds:config.jwt_exp,
    storageNotBefore:new Date(cutoff+(inflight+7200)*1000).toISOString(),realtimeNotBefore:new Date(cutoff+(inflight+config.jwt_exp)*1000).toISOString(),
    verified:false,limitsSource:'https://supabase.com/docs/guides/functions/limits'}
  }else{
   assert(migrations.every(x=>x.installed),'Install reviewed D1 schema first')
   assert.deepEqual(await d1Snapshot(db),evidence.reviewedSchema,'D1 schema source/ACL drift')
   if(['--edges','--billing'].includes(mode)){
    if(mode==='--edges')assert((await db.query('select enabled from service_private.policy where id=1'))[0].enabled===false,'Pause D1 service before Edge source replacement')
    report.edges=mode==='--billing'?(previous.edges??[]).filter(x=>x.slug!=='billing'):[]
    for(const {slug,source,sha256} of sources.filter(x=>mode==='--edges'||x.slug==='billing')){
     const verify_jwt=slug!=='billing',form=new FormData()
     form.set('metadata',JSON.stringify({name:slug,entrypoint_path:'index.ts',verify_jwt}))
     form.append('file',new Blob([source],{type:'application/typescript'}),'index.ts')
     await db.request(`/functions/deploy?slug=${slug}`,{method:'POST',form})
     const metadata=await db.request(`/functions/${slug}`)
     assert(metadata.status==='ACTIVE'&&metadata.verify_jwt===verify_jwt,`Unexpected ${slug} deployment`)
     const bytes=await db.request(`/functions/${slug}/body`,{binary:true})
     const original=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8')
     assert.equal(createHash('sha256').update(original).digest('hex'),sha256,`${slug} deployed source mismatch`)
     report.edges.push({slug,sha256,version:metadata.version,verified:true})
    }
    report.edgesVerifiedAt=new Date().toISOString()
   }else{
    assert(sources.every(x=>previous.edges?.some(y=>y.slug===x.slug&&y.sha256===x.sha256&&y.verified)),'Deploy and verify current Edge sources first')
    for(const {slug,sha256} of sources){
     const bytes=await db.request(`/functions/${slug}/body`,{binary:true})
     const original=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8')
     assert.equal(createHash('sha256').update(original).digest('hex'),sha256,`${slug} changed before activation`)
    }
    if(mode==='--activate')await db.query(`begin;set local lock_timeout='5s';
     do $$begin if public.billing_source('development') is null then raise exception 'Missing D0 source';end if;end$$;
     update service_private.policy set enabled=true,source_fingerprint=md5(public.billing_source('development')::text)
      where id=1 and environment='development' and project_ref='asqyvcnxdltzzfutbbqy';
     commit;`,false)
    if(mode==='--activate')report.activatedAt=new Date().toISOString()
    report.sourcesCheckedAt=new Date().toISOString()
   }
  }
  assert.deepEqual(await aiState(),before,'AI policy, budget, fees, protections or receipts changed during deployment')
  report.aiUnchanged=true
 }
 report.ok=true;report.stage='complete'
}catch(error){report.error={type:error.name,message:error.name==='AssertionError'||/^Management [A-Z]+ \/[\w/?=-]+: HTTP \d+$/.test(error.message)?error.message:'d1_deployment_incomplete',location:error.stack?.match(/d1-deploy-development\.mjs:\d+:\d+/)?.[0]??null};process.exitCode=1}
await writeFile(file,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
