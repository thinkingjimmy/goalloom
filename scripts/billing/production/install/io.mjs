/**
 * [INPUT]: Explicit ignored evidence paths and owner-only credential files.
 * [OUTPUT]: Durable immutable stage intent/readback files and bounded private config reads.
 * [POS]: Installation filesystem boundary; secrets never enter evidence.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {open,lstat,realpath,readFile,mkdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {parseEnv} from 'node:util'
import {ROOT,json} from './source.mjs'
export const BASE=resolve(ROOT,'output/tests/billing/desktop/bill29-execution')
export async function privateEnv(path){
 path=resolve(path);const stat=await lstat(path)
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>65536||await realpath(path)!==path)throw Error('unsafe_private_config')
 return parseEnv(await readFile(path,'utf8'))
}
export async function directory(path,{create=false}={}){
 path=resolve(path)
 if(dirname(path)!==BASE||!/^[-a-zA-Z0-9_.]+$/.test(path.slice(BASE.length+1)))throw Error('invalid_evidence_directory')
 await mkdir(BASE,{recursive:true,mode:0o700});if(await realpath(BASE)!==BASE)throw Error('invalid_evidence_directory')
 if(create)await mkdir(path,{mode:0o700})
 const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)throw Error('invalid_evidence_directory')
 return path
}
export async function save(path,value){
 const file=await open(path,'wx',0o600)
 try{await file.writeFile(json(value));await file.sync()}finally{await file.close()}
 const dir=await open(dirname(path),'r');try{await dir.sync()}finally{await dir.close()}
}
export async function readJson(path){
 const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)throw Error('invalid_evidence_file')
 return JSON.parse(await readFile(path,'utf8'))
}
export async function maybeJson(path){try{return await readJson(path)}catch(error){if(error.code==='ENOENT')return null;throw error}}
export const finiteError=error=>({code:new Set(['invalid_arguments','invalid_evidence_directory','unsafe_private_config','invalid_evidence_file','source_changed','plan_changed','reviewed_hash_required','migration_history_changed','schema_baseline_required','protected_state_changed','readiness_not_closed','maintenance_required','secret_drift','invalid_runtime_config','missing_runtime_config','stage_order','stage_intent_exists','outcome_unresolved','worker_job_drift','production_identity','management_transport','management_http','management_response','migration_set_changed','pinned_sdk_required']).has(error.message)?error.message:error.code==='EEXIST'?'evidence_exists':error.code==='ENOENT'?'file_missing':'installation_incomplete',...(Number.isInteger(error.httpStatus)?{httpStatus:error.httpStatus}:{})})
