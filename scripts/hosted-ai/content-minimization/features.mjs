/**
 * [INPUT]: Current built desktop and affected feature ownership selectors.
 * [OUTPUT]: Serial source-Electron evidence with fresh per-command results and bounded failure stop.
 * [POS]: Content-minimization feature runner; excludes release, stress, performance and unchanged account/onboarding flows.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { spawn } from 'node:child_process'
import { mkdir, open, writeFile } from 'node:fs/promises'
import { cpus, release } from 'node:os'
const out='output/tests/hosted-ai/content-minimization/features'
const native=(file,...selectors)=>['--filter','@goalloom/desktop','exec','--','node',`tests/${file}.mjs`,...selectors]
const scenarios=[['hosted-cache',native('hosted-ai-cache')],['hosted',native('hosted-ai')],
  ...['composer','insight','insight-generation','assistance','language','relations','periods','ordering','feedback','history','recovery','electron','ui','sync-replay'].map(name=>[name,[`test:${name}`]]),
  ['renderer',native('review/run','renderer')],['month',native('month-review')],['combined',native('month-review','--combined')]]
const selected=process.argv.slice(2)
if(selected.some(name=>!scenarios.some(([id])=>name===id)))throw Error('Unknown owning feature')
await mkdir(out,{recursive:true})
const report={ok:false,startedAt:new Date().toISOString(),scope:'Affected hosted/capture/insight/assistance/locale ownership only; source Electron and synthetic providers. No packaged, Windows or live quality claim.',host:{os:release(),platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,virtualization:'not verified'},results:[]}
for(const [name,args] of scenarios.filter(([id])=>!selected.length||selected.includes(id))) {
  const log=`${out}/${name}.log`,handle=await open(log,'w'),startedAt=new Date().toISOString()
  console.log(`Running ${name}: pnpm ${args.join(' ')}`)
  const code=await new Promise(resolve=>{const child=spawn('pnpm',args,{stdio:['ignore',handle.fd,handle.fd],env:process.env});child.once('error',()=>resolve(-1));child.once('exit',code=>resolve(code??-1))})
  await handle.close();report.results.push({name,command:`pnpm ${args.join(' ')}`,code,startedAt,finishedAt:new Date().toISOString(),log})
  await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(`${name}: ${code===0?'passed':'failed'}`)
  if(code!==0){process.exitCode=1;break}
}
report.ok=report.results.length===scenarios.filter(([id])=>!selected.length||selected.includes(id)).length&&report.results.every(row=>row.code===0)
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n')
