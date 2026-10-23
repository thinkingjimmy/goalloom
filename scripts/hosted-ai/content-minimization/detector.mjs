/**
 * [INPUT]: Runtime-only unique synthetic text, compressed copies and random ciphertext.
 * [OUTPUT]: Fixed positive/negative detector results; sample bodies never enter evidence.
 * [POS]: Pre-implementation failure design and scanner control, without real persistence writes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID, randomBytes, createCipheriv } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { metadataOnly } from './scan.mjs'
import { platformLogSafe } from './platform-logs.mjs'
const marker = randomUUID(), text = `Private fixture ${marker}`
const cipher=createCipheriv('aes-256-gcm',randomBytes(32),randomBytes(12))
const encrypted=Buffer.concat([cipher.update(text,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64')
const bad = [{input:text},{output:text},{logs:[{body:text}]},{receipt:{unexpected:text}},
  {provider_request_id:Buffer.from(text).toString('base64')},{failure:gzipSync(text).toString('base64')},
  {result_cipher:encrypted},{failure:randomBytes(96).toString('base64')}]
const checks = bad.map(payload => !metadataOnly(payload, [marker]))
const legal = metadataOnly({user_id:randomUUID(),action_id:randomUUID(),status:'ready',confirmed:true,charged_micro:123,failure:null}, [marker])
const invocation=randomUUID(),url='https://syntheticprojectref.supabase.co/functions/v1/hosted-ai'
const log={timestamp:new Date().toISOString(),id:randomUUID(),event_message:`POST | 400 | ${url}`,source:'function_edge_logs',severity_text:'INFO',log_attributes:{execution_id:invocation,project_ref:'syntheticprojectref','request.url':url,'request.method':'POST','request.pathname':'/functions/v1/hosted-ai','response.status_code':'400','request.headers.user_agent':'node'}}
const context={projectRef:'syntheticprojectref',executionIds:[invocation],markers:[marker]}
const logLeaks=[{...log,body:text},{...log,event_message:text},
  {...log,log_attributes:{...log.log_attributes,'request.body':encrypted}},
  {...log,log_attributes:{...log.log_attributes,'response.body':Buffer.from(text).toString('base64')}},
  {...log,log_attributes:{...log.log_attributes,'request.headers.user_agent':gzipSync(text).toString('base64')}},
  {...log,log_attributes:{...log.log_attributes,attachment:encrypted}},
  {...log,source:'function_logs',event_message:text},
  {...log,log_attributes:{...log.log_attributes,'request.url':url+'?text='+marker}}]
const logChecks=logLeaks.map(row=>!platformLogSafe(row,context)),legalLog=platformLogSafe(log,context)
const report = {ok:checks.every(Boolean) && legal && logChecks.every(Boolean) && legalLog,scope:'Controlled in-memory detector controls; no hosted infrastructure visibility claim',rejectedControls:checks,legalReceiptAccepted:legal,rejectedPlatformLogControls:logChecks,legalPlatformLogAccepted:legalLog,realProviderCalls:0}
await mkdir('output/tests/hosted-ai/content-minimization',{recursive:true})
await writeFile('output/tests/hosted-ai/content-minimization/detector.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
if (!report.ok) process.exitCode=1
