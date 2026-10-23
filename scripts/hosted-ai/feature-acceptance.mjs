/**
 * [INPUT]: Current source build and the full ownership map for affected hosted-AI desktop features.
 * [OUTPUT]: Serial test execution, per-command logs and a repeatable manifest referencing existing suite evidence.
 * [POS]: Feature-only acceptance runner. No verify, release, stress or performance suites.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {spawn} from 'node:child_process'
import {mkdir,readFile,writeFile,open} from 'node:fs/promises'
const out='output/tests/hosted-ai/feature-acceptance'
await mkdir(out,{recursive:true})
const scenarios=[
 ['hosted-cache',['--filter','@goalloom/desktop','exec','--','node','tests/hosted-ai-cache.mjs']],
 ['hosted',['--filter','@goalloom/desktop','exec','--','node','tests/hosted-ai.mjs']],
 ['vitest',['test']],['ui',['test:ui']],['composer',['test:composer']],['language',['test:language']],['calendar',['test:calendar']],
 ['insight',['test:insight']],['insight-generation',['test:insight-generation']],['assistance',['test:assistance']],
 ['month-review',['--filter','@goalloom/desktop','exec','--','node','tests/month-review.mjs']],
 ['combined-review',['--filter','@goalloom/desktop','exec','--','node','tests/month-review.mjs','--combined']],
 ['apple-login',['test:apple-login']],['credentials',['test:credentials']],['sync-join',['test:sync-join']],['sync-replay',['test:sync-replay']],
]
const selected=process.argv.slice(2)
if(selected.some(name=>!scenarios.some(([id])=>name===id)))throw Error('Unknown feature selector')
let previous=[]
try{previous=JSON.parse(await readFile(`${out}/report.json`,'utf8')).results??[]}catch{}
const report={ok:false,scope:'Changed hosted AI, onboarding, writing, locale and account ownership coverage only. Source Electron; no release or Windows acceptance.',results:previous}
for(const [name,args] of scenarios.filter(([name])=>!selected.length||selected.includes(name))){
 const startedAt=new Date().toISOString(),path=`${out}/${name}.log`,log=await open(path,'w')
 console.log(`Running ${name}: pnpm ${args.join(' ')}`)
 const code=await new Promise(resolve=>{const child=spawn('pnpm',args,{stdio:['ignore',log.fd,log.fd],env:process.env});child.once('error',()=>resolve(-1));child.once('exit',code=>resolve(code??-1))})
 await log.close()
 report.results=report.results.filter(row=>row.name!==name)
 report.results.push({name,command:`pnpm ${args.join(' ')}`,code,startedAt,finishedAt:new Date().toISOString(),log:path})
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n')
 console.log(`${name}: ${code===0?'passed':'failed'} (${path})`)
 // A failed owning scenario needs inspection before another foreground run.
 if(code!==0){process.exitCode=1;break}
}
report.pending=scenarios.filter(([name])=>!report.results.some(row=>row.name===name&&row.code===0)).map(([name])=>name)
report.ok=report.pending.length===0
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n')
