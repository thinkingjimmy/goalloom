/**
 * [INPUT]: One fixture URL, bounded request options, classified operation and explicit scope-check recovery opt-in.
 * [OUTPUT]: Original HTTP result or finite body-free failure; exact read-only scope checks may recover one pre-status ECONNRESET.
 * [POS]: Fixture transport used by fixture-support; recovery reuses the original deadline and never retries writes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
const names=new Set(['Error','TypeError','RangeError','SyntaxError','AbortError','TimeoutError','AggregateError','SystemError','AssertionError','FixtureRequestError'])
const codes=new Set([
 'EAI_AGAIN','ENOTFOUND','ECONNREFUSED','ECONNRESET','ECONNABORTED','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT','EPIPE',
 'EACCES','EPERM','EADDRINUSE','EADDRNOTAVAIL',
 'ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN',
 'UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_SSL_WRONG_VERSION_NUMBER',
 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR','ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED',
 'UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','UND_ERR_ABORTED',
 'UND_ERR_DESTROYED','UND_ERR_CLOSED','UND_ERR_RES_CONTENT_LENGTH_MISMATCH','ERR_INVALID_URL',
])
const syscalls=new Set(['getaddrinfo','connect','read','write','recv','send','shutdown'])
const methods=new Set(['GET','POST','PUT','PATCH','DELETE','HEAD'])
export function fixtureErrorDetails(error){
 let remaining=12
 const seen=new WeakSet()
 const visit=(value,depth)=>{
  if(!value||typeof value!=='object')return null
  if(depth>3||remaining--<=0||seen.has(value))return{truncated:true}
  seen.add(value)
  const result={name:names.has(value.name)?value.name:'unknown',code:value.code==null?null:codes.has(value.code)?value.code:'unknown',syscall:value.syscall==null?null:syscalls.has(value.syscall)?value.syscall:'unknown'}
  if(value.cause)result.cause=visit(value.cause,depth+1)
  if(Array.isArray(value.errors)){
   result.errors=value.errors.slice(0,4).map(child=>visit(child,depth+1))
   if(value.errors.length>4)result.truncated=true
  }
  return result
 }
 return visit(error,0)
}
export function fixtureRequestFailure(diagnostic){
 const error=new Error(diagnostic.kind==='transport_failure'?'Fixture transport outcome unknown':'Fixture HTTP request failed')
 error.name='FixtureRequestError';error.requestDiagnostic=diagnostic;return error
}
export async function fixtureHttpRequest(url,init,operation,recoverScopeCheck=false){
 const started=performance.now()
 let recoveryAllowed=false,previousAttempt
 if(recoverScopeCheck===true&&init.method==='POST'&&operation==='rpc:lifecycle_scope_check'&&init.signal instanceof AbortSignal){
  try{const route=new URL(url);recoveryAllowed=route.pathname==='/rest/v1/rpc/lifecycle_scope_check'&&!route.search&&!route.hash}catch{/* Fetch retains invalid-URL diagnostics. */}
 }
 for(let attempt=1;;attempt++){
  const diagnostic={kind:'transport_failure',operation,method:methods.has(init.method??'GET')?init.method??'GET':'other',phase:'fetch',elapsedMs:0,status:null,code:null,
   ...(previousAttempt?{attempt,previousAttempts:[previousAttempt]}:{})}
  let response,data
  try{
   response=await fetch(url,init)
   diagnostic.status=response.status;diagnostic.phase='body'
   data=Buffer.from(await response.arrayBuffer())
  }catch(error){
   diagnostic.elapsedMs=Math.round(performance.now()-started);diagnostic.cause=fixtureErrorDetails(error)
   if(init.signal?.aborted)diagnostic.abortReason=fixtureErrorDetails(init.signal.reason)
   let cause=diagnostic.cause,reset=false
   while(cause){if(cause.code==='ECONNRESET')reset=true;cause=cause.cause}
   if(recoveryAllowed&&attempt===1&&diagnostic.status===null&&reset&&!init.signal.aborted){previousAttempt=diagnostic;continue}
   throw fixtureRequestFailure(diagnostic)
  }
  diagnostic.kind='http_response';diagnostic.elapsedMs=Math.round(performance.now()-started)
  if(data.length>4*1024*1024){const error=fixtureRequestFailure(diagnostic);error.message='Fixture response byte cap exceeded';throw error}
  let value=null;diagnostic.bodyFormat=data.length?'non_json':'empty'
  try{if(data.length){value=JSON.parse(data.toString('utf8'));diagnostic.bodyFormat='json'}}catch{/* Storage bytes and service bodies remain private. */}
  diagnostic.code=typeof value?.code==='string'&&/^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(value.code)?value.code:null
  diagnostic.phase='complete'
  return{status:response.status,body:value,bytes:data,headers:response.headers,requestDiagnostic:diagnostic}
 }
}
