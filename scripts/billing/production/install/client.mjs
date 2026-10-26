/**
 * [INPUT]: Existing explicit production-only Management credential file.
 * [OUTPUT]: Fixed-project bounded requests with finite errors; no API-key retrieval or write replay.
 * [POS]: Production installer transport, separate from all development/Test clients.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {resolve} from 'node:path'
import {privateEnv} from './io.mjs'
import {ROOT,REF} from './source.mjs'
export async function client(){
 const env=await privateEnv(resolve(ROOT,'.env.deploy.production.local'))
 if(env.SUPABASE_PROJECT_REF!==REF||!/^sbp_[A-Za-z0-9_-]+$/.test(env.SUPABASE_ACCESS_TOKEN??''))throw Error('production_identity')
 const request=async(path,{method='GET',json,form,binary=false}={})=>{
  if(!/^\/(?:database\/query|postgrest|functions(?:\/[a-z-]+(?:\/body)?)?|functions\/deploy\?slug=[a-z-]+|secrets)$/.test(path)&&path!=='')throw Error('invalid_arguments')
  let response,bytes
  try{
   response=await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`,{method,headers:{authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,...(json?{'content-type':'application/json'}:{})},body:form??(json?JSON.stringify(json):undefined),redirect:'error',signal:AbortSignal.timeout(60000)})
   if(!response.ok)throw Object.assign(Error('management_http'),{httpStatus:response.status})
   const chunks=[];let size=0
   if(response.body)for await(const chunk of response.body){size+=chunk.length;if(size>16*1024*1024)throw Error('management_response');chunks.push(chunk)}
   bytes=Buffer.concat(chunks)
  }catch(error){if(['management_http','management_response'].includes(error.message))throw error;throw Error('management_transport')}
  if(binary)return bytes
  try{return bytes.length?JSON.parse(bytes.toString('utf8')):null}catch{throw Error('management_response')}
 }
 return{request,query:(sql,readOnly=true)=>request('/database/query',{method:'POST',json:{query:sql,read_only:readOnly}})}
}
