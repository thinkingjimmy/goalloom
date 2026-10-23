/**
 * [INPUT]: Exact synthetic invocation IDs, fixed project identity and memory-only content markers.
 * [OUTPUT]: Complete exposed log-envelope checks and counts; payloads and dynamic fields never leave memory.
 * [POS]: Hosted platform acceptance boundary. Hidden infrastructure retention is outside the exposed log API.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { gunzipSync, inflateSync } from 'node:zlib'

const envelope=new Set(['timestamp','id','event_message','source','severity_text','log_attributes'])
const attributes=new Set(`request.headers.content_length request.headers.cf_connecting_ip request.cf.postalCode request.cf.botManagement.ja3Hash request_id request.sb.jwt.authorization.payload.signature_prefix request.sb.jwt.apikey.payload.signature_prefix execution_time_ms request.sb.jwt.apikey.payload.issued_at function_id request.cf.asOrganization execution_id request.host request.cf.httpProtocol response.headers.date request.cf.botManagement.ja4 request.headers.x_forwarded_proto response.headers.x_served_by response.headers.content_type request.url request.sb.jwt.authorization.payload.issuer request.cf.country deno_origin request.pathname request.sb.jwt.apikey.payload.issuer request.sb.jwt.apikey.payload.role request.sb.auth_user request.sb.jwt.apikey.payload.expires_at request.headers.host request.sb.jwt.authorization.payload.algorithm response.headers.x_sb_edge_region request.headers.user_agent request.headers.accept_encoding request.headers.cf_ipcountry request.headers.accept request.headers.connection request.headers.x_real_ip request.sb.jwt.authorization.payload.role request.sb.jwt.authorization.payload.subject deployment_id identifier request.cf.city response.status_code request.protocol request.cf.colo project_ref request.sb.jwt.authorization.payload.session_id request.cf.timezone response.headers.content_length request.sb.jwt.authorization.payload.expires_at request.sb.jwt.authorization.payload.key_id request.sb.jwt.authorization.payload.issued_at response.headers.vary request.method response.headers.server request.sb.jwt.apikey.payload.algorithm version project event_type level memory_used cpu_time_used served_by reason`.split(' '))
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
// Cloudflare fields follow Supabase packages/shared-data/log-constants.ts; they are network metadata.
for(const field of `asn botManagement.corporateProxy botManagement.detectionIds botManagement.score botManagement.verifiedBot clientTcpRtt continent edgeRequestKeepAliveStatus latitude longitude metroCode region tlsCipher tlsClientAuth.certPresented tlsClientAuth.certRevoked tlsClientAuth.certVerified tlsExportedAuthenticator.clientFinished tlsExportedAuthenticator.clientHandshake tlsExportedAuthenticator.serverFinished tlsExportedAuthenticator.serverHandshake tlsVersion`.split(' '))attributes.add(`request.cf.${field}`)
for(const field of ['region','timestamp','boot_time','memory_used.external','memory_used.heap','memory_used.total'])attributes.add(field)
attributes.add('request.cf.botManagement.staticResource')
attributes.add('request.cf.clientTrustScore')
export function privateContentPresent(value,markers) {
  const visit=(text,depth=0)=>{
    if(markers.some(marker=>marker && text.includes(marker)))return true
    if(depth>=2 || text.length>700000 || !/^[A-Za-z0-9+/_=-]{12,}$/.test(text))return false
    try {
      const bytes=Buffer.from(text,'base64')
      if(visit(bytes.toString('utf8'),depth+1))return true
      for(const decode of [gunzipSync,inflateSync])try{if(visit(decode(bytes,{maxOutputLength:512000}).toString('utf8'),depth+1))return true}catch{}
    }catch{}
    return false
  }
  if(typeof value==='string')return visit(value)
  if(Array.isArray(value))return value.some(v=>privateContentPresent(v,markers))
  return !!value && typeof value==='object' && Object.entries(value).some(([k,v])=>visit(k)||privateContentPresent(v,markers))
}
export function platformLogSafe(row,{projectRef,executionIds,markers=[],onFailure}) {
  const reject=reason=>{onFailure?.(reason);return false}
  if(!row || Object.keys(row).some(k=>!envelope.has(k)) || privateContentPresent(row,markers))return reject('envelope_or_private_content')
  if(!['function_edge_logs','function_logs'].includes(row.source) || !uuid.test(row.id) || !row.log_attributes || typeof row.log_attributes!=='object')return reject('log_identity_or_source')
  const a=row.log_attributes
  if(Object.keys(a).some(k=>!attributes.has(k)))return reject('unknown_attribute')
  if(Object.values(a).some(v=>v!==null && (typeof v!=='string' || v.length>1024)))return reject('attribute_type_or_size')
  if(!executionIds.includes(a.execution_id) || a.project_ref && a.project_ref!==projectRef)return reject('invocation_or_project')
  if(row.source==='function_edge_logs') {
    const url=new URL(`https://${projectRef}.supabase.co/functions/v1/hosted-ai`)
    let actual
    try {actual=new URL(a['request.url'])}catch{return reject('invalid_url')}
    if(actual.origin!==url.origin || actual.pathname!==url.pathname)return reject('invalid_origin_or_path')
    for(const [k,v] of actual.searchParams)if(!(k==='status' && v==='1' || k==='actionId' && uuid.test(v)))return reject('invalid_query')
    if(!['GET','POST'].includes(a['request.method']) || !/^\d{3}$/.test(a['response.status_code']))return reject('invalid_method_or_status')
    if(row.event_message!==`${a['request.method']} | ${a['response.status_code']} | ${a['request.url']}`)return reject('invalid_http_summary')
    if(a['request.headers.user_agent'] && !['node','undici'].includes(a['request.headers.user_agent']))return reject('invalid_user_agent')
    if(a['request.pathname']!=='/functions/v1/hosted-ai')return reject('invalid_path')
  } else {
    if(!/^(?:booted \(time: \d+(?:\.\d+)?ms\)|shutdown|event loop completed|EarlyDrop)$/i.test((row.event_message??'').trim()))return reject('unrecognized_runtime_message')
    for(const key of ['boot_time','cpu_time_used','memory_used.external','memory_used.heap','memory_used.total'])if(a[key] && !/^\d+(?:\.\d+)?$/.test(a[key]))return reject('invalid_runtime_measurement')
  }
  return true
}
export async function inspectInvocationLogs(db,{projectRef,executionIds,markers=[],startedAt,waitMs=60000}) {
  assert(executionIds.length>0 && executionIds.every(id=>uuid.test(id)),'Exact synthetic invocation IDs required')
  const deadline=Date.now()+waitMs
  for(;;) {
    const end=new Date().toISOString(),start=new Date(Date.parse(startedAt)-60000).toISOString()
    // The platform rejects wildcard projections. These six columns are its complete documented public envelope.
    const sql=`select timestamp,id,event_message,source,severity_text,log_attributes from logs where source in ('function_edge_logs','function_logs') and log_attributes['execution_id'] in (${executionIds.map(id=>`'${id}'`).join(',')}) limit 1000`
    const payload=await db.request('/analytics/endpoints/logs?'+new URLSearchParams({sql,iso_timestamp_start:start,iso_timestamp_end:end}))
    assert(!payload.error && Array.isArray(payload.result),'Full log query unavailable')
    assert(payload.result.length<1000,'Log inspection truncated')
    const rows=payload.result,seen=new Set(rows.filter(r=>r.source==='function_edge_logs').map(r=>r.log_attributes?.execution_id))
    const safe=rows.every(row=>platformLogSafe(row,{projectRef,executionIds,markers}))
    assert(safe,'Log payload is outside the reviewed metadata schema')
    if(executionIds.every(id=>seen.has(id)))return {ok:true,completeExposedEnvelopesChecked:rows.length,invocationsChecked:executionIds.length,runtimeEventsChecked:rows.filter(r=>r.source==='function_logs').length,unknownFieldsRejected:true,contentMarkersAbsent:true,scope:'Complete six-field public log envelopes, including every returned log_attributes value. No hidden platform attachment, trace store or physical-retention claim.'}
    assert(Date.now()<deadline,'Synthetic invocation logs have not arrived')
    await new Promise(resolve=>setTimeout(resolve,5000))
  }
}
