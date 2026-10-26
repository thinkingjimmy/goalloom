/**
 * [INPUT]: Explicit owner-only runtime handoff files; no operator credential is copied.
 * [OUTPUT]: Exclusive0600 durable config at the fixed ignored production path and private exact readback.
 * [POS]: Local key custody only. No key generation, remote request, upload or temporary-input deletion.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {open,lstat,realpath} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {parseEnv} from 'node:util'
import {spawnSync} from 'node:child_process'
import {ROOT,REF,NAMES,inputs} from '../source.mjs'
import {runtimeValues} from '../runtime.mjs'
import {privateEnv} from '../io.mjs'
export const DESTINATION=resolve(ROOT,'.env.billing.production.local')
const allowed=['SUPABASE_PROJECT_REF',...NAMES]
const equal=(a,b)=>allowed.every(k=>a[k]===b[k])&&Object.keys(a).length===Object.keys(b).length
async function readDestination(){
 const stat=await lstat(DESTINATION)
 if((stat.mode&0o777)!==0o600||stat.uid!==process.getuid())throw Error('unsafe_private_config')
 return privateEnv(DESTINATION)
}
async function target(){
 if(await realpath(dirname(DESTINATION))!==ROOT)throw Error('private_target_invalid')
 const ignored=spawnSync('git',['check-ignore','--quiet','--',DESTINATION],{cwd:ROOT,stdio:'ignore',timeout:5000})
 if(ignored.status!==0)throw Error('private_target_not_ignored')
}
export async function persistConfig(paths,{verify=false}={}){
 if(!Array.isArray(paths)||paths.length>4||!verify&&!paths.length)throw Error('invalid_arguments')
 await target();const source=await inputs()
 if(verify&&!paths.length){const current=await readDestination();await runtimeValues(current,source);return{ok:true,mode:'verify',path:DESTINATION,names:allowed.length,mode0600:true,gitignored:true,privateReadbackMatched:true,remoteRequests:0,created:false}}
 const merged={SUPABASE_PROJECT_REF:REF};let excluded=0
 for(const path of paths){
  if(resolve(path)===DESTINATION)throw Error('private_source_is_target')
  const values=await privateEnv(path)
  for(const [name,value] of Object.entries(values)){
   if(!allowed.includes(name)){excluded++;continue}
   if(name in merged&&merged[name]!==value)throw Error('private_input_conflict')
   merged[name]=value
  }
 }
 const {env}=await runtimeValues(merged,source)
 if(allowed.some(k=>typeof env[k]!=='string'||env[k].includes("'")))throw Error('private_env_roundtrip')
 const bytes=allowed.map(k=>`${k}='${env[k]}'`).join('\n')+'\n'
 if(!equal(parseEnv(bytes),env))throw Error('private_env_roundtrip')
 let exists=true;try{await lstat(DESTINATION)}catch(error){if(error.code==='ENOENT')exists=false;else throw error}
 if(exists){
  const current=await readDestination();await runtimeValues(current,source)
  if(!equal(current,env))throw Error('private_target_differs')
 }else{
  if(verify)throw Error('private_target_missing')
  const file=await open(DESTINATION,'wx',0o600)
  try{await file.writeFile(bytes);await file.sync()}finally{await file.close()}
  const dir=await open(ROOT,'r');try{await dir.sync()}finally{await dir.close()}
 }
 const after=await readDestination();await runtimeValues(after,source)
 if(!equal(after,env))throw Error('private_readback_failed')
 return{ok:true,mode:verify?'verify':'save',path:DESTINATION,names:allowed.length,mode0600:true,gitignored:true,privateReadbackMatched:true,excludedInputFields:excluded,remoteRequests:0,created:!exists,temporaryInputsDeleted:false}
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 try{
  const args=process.argv.slice(2)
  if(!args.length||args.length===1&&args[0]==='--help')console.log('Local private config: --save --source <owner-only-env> [--source <ledger-env>] | --verify [--source ...]. Fixed production destination; no remote actions or key generation.')
  else{
   if(!['--save','--verify'].includes(args[0]))throw Error('invalid_arguments')
   const paths=[];for(let i=1;i<args.length;i+=2){if(args[i]!=='--source'||!args[i+1]||args[i+1].startsWith('--'))throw Error('invalid_arguments');paths.push(args[i+1])}
   console.log(JSON.stringify(await persistConfig(paths,{verify:args[0]==='--verify'})))
  }
 }catch(error){const code=['invalid_arguments','unsafe_private_config','invalid_runtime_config','private_target_invalid','private_target_not_ignored','private_source_is_target','private_input_conflict','private_env_roundtrip','private_target_differs','private_target_missing','private_readback_failed'].includes(error.message)?error.message:error.code==='EEXIST'?'private_target_raced':error.code==='ENOENT'?'private_file_missing':'private_config_failed';console.log(JSON.stringify({ok:false,code,remoteRequests:0,secretValuesPrinted:false,temporaryInputsDeleted:false}));process.exitCode=1}
}
