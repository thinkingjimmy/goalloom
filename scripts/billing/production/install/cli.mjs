/**
 * [INPUT]: Explicit local plan/inspection/stage and reviewed hash; optional private production config.
 * [OUTPUT]: Local plans or finite stage/health evidence. Default and help never read credentials.
 * [POS]: Fixed-production installer CLI. No development retargeting or activation command exists.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {directory,save,BASE,finiteError} from './io.mjs'
import {prepare,load,inspect,reviewed,stage,check,health} from './run.mjs'
const help='Production installation: --plan <new-directory> | --inspect <directory> | --apply/--check <directory> --stage <schema|secrets|vault|edge:slug|jobs|pause> --baseline <inspection.json> --reviewed <hash> [--config <owner-only-file>] [--maintenance coordinated-cloud-cutover] [--replace-secret <name>]. --health is read-only. No activation or provider calls.'
let evidenceDirectory=null,currentStage=null
try{
 const args=process.argv.slice(2)
 if(!args.length||args.length===1&&args[0]==='--help'){console.log(help)}
 else{
  const mode=args[0]
  if(!['--plan','--inspect','--apply','--check','--health'].includes(mode))throw Error('invalid_arguments')
  const singleton=mode==='--health'
  if(singleton&&args.length!==1||!singleton&&(!args[1]||args[1].startsWith('--')))throw Error('invalid_arguments')
  const flags={},replace=[]
  for(let i=singleton?1:2;i<args.length;i+=2){const key=args[i],value=args[i+1]
   if(!['--stage','--baseline','--reviewed','--config','--maintenance','--replace-secret'].includes(key)||!value||value.startsWith('--')||flags[key]&&key!=='--replace-secret')throw Error('invalid_arguments')
   if(key==='--replace-secret')replace.push(value);else flags[key]=value
  }
  if(['--plan','--inspect'].includes(mode)&&Object.keys(flags).length||replace.length&&mode!=='--apply')throw Error('invalid_arguments')
  if(['--apply','--check'].includes(mode)&&(!flags['--stage']||!flags['--baseline']||!flags['--reviewed']))throw Error('reviewed_hash_required')
  if(flags['--stage']&&!['schema','secrets','vault','jobs','pause','edge:billing','edge:hosted-ai','edge:snapshot-url','edge:lifecycle','edge:deletion-receipt','edge:retained-retrieval'].includes(flags['--stage']))throw Error('invalid_arguments')
  let report
  if(mode==='--health'){
   const {client}=await import('./client.mjs');report=await health(await client());await save(resolve(BASE,`health-${randomUUID()}.json`),report)
  }else{
   const dir=await directory(args[1],{create:mode==='--plan'})
   evidenceDirectory=dir;currentStage=flags['--stage']??mode.slice(2)
   if(mode==='--plan')report=await prepare(dir)
   else{
    const loaded=await load(dir)
    const evidence=['--apply','--check'].includes(mode)?await reviewed(dir,loaded,flags['--baseline'],flags['--reviewed']):null
    if(mode==='--apply'&&flags['--stage']==='schema'&&flags['--maintenance']!=='coordinated-cloud-cutover')throw Error('maintenance_required')
    const {client}=await import('./client.mjs'),db=await client()
    const options={action:flags['--stage'],maintenance:flags['--maintenance'],configPath:flags['--config'],replace}
    report=mode==='--inspect'?await inspect(db,dir,loaded):mode==='--apply'?await stage(db,dir,loaded,evidence,options):await check(db,dir,loaded,evidence,options)
   }
  }
  console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1
 }
}catch(error){
 const report={ok:false,...finiteError(error),stage:currentStage,writeDispatched:error.writeDispatched===true,
  writeOutcome:error.writeDispatched?'Dispatch attempted; use the original stage --check. No automatic write retry.':'No write dispatched by this command.',launchReady:false}
 if(evidenceDirectory)try{await save(resolve(evidenceDirectory,`failure-${randomUUID()}.json`),report)}catch{ /* Preserve the original finite failure if evidence storage is unavailable. */ }
 console.log(JSON.stringify(report));process.exitCode=1
}
