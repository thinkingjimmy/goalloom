/**
 * [INPUT]: Current client/server sources and the existing controlled retrieval fixture.
 * [OUTPUT]: Local plan or bounded loopback interoperability report; live execution is disabled.
 * [POS]: D2 transport preparation. Shared lifecycle installation/cleanup owns future live composition.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
const mode=process.argv[2]??'--plan',output='output/tests/billing/desktop/d2-retrieval/interop'
assert(['--plan','--controlled'].includes(mode),'Live execution requires the final lifecycle installation/cleanup contract and a separate reviewed lease')
await mkdir(output,{recursive:true})
const files=['scripts/billing/d2-retrieval-client-interop.ts','scripts/billing/d2-retrieval-interop.mjs','scripts/billing/d2-retrieval-fixture.ts',
 'packages/sync/src/retrieval.ts','packages/sync/src/cloud-remote.ts','packages/contracts/src/retrieval.ts',
 'supabase/functions/retained-retrieval/handler.ts','supabase/functions/retained-retrieval/manifest.ts','supabase/functions/retained-retrieval/control.ts','supabase/functions/retained-retrieval/protocol.ts']
const bundled=await build({entryPoints:['scripts/billing/d2-retrieval-client-interop.ts'],bundle:true,write:false,metafile:true,format:'esm',platform:'node',target:'es2022',external:['node:*'],logLevel:'silent',
 alias:{'@goalloom/contracts':resolve('packages/contracts/src/index.ts'),'@goalloom/crypto':resolve('packages/crypto/src/index.ts'),'@goalloom/sync':resolve('packages/sync/src/index.ts')}})
const sources=await Promise.all([...new Set([...files,...Object.keys(bundled.metafile.inputs)])].sort().map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})))
const plan={version:1,remoteExecuted:false,sources,bundleSha256:createHash('sha256').update(bundled.outputFiles[0].text).digest('hex'),liveBlockedBy:['Final reviewed 0028/install/source attestation','Shared exact fixture ownership and subject/lifecycle cleanup','Coordinator-owned temporary readiness window'],
 liveEntry:'runRetrievalClientJourney from d2-retrieval-client-interop.ts accepts a leased actual Auth token supplier, target and synthetic expected log. It never provisions Auth, installs SQL or changes readiness.'}
await writeFile(`${output}/plan.json`,JSON.stringify(plan,null,2)+'\n')
if(mode==='--plan'){console.log(JSON.stringify({readyForLocal:true,remoteExecuted:false,evidence:`${output}/plan.json`}));process.exit(0)}
const path=resolve(`${output}/client-server.mjs`)
await writeFile(path,bundled.outputFiles[0].text)
let report={ok:false,scope:'Local controlled client/server HTTP interoperability',runtime:{node:process.version,os:process.platform,arch:process.arch},remoteExecuted:false}
try{report={...report,...await(await import(pathToFileURL(path).href)).runControlledClientInterop()}}
catch(error){report.error={type:error?.name==='AssertionError'?'assertion_failed':'interop_incomplete',code:typeof error?.code==='string'&&/^[a-z_]+$/.test(error.code)?error.code:null,location:error?.stack?.match(/client-server\.mjs:\d+:\d+/)?.[0]??null};process.exitCode=1}
await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
