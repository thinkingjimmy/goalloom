/**
 * [INPUT]: A current saved read-only production inspection and the actual recovery CLI.
 * [OUTPUT]: Repeatable offline child-process acceptance with preserved successful/failed artifacts.
 * [POS]: Continuous-recovery CLI E2E; fetch/private-config reads are denied by an injected child guard.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {ROOT,hash,json} from '../source.mjs'
import {readJson,save} from '../io.mjs'
import {OUTPUT} from './reopen.mjs'
const args=process.argv.slice(2)
if(args.length!==1)throw Error('usage: reopen-acceptance.mjs <current-inspection.json>')
const out=resolve(OUTPUT,`cli-${randomUUID()}`),checks=[],commands=[]
await mkdir(out,{recursive:true,mode:0o700})
const guard=resolve(out,'offline-guard.mjs')
await writeFile(guard,`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
let network=0,privateReads=0;
globalThis.fetch=()=>{network++;throw Error('offline_network_forbidden')};
for(const key of ['readFile','open','lstat']){const original=fs.promises[key].bind(fs.promises);fs.promises[key]=async(path,...args)=>{if(/(?:^|\\/)\\.env(?:[.\\/]|$)/.test(String(path))){privateReads++;throw Error('private_config_forbidden')}return original(path,...args)}}
syncBuiltinESMExports();
process.on('exit',()=>fs.writeFileSync(process.env.REOPEN_GUARD_REPORT,JSON.stringify({network,privateReads}),{flag:'wx',mode:0o600}));
`,{flag:'wx',mode:0o600})
const run=async(argv)=>{
 const guardReport=resolve(out,`guard-${commands.length}.json`)
 const result=await new Promise((done,fail)=>{const child=spawn(process.execPath,['--import',guard,'scripts/billing/production/install/operations/reopen.mjs',...argv],{cwd:ROOT,env:{...process.env,REOPEN_GUARD_REPORT:guardReport},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);child.on('error',fail);child.on('close',code=>done({code,stdout,stderr}))})
 const guardResult=await readJson(guardReport);assert.deepEqual(guardResult,{network:0,privateReads:0})
 commands.push({argv,...result,guard:guardResult});return result
}
const check=(name,condition)=>{assert(condition,name);checks.push(name)}
let report
try{
 const planDirectory=resolve(OUTPUT,`review-${randomUUID()}`),inspection=await readJson(resolve(args[0]))
 let result=await run(['--plan',resolve(args[0]),'--output',planDirectory])
 check('actual_offline_cli_creates_exact_immutable_package',result.code===0)
 const plan=await readJson(resolve(planDirectory,'plan.json'))
 for(const {file,sha256} of Object.values(plan.sql))assert.equal(hash(await readFile(resolve(planDirectory,file))),sha256)
 check('all_four_sql_files_match_reported_hashes',Object.keys(plan.sql).length===4)
 check('plan_has_paid_ai_diff_and_scoped_legacy_limitation',plan.aiBudget.after.policy==='trial_or_paid'&&plan.aiBudget.before.policy==='authenticated'&&plan.originalWorkspace.changed===false&&plan.activationExecuted===false)
 check('client_handoff_paths_resolve_from_plan_directory',plan.originalWorkspace.handoffPathBase==='plan-directory'&&(await readFile(resolve(planDirectory,plan.originalWorkspace.compatibleClientHandoff),'utf8')).length>0&&(await readFile(resolve(planDirectory,plan.originalWorkspace.clientSource),'utf8')).length>0)
 result=await run(['--plan',resolve(args[0]),'--output',planDirectory])
 check('existing_package_is_not_overwritten',result.code!==0&&JSON.parse(result.stdout).code==='evidence_exists')
 const tampered=resolve(out,'tampered.json');await save(tampered,{...inspection,keyCustodyMatched:false})
 result=await run(['--plan',tampered,'--output',resolve(OUTPUT,`tamper-${randomUUID()}`)])
 check('tampered_inspection_refused_before_package_creation',result.code!==0&&JSON.parse(result.stdout).code==='inspection_changed')
 const stale=structuredClone(inspection);stale.source[0].sha256='0'.repeat(64);delete stale.sha256;stale.sha256=hash(json(stale))
 const changed=resolve(out,'changed-source.json');await save(changed,stale)
 result=await run(['--plan',changed,'--output',resolve(OUTPUT,`changed-${randomUUID()}`)])
 check('source_drift_refused_even_with_recomputed_inspection_hash',result.code!==0&&JSON.parse(result.stdout).code==='source_or_evidence_changed')
 result=await run(['--apply',planDirectory])
 check('no_apply_or_production_dispatch_cli_exists',result.code!==0&&JSON.parse(result.stdout).code==='invalid_arguments')
 report={ok:true,checks,commands,planDirectory,platform:{node:process.version,os:process.platform,arch:process.arch},productionWrites:0,sourceSha256:hash(await readFile(resolve(ROOT,'scripts/billing/production/install/operations/reopen-acceptance.mjs')))}
}catch(error){report={ok:false,checks,commands,code:error.message,productionWrites:0};process.exitCode=1}
await save(resolve(out,'report.json'),report)
console.log(JSON.stringify({ok:report.ok,checks:checks.length,evidence:resolve(out,'report.json'),planDirectory:report.planDirectory,code:report.code}))
