/**
 * [INPUT]: Actual prior read-only inventory, immutable four SQL files and current installer SQL builders.
 * [OUTPUT]: Hash-only local grammar audit for pause/install/stop/readback SQL; no client or credentials.
 * [POS]: Installer preparation verification, separate from actual persistent PostgreSQL acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {sha256} from '../deploy/schema.mjs'
import {sqlGrammarProgram} from './d2-sql-grammar.mjs'
import {buildPauseSql,buildInstallSql,buildStopSql,historyFingerprintSql,drainStateSql,admissionStateSql} from './d2-deploy-state.mjs'
import {originalBusinessReadbackSql} from './d2-deploy-execute.mjs'
import {normalizedSchemaSql} from './d2-schema-attestation.mjs'
import {cronRuntimeProofSql,CRON_RUNTIME_TAG} from './d2-cron-runtime.mjs'
const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
const preflightPath=flag('--preflight')??'output/tests/billing/desktop/d2-deployment/preflights/3ddb52e2edbdd20775866401154510a018be1fcade7e38937b5208cea8856d34.json'
const planPath=flag('--sql-plan')??'output/tests/billing/desktop/d2-final-sql/staging/072faddb3182e0e0992a/plan.json'
const preflight=JSON.parse(await readFile(preflightPath,'utf8')),plan=JSON.parse(await readFile(planPath,'utf8'))
assert(preflight.ok&&preflight.readOnly&&preflight.remoteWrites===0&&plan.project==='asqyvcnxdltzzfutbbqy')
const state=preflight.observed,applicationName='d2-install:00000000-0000-4000-8000-000000000000'
const migrations=await Promise.all(plan.migrations.map(async m=>({...m,sql:await readFile(m.path,'utf8')})))
const tables=state.tables.map(t=>t.schema==='cron'&&t.name==='runid_seq'?{...t,runtime_sequence:CRON_RUNTIME_TAG}:t)
const sqlInputs=[
 {name:'pause',sql:buildPauseSql({applicationName,job:state.cron.find(j=>j.jobname==='goalloom-billing-worker-development'),admissionSha256:state.admission.admission_sha256})},
 {name:'install',sql:buildInstallSql({applicationName,migrations,tables,coreHistoryPresent:state.coreHistoryPresent,historySha256:state.history,drainEvidenceSha256:sha256(canonicalJson(state.drain))})},
 {name:'stop',sql:buildStopSql({applicationName,job:state.cron.find(j=>j.jobname==='goalloom-billing-worker-development')})},
 {name:'post-install-original-fields',sql:originalBusinessReadbackSql(tables.filter(t=>t.schema!=='service_private'||t.name!=='migrations'))},
 {name:'old-private-history',sql:historyFingerprintSql({coreHistoryPresent:false,oldPrivateOnly:true})},
 {name:'recorded-core-history',sql:historyFingerprintSql({coreHistoryPresent:true})},
 {name:'drain-observation',sql:drainStateSql},{name:'admission-readback',sql:admissionStateSql},
 {name:'normalized-installed-schema',sql:normalizedSchemaSql},{name:'exact-extension-runtime-proof',sql:cronRuntimeProofSql},
]
const files=['scripts/billing/d2-deploy-parser.mjs','scripts/billing/d2-deploy-development.mjs','scripts/billing/d2-deploy-execute.mjs','scripts/billing/d2-deploy-state.mjs',
 'scripts/billing/d2-deploy-readback.mjs','scripts/billing/d2-deploy-lock.mjs','scripts/billing/d2-populated-gate.mjs','scripts/billing/d2-schema-attestation.mjs','scripts/billing/d2-cron-runtime.mjs','scripts/billing/d2-sql-grammar.mjs',preflightPath,planPath,...plan.migrations.map(m=>m.path)]
const inputs=await Promise.all(files.map(async path=>{const bytes=await readFile(path);return {path,sha256:sha256(bytes),bytes:bytes.length}}))
const python='/Applications/Xcode.app/Contents/Developer/usr/bin/python3',parserRoot='/private/tmp/goalloom-d2-sql-parser'
const parsed=spawnSync(python,['-c',sqlGrammarProgram,parserRoot],{input:JSON.stringify({sqlInputs}),encoding:'utf8',maxBuffer:24*1024*1024,timeout:60000})
assert(parsed.status===0&&!parsed.error,'Local installer grammar parser failed')
const report={version:1,scope:'Installer SQL/PLpgSQL grammar only; actual prior metadata inventory shapes, no type/catalog/runtime or persistent installation proof.',sourceOnly:true,remoteExecuted:false,networkRequests:0,inputs,...JSON.parse(parsed.stdout)}
const bytes=JSON.stringify(report,null,2)+'\n',directory='output/tests/billing/desktop/d2-deployment/parser-audits',path=`${directory}/${sha256(bytes)}.json`
await mkdir(directory,{recursive:true});await writeFile(path,bytes,{flag:'wx',mode:0o600})
console.log(JSON.stringify({ok:report.ok,sourceOnly:true,remoteExecuted:false,path,sha256:sha256(bytes),reports:report.reports.length,dependencies:report.dependencies.length,failures:report.reports.filter(r=>r.errors.length)}))
if(!report.ok)process.exitCode=1
