/**
 * [INPUT]: Actual installer CLI, a preserved incomplete candidate and local network/credential access guards.
 * [OUTPUT]: Repeatable CLI plan/refusal evidence; no remote or installed-system acceptance.
 * [POS]: Installer command-boundary acceptance. Uses the real entry process, not duplicated implementation checks.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {randomUUID,createHash} from 'node:crypto'
import {resolve} from 'node:path'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const directory=`output/tests/billing/desktop/d2-deployment/cli-acceptance/${randomUUID()}`
await mkdir(directory,{recursive:true,mode:0o700})
const preload=`import fs from 'node:fs';import promises from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';
const observed={credentialAttempts:0,networkAttempts:0};
for(const method of ['readFile','stat']){const original=promises[method];promises[method]=async function(path,...rest){const value=String(path);if(value.startsWith('.env')||value.includes('/.env')){observed.credentialAttempts++;throw Error('credential_access_blocked')}return original.call(this,path,...rest)}}
syncBuiltinESMExports();globalThis.fetch=async()=>{observed.networkAttempts++;throw Error('network_access_blocked')};
process.once('exit',()=>fs.writeFileSync(process.env.D2_CLI_GUARD_OUTPUT,JSON.stringify(observed),{mode:0o600}));`
const preloadPath=resolve(`${directory}/guard.mjs`);await writeFile(preloadPath,preload,{mode:0o600})
const incomplete='output/tests/billing/desktop/d2-deployment/plans/f1ea03bc7eb36721614a/plan.json'
const candidate=JSON.parse(await readFile(incomplete,'utf8'));assert(candidate.blockers.length>0,'Known incomplete immutable candidate required')
const target='scripts/billing/d2-deploy-development.mjs',before=sha(await readFile(target)),cases=[]
const scenarios=[
 {name:'default-plan-is-local',args:['--plan'],status:0},
 {name:'missing-window-refuses-before-credentials',args:['--pause','--run-plan',incomplete,'--reviewed-set',candidate.planSha256],status:1,reason:'Exact Root development mutation window required before credentials'},
 {name:'missing-final-evidence-refuses-before-credentials',args:['--pause','--run-plan',incomplete,'--reviewed-set',candidate.planSha256],status:1,window:'development',reason:'Complete final source/rollback/preflight evidence is required'},
 {name:'recovery-missing-final-evidence-refuses-before-credentials',args:['--recover','--run-plan',incomplete,'--reviewed-set',candidate.planSha256],status:1,reason:'Complete final source/rollback/preflight evidence is required'},
]
const continuationIndex=process.argv.indexOf('--continuation-plan')
if(continuationIndex>=0){
 const path=process.argv[continuationIndex+1],plan=JSON.parse(await readFile(path,'utf8'))
 assert(plan.continuation&&plan.blockers.length===0,'Complete continuation candidate required')
 scenarios.push({name:'continuation-refuses-second-pause-before-credentials',args:['--pause','--run-plan',path,'--reviewed-set',plan.planSha256],status:1,window:'development',reason:'Continuation preserves the original pause; a second pause is forbidden'})
}
for(const scenario of scenarios){
 const output=resolve(`${directory}/${scenario.name}.json`),env={...process.env,D2_CLI_GUARD_OUTPUT:output};delete env.D2_INSTALL_WINDOW
 if(scenario.window)env.D2_INSTALL_WINDOW=scenario.window
 const result=spawnSync(process.execPath,['--import',preloadPath,target,...scenario.args],{env,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024})
 const observed=JSON.parse(await readFile(output,'utf8')),guardMessageMatched=!scenario.reason||result.stderr.includes(scenario.reason)
 const entry={name:scenario.name,status:result.status,expectedStatus:scenario.status,guardMessageMatched,...observed,stdoutSha256:sha(result.stdout),stderrSha256:sha(result.stderr)}
 cases.push(entry)
 assert(result.status===scenario.status&&guardMessageMatched&&observed.networkAttempts===0&&observed.credentialAttempts===0,`CLI boundary failed: ${scenario.name}`)
}
assert(sha(await readFile(target))===before,'Installer entry changed during command acceptance')
const report={version:1,ok:true,remoteExecuted:false,networkRequests:0,credentialReads:0,cases,
 scope:'Real installer CLI processes with local credential/network firewalls. Only default planning and pre-credential refusal; no SQL/Edge/worker/Auth/Storage/production acceptance.',
 inputs:{entry:{path:target,sha256:before},incompletePlan:{path:incomplete,sha256:sha(await readFile(incomplete))}},
 runtime:{node:process.version,os:process.platform,cpu:process.arch,electron:null,sqlite:null,postgresql:null}}
const path=`${directory}/report.json`;await writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600})
console.log(JSON.stringify({ok:true,path,sha256:sha(await readFile(path)),cases:cases.length,networkRequests:0,credentialReads:0,remoteExecuted:false}))
