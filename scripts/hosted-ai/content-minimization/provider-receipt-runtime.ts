/**
 * [INPUT]: Service-role authority, compiled synthetic owner/action IDs and runtime provider Secret.
 * [OUTPUT]: Whitelisted independent generation cost/token checks. No inference, content or key export.
 * [POS]: Temporary read-only acceptance worker, removed after the manual receipt check.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
declare const __OWNER__:string, __ACTIONS__:string[], __ENVIRONMENT__:string
const url=Deno.env.get('SUPABASE_URL')??'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',providerKey=Deno.env.get('HOSTED_AI_OPENROUTER_KEY')??''
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
async function boundedJson(response:Response) {
  const reader=response.body?.getReader();if(!reader)throw Error('metadata_unavailable')
  const chunks:Uint8Array[]=[];let size=0
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>64000)throw Error('metadata_too_large');chunks.push(value)}}finally{await reader.cancel().catch(()=>undefined)}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return JSON.parse(new TextDecoder().decode(bytes))
}
Deno.serve(async request=>{
  try {
    if(request.method!=='GET' || new URL(request.url).search)return reply({error:'permission_denied'},403)
    const authorization=request.headers.get('authorization')??''
    if(!serviceKey || !authorization.startsWith('Bearer '))return reply({error:'permission_denied'},403)
    const authority=await fetch(`${url}/rest/v1/rpc/ai_eligibility`,{method:'POST',headers:{authorization,apikey:serviceKey,'content-type':'application/json'},body:JSON.stringify({p_environment:__ENVIRONMENT__}),signal:AbortSignal.timeout(10000),redirect:'error'})
    if(!authority.ok)return reply({error:'permission_denied'},403)
    const rowsResponse=await fetch(`${url}/rest/v1/ai_actions?select=action_id,capability,provider_request_id,charged_micro,input_tokens,output_tokens,confirmed&user_id=eq.${__OWNER__}&action_id=in.(${__ACTIONS__.join(',')})`,{headers:{authorization:`Bearer ${serviceKey}`,apikey:serviceKey},signal:AbortSignal.timeout(10000),redirect:'error'})
    if(!rowsResponse.ok)return reply({error:'ledger_unavailable'},503)
    const rows=await boundedJson(rowsResponse),receipts=[]
    for(const row of rows) {
      if(!__ACTIONS__.includes(row.action_id))return reply({error:'ledger_unavailable'},503)
      if(typeof row.provider_request_id!=='string' || !/^gen-(?:dec-)?\d{10,16}-[A-Za-z0-9]{1,80}$/.test(row.provider_request_id)){receipts.push({actionId:row.action_id,verified:false,reason:'provider_identity_unavailable'});continue}
      const response=await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(row.provider_request_id)}`,{headers:{authorization:`Bearer ${providerKey}`},signal:AbortSignal.timeout(10000),redirect:'error'})
      const data=response.ok?(await boundedJson(response)).data:null
      const identityMatches=!!data && data.id===row.provider_request_id
      const costMatches=identityMatches && typeof data.total_cost==='number' && Number.isFinite(data.total_cost) && data.total_cost>=0 && data.total_cost<=100
        && Math.ceil(Number((data.total_cost*1e6).toPrecision(15)))===row.charged_micro
      const routeMatches=identityMatches && (row.capability==='evaluate'?data.provider_name==='TypeSafe':row.capability==='assistance'?['DeepInfra','DeepSeek'].includes(data.provider_name):data.provider_name==='DeepInfra')
      const nativeTokensMatch=identityMatches && Number.isSafeInteger(data.native_tokens_prompt) && Number.isSafeInteger(data.native_tokens_completion)
        && data.native_tokens_prompt===row.input_tokens && data.native_tokens_completion===row.output_tokens
      const normalizedTokensMatch=identityMatches && Number.isSafeInteger(data.tokens_prompt) && Number.isSafeInteger(data.tokens_completion)
        && data.tokens_prompt===row.input_tokens && data.tokens_completion===row.output_tokens
      const verified=costMatches && routeMatches && (nativeTokensMatch || normalizedTokensMatch)
      receipts.push({actionId:row.action_id,verified,providerRequestId:row.provider_request_id,ledgerMicro:row.charged_micro,
        costMatches,routeMatches,nativeTokensMatch,normalizedTokensMatch,
        ...(verified?{totalCostUsd:data.total_cost,nativeInputTokens:data.native_tokens_prompt,nativeOutputTokens:data.native_tokens_completion,
          ledgerInputTokens:row.input_tokens,ledgerOutputTokens:row.output_tokens,tokenBasis:nativeTokensMatch?'native':'normalized',provider:data.provider_name}:{reason:'provider_metadata_mismatch'})})
    }
    return reply({receipts})
  }catch{return reply({error:'receipt_check_unavailable'},503)}
})
