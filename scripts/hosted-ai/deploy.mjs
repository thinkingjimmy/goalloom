/**
 * [INPUT]: Reviewed hosted AI migration, bundled Edge code and private development credentials.
 * [OUTPUT]: Explicit development schema/function deployment; existing costs/budget are never reset.
 * [POS]: Manual deployment only. Secret setup is a separate explicit mode; production is excluded.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parseEnv } from 'node:util'
import { build } from 'esbuild'
import { eszipOriginalSource } from '../deploy/edge-source.mjs'
import { hostedSchemaMatches } from './schema-state.mjs'
import { migrationManifest, pendingMigrations } from '../deploy/schema.mjs'
import { client, developmentRef } from './client.mjs'
const mode = process.argv[2] ?? '--plan'
assert(['--plan','--apply','--secrets'].includes(mode),'Use --plan, --apply or --secrets')

const bundle = await build({ entryPoints:['supabase/functions/hosted-ai/index.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022',external:['node:*'],logLevel:'silent' })
const source = bundle.outputFiles[0].text
await mkdir('output/tests/hosted-ai',{recursive:true})
await writeFile('output/tests/hosted-ai/edge-bundle.ts',source)
const report={mode,project:developmentRef,sha256:createHash('sha256').update(source).digest('hex'),ok:false,stages:[]}
let db
try {
  if(mode!=='--plan') {
    db=await client()
    if(mode==='--secrets') {
      const secretFile='.env.hosted-ai.local'
      assert(((await stat(secretFile)).mode & 0o077)===0,'Hosted secret file must be owner-only')
      const env=parseEnv(await readFile(secretFile,'utf8'))
      assert(env.HOSTED_AI_OPENROUTER_KEY,'Missing dedicated hosted provider key')
      const secrets=[{name:'HOSTED_AI_OPENROUTER_KEY',value:env.HOSTED_AI_OPENROUTER_KEY},{name:'HOSTED_AI_ENVIRONMENT',value:'development'}]
      await db.request('/secrets',{method:'POST',json:secrets})
      report.stages.push('Development provider secret configured; no result-cache key dependency')
    } else {
      const hasHistory=(await db.query("select to_regclass('supabase_migrations.schema_migrations') is not null as present;"))[0].present
      if(hasHistory) {
        const manifest=await migrationManifest(),history=await db.query('select version,name,statements from supabase_migrations.schema_migrations order by version;')
        assert(pendingMigrations(manifest,history,[]).length===0 && history.some(row=>row.version==='0013'),'Apply the reviewed privacy/identity migrations with content-rollout first')
      }
      assert(await hostedSchemaMatches(db),'Installed privacy RPC source differs from the reviewed migration')
      const budget=(await db.query("select policy,environment from public.ai_budget where id='integration-shared';"))[0]
      assert(budget?.environment==='development' && budget.policy==='disabled','Pause admission before replacing Edge code')
      const form=new FormData()
      form.set('metadata',JSON.stringify({name:'hosted-ai',entrypoint_path:'index.ts',verify_jwt:true}))
      form.append('file',new Blob([source],{type:'application/typescript'}),'index.ts')
      await db.request('/functions/deploy?slug=hosted-ai',{method:'POST',form})
      const metadata=await db.request('/functions/hosted-ai')
      assert(metadata.verify_jwt===true && metadata.status==='ACTIVE','Edge not active with JWT verification')
      const downloaded=await db.request('/functions/hosted-ai/body',{binary:true})
      const original=downloaded.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(downloaded):downloaded.toString('utf8')
      assert(createHash('sha256').update(original).digest('hex')===report.sha256,'Downloaded Edge source differs from the current bundle')
      report.budget=(await db.query("select limit_micro,spent_micro,environment,blocked from public.ai_budget where id='integration-shared';"))[0]
      report.stages.push('Exact migration history matched; development Edge source read back and matched with JWT verification')
    }
  }
  report.ok=true
} catch(error) { report.error='deployment_incomplete'; process.exitCode=1 }
await writeFile('output/tests/hosted-ai/deployment.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
