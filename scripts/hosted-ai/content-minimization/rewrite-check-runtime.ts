/**
 * [INPUT]: One compiled synthetic owner/action, verified Auth, and runtime provider Secret.
 * [OUTPUT]: Finite response-shape diagnostics through the actual admitted handler; no content or key export.
 * [POS]: Temporary bounded rewrite diagnosis, removed after one journaled request.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHostedHandler } from '../../../supabase/functions/hosted-ai/handler'
import { parseAssistance } from '../../../apps/desktop/src/domain/smart/assistance'
import { retainsNoteAnchors } from '../../../apps/desktop/src/domain/smart/rewrite-notes'
declare const __OWNER__: string, __ACTION__: string
const url=Deno.env.get('SUPABASE_URL')??'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',providerKey=Deno.env.get('HOSTED_AI_OPENROUTER_KEY')??''
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
Deno.serve(async request=>{
  try {
    if(request.method!=='POST' || new URL(request.url).search || Number(request.headers.get('content-length'))>256*1024)return reply({error:'permission_denied'},403)
    const authorization=request.headers.get('authorization')??''
    const auth=await fetch(`${url}/auth/v1/user`,{headers:{authorization,apikey:serviceKey},signal:AbortSignal.timeout(10000),redirect:'error'})
    const user=await auth.json()
    if(!auth.ok || user.id!==__OWNER__ || user.app_metadata?.hosted_acceptance_fixture!=='v1')return reply({error:'permission_denied'},403)
    const raw=await request.text();if(raw.length>256*1024)return reply({error:'permission_denied'},403)
    const input=JSON.parse(raw)
    if(input.actionId!==__ACTION__ || input.request?.capability!=='assistance' || input.request.input?.request?.mode!=='rewrite')return reply({error:'permission_denied'},403)
    const facts:Record<string,unknown>={upstreamObserved:false}
    const wrapped:typeof fetch=async(target,init)=>{
      const response=await fetch(target,init)
      if(String(target)==='https://openrouter.ai/api/v1/chat/completions') {
        facts.upstreamObserved=true;facts.upstreamOk=response.ok;facts.httpStatus=response.status
        try {
          const text=await response.clone().text()
          if(new TextEncoder().encode(text).length>256*1024){facts.envelopeBounded=false;return response}
          facts.envelopeBounded=true
          const data=JSON.parse(text)
          facts.envelopeObject=!!data && typeof data==='object' && !Array.isArray(data)
          if(!response.ok) {
            const error=JSON.stringify(data?.error??{}).slice(0,64000)
            facts.errorMentionsReasoning=/reasoning|thinking/i.test(error)
            facts.errorMentionsFormat=/response_format|json|structured/i.test(error)
            facts.errorMentionsAuth=/auth|api.?key|credential/i.test(error)
            facts.errorMentionsBudget=/credit|balance|funds|budget/i.test(error)
            facts.errorMentionsRate=/rate.limit|overloaded|429/i.test(error)
            facts.errorMentionsRoute=/no endpoint|not.available|no.provider/i.test(error)
            facts.errorMentionsPolicy=/data.policy|privacy|logging|zero.?data|zdr|retention/i.test(error)
            facts.errorMentionsRegion=/region|geo|location|country/i.test(error)
            facts.errorMentionsUnsupported=/support|invalid|bad.request/i.test(error)
            facts.errorCode=Number.isInteger(data?.error?.code)&&data.error.code>=100&&data.error.code<=599?data.error.code:0
          }
          facts.providerCorrect=data?.provider===undefined || data.provider==='DeepSeek'
          facts.choicesCount=Array.isArray(data?.choices)?Math.min(data.choices.length,10):0
          const choice=data?.choices?.[0],content=choice?.message?.content
          facts.finishReason=['stop','length','content_filter','tool_calls','error'].includes(choice?.finish_reason)?choice.finish_reason:'other'
          facts.contentString=typeof content==='string'
          if(typeof content==='string') {
            facts.contentLength=Math.min(content.length,256*1024)
            try {
              const result=JSON.parse(content)
              facts.jsonValid=true;facts.resultObject=!!result && typeof result==='object' && !Array.isArray(result)
              facts.kind=['rewrite','clarify','proposal'].includes(result?.kind)?result.kind:'other'
              facts.descriptionString=typeof result?.description==='string'
              facts.unexpectedFieldCount=result && typeof result==='object'?Object.keys(result).filter(k=>!['kind','description'].includes(k)).length:0
              try{parseAssistance(content);facts.schemaValid=true}catch{facts.schemaValid=false}
              facts.anchorsRetained=typeof result?.description==='string' && retainsNoteAnchors(input.request.input.context.item.description,result.description)
            }catch{facts.jsonValid=false}
          }
        }catch{facts.envelopeValid=false}
      }
      return response
    }
    const handler=createHostedHandler({url,serviceKey,providerKey,environment:'development',fetch:wrapped})
    const response=await handler(new Request(`${url}/functions/v1/hosted-ai`,{method:'POST',headers:{authorization,'content-type':'application/json'},body:raw}))
    const body=await response.json()
    return reply({httpStatus:response.status,ready:body.status==='ready',failure:['malformed_response','provider_failed','outcome_pending','result_not_delivered','permission_denied','routing_policy'].includes(body.error)?body.error:null,facts})
  }catch{return reply({error:'diagnostic_unavailable'},503)}
})
