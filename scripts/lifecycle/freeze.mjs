/**
 * [INPUT]: Current final integration source, accepted local input freeze and immutable D1 evidence.
 * [OUTPUT]: Immutable 0025–0028 and runtime/harness snapshots with exact before/after hashes.
 * [POS]: Source-only handoff to the existing combined rollback/deployment coordinator; no credentials or network.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { canonicalJson } from '../../packages/contracts/src/canonical.ts'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const latest=JSON.parse(await readFile('output/tests/billing/desktop/d2-lifecycle/latest-local.json','utf8'))
const acceptance=JSON.parse(await readFile(`${latest.directory}/report.json`,'utf8'))
assert(latest.ok&&acceptance.ok&&acceptance.checks.length>=10&&acceptance.inputFreeze?.unchanged,'Current passing before/after local freeze required')
const files=new Set(Object.keys(acceptance.sourceHashes))
const independentFixtureTool=path=>path==='scripts/lifecycle/development-fixtures.mjs'||path.startsWith('scripts/lifecycle/fixture-')
for(const folder of ['supabase/functions/lifecycle','supabase/functions/deletion-receipt','supabase/functions/billing','supabase/functions/hosted-ai','supabase/functions/snapshot-url','supabase/functions/retained-retrieval','scripts/lifecycle']) {
 for(const relative of await readdir(folder,{recursive:true})){const path=`${folder}/${relative}`;if(/\.(?:ts|mjs|md)$/.test(relative)&&!independentFixtureTool(path))files.add(path)}
}
const entries=await Promise.all([...files].sort().map(async path=>{const content=await readFile(path);const hash=sha(content);if(acceptance.sourceHashes[path])assert.equal(hash,acceptance.sourceHashes[path],`Source changed since local acceptance: ${path}`);return{source:path,sha256:hash,bytes:content.length,content}}))
const material=entries.map(({content,...entry})=>entry),set=sha(canonicalJson(material)),directory=`output/tests/billing/desktop/d2-lifecycle/integration-staging/${set.slice(0,20)}`
await mkdir(directory,{recursive:true})
const sources=[]
for(const entry of entries){const path=`${directory}/source/${entry.source}`;await mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true});try{await writeFile(path,entry.content,{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(sha(await readFile(path)),entry.sha256,'Immutable source changed')}sources.push({source:entry.source,path,sha256:entry.sha256,bytes:entry.bytes})}
for(const entry of entries)assert.equal(sha(await readFile(entry.source)),entry.sha256,'Source changed during freeze')
const manifest={version:1,sourceOnly:true,remoteExecuted:false,project:'asqyvcnxdltzzfutbbqy',integrationSetSha256:set,sources,
 independentFixtureTooling:{excluded:['scripts/lifecycle/development-fixtures.mjs','scripts/lifecycle/fixture-*'],boundary:'The separate fixture plan binds these tools and their full dependency closure. No accepted local source or server/SQL source is excluded.'},
 migrations:['0025_service_lifecycle.sql','0026_account_deletion.sql','0027_retained_retrieval.sql','0028_lifecycle_cleanup.sql'].map(file=>sources.find(entry=>entry.source===`supabase/migrations/${file}`)),
 localAcceptance:{path:`${latest.directory}/report.json`,sha256:sha(await readFile(`${latest.directory}/report.json`)),checks:acceptance.checks.length,scope:acceptance.scope,bundleSha256:acceptance.inputFreeze.bundleSha256},
 priorRollback:{scope:'a156850d280c31fe 0025/0026 plus matching 0027 only; 10 stages / 73 retrieval probes. Does not accept this current 0026/0028.',report:'output/tests/billing/desktop/d2-retrieval/sql-acceptance.json'},
 boundary:'Source freeze only. No new Root remote lease, persistent schema/deployment, hosted Auth/Storage/worker/race acceptance or production readiness is implied.'}
const path=`${directory}/manifest.json`;const encoded=JSON.stringify(manifest,null,2)+'\n';try{await writeFile(path,encoded,{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(await readFile(path,'utf8'),encoded,'Immutable manifest changed')}
console.log(JSON.stringify({sourceOnly:true,path,integrationSetSha256:set,migrations:manifest.migrations,localAcceptance:manifest.localAcceptance},null,2))
