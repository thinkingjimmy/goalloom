/**
 * [INPUT]: Reviewed billing migration and the existing scoped development deployment credential.
 * [OUTPUT]: Guarded additive D0 schema/history deployment with billing disabled by default.
 * [POS]: Development-only installer; no sync/AI gates, budgets, user data or provider mutations.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { billingMigrations, assertBillingSource } from './schema.mjs'
import { client, developmentRef } from '../hosted-ai/client.mjs'
import { hostedSchemaMatches } from '../hosted-ai/schema-state.mjs'
const mode = process.argv[2] ?? '--plan'
assert(['--plan','--apply'].includes(mode), 'Use --plan or --apply')
const db = await client()
assert(await hostedSchemaMatches(db), 'Expected existing development hosted-AI schema through 0013')
const migrations=await billingMigrations(db)
const pending=migrations.filter(entry=>!entry.installed)
const evidence=JSON.parse(await readFile('output/tests/billing/desktop/sql-acceptance.json','utf8'))
assert(evidence.ok&&migrations.every(entry=>evidence.migrations?.find(value=>value.file===entry.file)?.sha256===entry.sha256),'Run current billing SQL acceptance first')
const before = await db.query("select policy,environment,limit_micro,spent_micro,blocked from public.ai_budget order by id")
if(mode==='--apply'&&pending.length)await db.query(`begin;set local lock_timeout='5s';set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtextextended('goalloom-production-deploy',0));
${pending.map(entry=>entry.sql).join('\n')}
commit;`,false)
if(mode==='--apply')await assertBillingSource(db,migrations)
const after = await db.query("select policy,environment,limit_micro,spent_micro,blocked from public.ai_budget order by id")
assert.deepEqual(after,before, 'AI budget/policy changed during billing rollout')
const report={ok:true,mode,project:developmentRef,migrations:migrations.map(({file,sha256})=>({file,sha256})),applied:mode==='--apply'?pending.map(entry=>entry.file):[],billingEnabled:false,aiUnchanged:true,sourceVerified:mode==='--apply',scope:'Development additive billing schema only; no CLI migration baseline, provider connection, payment, cloud gate or production change'}
await mkdir('output/tests/billing/desktop', { recursive: true })
await writeFile('output/tests/billing/desktop/schema-deployment.json', JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
