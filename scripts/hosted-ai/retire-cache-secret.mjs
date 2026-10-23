/**
 * [INPUT]: Paused environment, verified privacy RPC/Edge source and Secret-name management access.
 * [OUTPUT]: Obsolete cache Secret removal and unchanged provider-secret verification; no secret values exported.
 * [POS]: Forward-only privacy rollout cleanup, separate from provider-key configuration.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { client } from './client.mjs'
import { acceptanceTarget } from './acceptance-target.mjs'
import { hostedSchemaMatches } from './schema-state.mjs'
import { sha256 } from '../deploy/schema.mjs'
import { eszipOriginalSource } from '../deploy/edge-source.mjs'

const {args,environment,config,projectRef,prefix}=acceptanceTarget()
assert(process.argv.includes('--environment') && args.length===1 && ['--inspect','--apply'].includes(args[0]),'Use explicit --environment and --inspect|--apply')
const db=await client(config,environment),report={ok:false,environment,project:projectRef,mode:args[0],at:new Date().toISOString(),realProviderCalls:0}
try {
  const b=(await db.query(`select policy,environment,
    (select count(*)::int from public.ai_actions where status='running' and created_at>clock_timestamp()-interval '90 seconds') as running,
    (select count(*)::int from public.ai_actions where not confirmed) as unconfirmed,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='ai_actions' and column_name in ('result_cipher','result_expires_at')) as content_columns
    from public.ai_budget where id='integration-shared';`))[0]
  assert(b?.environment===environment && b.policy==='disabled' && b.running===0 && !b.content_columns,'Pause, drain and migrate before Secret retirement')
  report.unconfirmedReservationsPreserved=b.unconfirmed
  assert(await hostedSchemaMatches(db),'Privacy RPC source differs')
  const bundle=await build({entryPoints:['supabase/functions/hosted-ai/index.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022',external:['node:*'],logLevel:'silent'})
  const bytes=await db.request('/functions/hosted-ai/body',{binary:true})
  const source=bytes.subarray(0,8).toString()==='ESZIP2.3'?eszipOriginalSource(bytes):bytes.toString('utf8')
  assert(sha256(source)===sha256(bundle.outputFiles[0].text) && !source.includes('HOSTED_AI_CACHE_KEY'),'Edge still depends on cached results')
  const before=await db.request('/secrets'),provider=before.find(row=>row.name==='HOSTED_AI_OPENROUTER_KEY')
  assert(provider?.value,'Provider-secret digest is unavailable')
  report.sourceSha256=sha256(source);report.cacheKeyPresentBefore=before.some(row=>row.name==='HOSTED_AI_CACHE_KEY')
  if(args[0]==='--apply' && report.cacheKeyPresentBefore) await db.request('/secrets',{method:'DELETE',json:['HOSTED_AI_CACHE_KEY']})
  const after=await db.request('/secrets')
  report.cacheKeyPresentAfter=after.some(row=>row.name==='HOSTED_AI_CACHE_KEY')
  report.providerSecretUnchanged=after.find(row=>row.name==='HOSTED_AI_OPENROUTER_KEY')?.value===provider.value
  assert(report.providerSecretUnchanged && (args[0]!=='--apply' || !report.cacheKeyPresentAfter),'Secret retirement readback failed')
  report.ok=true
}catch(error){report.error='cache_secret_retirement_incomplete';report.transportStatus=error.message.match(/HTTP \d{3}/)?.[0]??null;process.exitCode=1}
await mkdir('output/tests/hosted-ai/content-minimization',{recursive:true})
await writeFile(`output/tests/hosted-ai/content-minimization/${prefix}cache-secret-${args[0].slice(2)}.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600})
console.log(JSON.stringify(report,null,2))
