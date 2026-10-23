/**
 * [INPUT]: Scoped environment-specific Management access and existing project API keys kept only in memory.
 * [OUTPUT]: Real Auth/JWT/Edge rejection evidence using disposable synthetic users; zero inference calls.
 * [POS]: Live authorization acceptance only. It never configures or invokes a model.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {client,readFetch} from './client.mjs'
import { acceptanceTarget } from './acceptance-target.mjs'
const { args, environment, projectUrl, config, prefix } = acceptanceTarget()
assert.equal(args.length, 0, 'Unexpected Auth acceptance arguments')
const db=await client(config, environment),created=[]
const report={ok:false,checks:[],scope:`Real ${environment} Supabase Auth and deployed JWT-protected Edge; disposable synthetic users and invalid finite inputs only. No inference, provider quality or charged-cost acceptance.`,realProviderCalls:0,realCostUsd:0}
let serviceKey,anonKey
const auth=async(path,{method='GET',json,token=serviceKey}={})=>{
 const response=await (method==='GET'?readFetch:fetch)(`${projectUrl}${path}`,{method,headers:{authorization:`Bearer ${token}`,apikey:anonKey??serviceKey,'content-type':'application/json'},...(json?{body:JSON.stringify(json)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'})
 const body=await response.json().catch(()=>null)
 return {status:response.status,body}
}
try{
 const keys=await db.request('/api-keys?reveal=true')
 serviceKey=keys.find(key=>key.name==='service_role')?.api_key
 anonKey=keys.find(key=>key.name==='anon')?.api_key
 assert(serviceKey&&anonKey,'Project API keys unavailable; use a credential with project API-key read permission')
 db.hide(serviceKey);db.hide(anonKey)
 const password=randomBytes(24).toString('base64url')
 const made=await auth('/auth/v1/admin/users',{method:'POST',json:{email:`hosted-${randomUUID()}@goalloom.test`,password,email_confirm:true}})
 assert.equal(made.status,200);created.push(made.body.id)
 const login=await auth('/auth/v1/token?grant_type=password',{method:'POST',json:{email:made.body.email,password},token:anonKey})
 assert.equal(login.status,200);const token=login.body.access_token;db.hide(token)
 const endpoint='/functions/v1/hosted-ai'
 const missing=await auth(endpoint,{method:'POST',json:{},token:anonKey});assert.equal(missing.status,401)
 const forged=await auth(endpoint,{method:'POST',json:{},token:token.slice(0,-8)+'forged00'});assert.equal(forged.status,401)
 report.checks.push('Missing user session and forged JWT reject at the real Edge boundary')
 const status=await auth(`${endpoint}?status=1`,{token});assert.equal(status.status,200);assert.equal(typeof status.body.eligible,'boolean')
 report.hostedEligible=status.body.eligible;report.checks.push('Valid real project session reaches the metadata-only eligibility endpoint')
 for(const injection of [{model:'arbitrary'},{userId:randomUUID()},{url:'https://evil.invalid'},{request:{capability:'chat',input:{messages:[]}}}]){
  const response=await auth(endpoint,{method:'POST',json:{actionId:randomUUID(),...injection},token});assert.equal(response.status,400)
 }
 report.checks.push('Real authenticated Edge rejects arbitrary model, identity, URL and generic chat inputs before admission')
 const direct=await auth('/rest/v1/ai_actions?select=action_id',{token});assert([401,403].includes(direct.status))
 report.checks.push('Authenticated REST client cannot read the private AI ledger')
 report.ok=true
}catch(error){report.error=db.safe(error.message);process.exitCode=1}
finally{
 const cleanup=[]
 for(const id of created){try{const result=await auth(`/auth/v1/admin/users/${id}`,{method:'DELETE'});cleanup.push(result.status===200)}catch{cleanup.push(false)}}
 report.syntheticUsersRemoved=cleanup.every(Boolean)
 if(!report.syntheticUsersRemoved){report.ok=false;process.exitCode=1}
 await mkdir('output/tests/hosted-ai',{recursive:true});await writeFile(`output/tests/hosted-ai/${prefix}auth-acceptance.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}
