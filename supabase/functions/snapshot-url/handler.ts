// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Current project Auth, service version and exact approved snapshot tuple plus bounded ciphertext.
 * [OUTPUT]: Fenced transfer with durable upload tickets, late-write deletion reconciliation and no Storage credential.
 * [POS]: Normal snapshot proxy with D2 lifecycle integration; retrieval remains independently authorized.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { boundedBytes, reply } from '../billing/http.ts'
import { uuid } from '../billing/config.ts'
type Config = { url: string; serviceKey: string; producerSha256: string; fetch?: typeof fetch }
type Metadata = { object_path: string; sha256: string; size: number }
class TransferFailure extends Error {
  constructor(readonly code: string, readonly status: number, readonly details: Record<string, unknown> = {}) { super(code) }
}
const maximum = 2 * 1024 * 1024
const known = new Set(['upgrade_required','billing_configuration','service_not_started','service_expired','service_revoked',
  'snapshot_conflict','snapshot_not_found','invalid_request','authentication_failed'])
const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))].map(value=>value.toString(16).padStart(2,'0')).join('')
export function createSnapshotHandler(config: Config): (request: Request) => Promise<Response> {
  const http = config.fetch ?? fetch
  return async request => {
    let ticket: string | null = null
    let transferState: 'complete' | 'failed' | 'unknown' = 'failed'
    const settleTransfer = async (): Promise<boolean> => {
      if (!ticket) return false
      const response = await http(`${config.url}/rest/v1/rpc/lifecycle_transfer_finish`, { method: 'POST',
        headers: { authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey, 'content-type': 'application/json' },
        body: JSON.stringify({ p_ticket: ticket, p_state: transferState }), signal: AbortSignal.timeout(10000), redirect: 'error' })
      if (!response.ok) throw new TransferFailure('snapshot_unavailable',503)
      const value = JSON.parse(new TextDecoder().decode(await boundedBytes(response,16384))) as { ok?: boolean; current?: boolean }
      if (value.ok !== true) throw new TransferFailure('snapshot_unavailable',503)
      ticket = null
      return value.current === true
    }
    try {
      if (!['https://asqyvcnxdltzzfutbbqy.supabase.co','https://keqprrgvcefqdwnxaafv.supabase.co'].includes(config.url) || !config.serviceKey || !/^[a-f0-9]{64}$/.test(config.producerSha256)) throw new TransferFailure('billing_configuration',503)
      const authorization = request.headers.get('authorization')
      if (!authorization?.startsWith('Bearer ')) throw new TransferFailure('authentication_failed',401)
      let claims
      try { claims = JSON.parse(atob(authorization.slice(7).split('.')[1].replaceAll('-','+').replaceAll('_','/'))) }
      catch { throw new TransferFailure('authentication_failed',401) }
      if (!claims || claims.iss !== `${config.url}/auth/v1` || claims.role !== 'authenticated' || !uuid.test(claims.sub ?? '')
        || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw new TransferFailure('authentication_failed',401)
      const auth = await http(`${config.url}/auth/v1/user`, { headers: { authorization, apikey: config.serviceKey }, signal: AbortSignal.timeout(10000), redirect: 'error' })
      if (!auth.ok) throw new TransferFailure([401,403].includes(auth.status) ? 'authentication_failed' : 'snapshot_unavailable',[401,403].includes(auth.status) ? 401 : 503)
      const user = JSON.parse(new TextDecoder().decode(await boundedBytes(auth,16384))) as { id?: string }
      if (user.id !== claims.sub) throw new TransferFailure('authentication_failed',401)
      if (request.headers.has('origin')) throw new TransferFailure('permission_denied',403)
      if (request.headers.get('x-goalloom-service-version') !== '2' || request.method === 'POST') throw new TransferFailure('upgrade_required',409,{minServiceVersion:2})
      if (!['GET','PUT'].includes(request.method)) throw new TransferFailure('method_not_allowed',405)
      const url = new URL(request.url), params = url.searchParams, keys = ['v','deviceId','workspaceId','generation','seq','path']
      if (url.search.length > 2048 || [...params.keys()].length !== keys.length || keys.some(key=>params.getAll(key).length!==1)
        || [...params.keys()].some(key=>!keys.includes(key)) || params.get('v') !== '1'
        || ['deviceId','workspaceId','generation'].some(key=>!uuid.test(params.get(key) ?? ''))
        || !/^(?:0|[1-9][0-9]{0,15})$/.test(params.get('seq') ?? '') || !Number.isSafeInteger(Number(params.get('seq')))) throw new TransferFailure('invalid_request',400)
      const method = request.method === 'PUT' ? 'upload' : 'download', path = params.get('path')!
      if (path.length > 256 || !/^[a-zA-Z0-9/_-]+\.bin$/.test(path) || path.includes('..')) throw new TransferFailure('invalid_request',400)
      const args = { p_device: params.get('deviceId'), p_workspace: params.get('workspaceId'), p_generation: params.get('generation'),
        p_seq: Number(params.get('seq')), p_path: path, p_method: method }
      const access = async (): Promise<Metadata> => {
        const response = await http(`${config.url}/rest/v1/rpc/snapshot_transfer_access`, { method: 'POST',
          headers: { authorization, apikey: config.serviceKey, 'content-type':'application/json','x-goalloom-service-version':'2' },
          body: JSON.stringify(args), signal: AbortSignal.timeout(10000), redirect: 'error' })
        const data = JSON.parse(new TextDecoder().decode(await boundedBytes(response,16384))) as unknown
        if (!response.ok) {
          if (response.status===401) throw new TransferFailure('authentication_failed',401)
          const error = data as { message?: string; code?: string; details?: string }
          if (known.has(error.message ?? '')) {
            let details: Record<string, unknown> = {}
            try { const value=JSON.parse(error.details ?? '{}');for (const key of ['billingStatus','serverNow','effectiveEnd','minServiceVersion']) if (['string','number'].includes(typeof value[key]) || value[key]===null) details[key]=value[key] } catch { /* Optional metadata does not widen access. */ }
            throw new TransferFailure(error.message!,error.code==='22023'?400:response.status,details)
          }
          throw new TransferFailure(error.code==='42501'?'permission_denied':'snapshot_unavailable',error.code==='42501'?403:503)
        }
        if (!Array.isArray(data) || data.length!==1) throw new TransferFailure('snapshot_not_found',404)
        const meta=data[0] as Metadata
        if (meta.object_path!==path || !/^[a-f0-9]{64}$/.test(meta.sha256) || !Number.isSafeInteger(meta.size) || meta.size<1 || meta.size>maximum) throw new TransferFailure('snapshot_conflict',409)
        return meta
      }
      const initial = await access()
      const started = await http(`${config.url}/rest/v1/rpc/lifecycle_transfer_begin`, { method: 'POST',
        headers: { authorization, apikey:config.serviceKey,'content-type':'application/json','x-goalloom-service-version':'2' },
        body: JSON.stringify({ ...args, p_producer: config.producerSha256 }),signal:AbortSignal.timeout(10000),redirect:'error' })
      if (!started.ok) throw new TransferFailure('snapshot_unavailable',503)
      const transfer = JSON.parse(new TextDecoder().decode(await boundedBytes(started,16384))) as { ticketId?: unknown }
      if (typeof transfer.ticketId !== 'string' || !uuid.test(transfer.ticketId)) throw new TransferFailure('snapshot_unavailable',503)
      ticket = transfer.ticketId
      const endpoint = `${config.url}/storage/v1/object/snapshots/${path.split('/').map(encodeURIComponent).join('/')}`
      const storageHeaders = { authorization:`Bearer ${config.serviceKey}`,apikey:config.serviceKey }
      const readObject = async (): Promise<Uint8Array> => {
        const response = await http(endpoint,{headers:storageHeaders,signal:AbortSignal.timeout(15000),redirect:'error'})
        if (!response.ok) throw new TransferFailure(response.status===404?'snapshot_not_found':'snapshot_unavailable',response.status===404?404:503)
        let bytes
        try { bytes=await boundedBytes(response,maximum) } catch { throw new TransferFailure('snapshot_unavailable',503) }
        if (bytes.length!==initial.size || await digest(bytes)!==initial.sha256) throw new TransferFailure('snapshot_conflict',409)
        return bytes
      }
      let bytes: Uint8Array
      if (method==='upload') {
        if (request.headers.get('content-type')?.split(';')[0] !== 'application/octet-stream') throw new TransferFailure('invalid_request',400)
        try { bytes=await boundedBytes(request,maximum) } catch (error) { throw new TransferFailure(error instanceof Error&&error.message==='too_large'?'too_large':'invalid_request',error instanceof Error&&error.message==='too_large'?413:400) }
        if (bytes.length!==initial.size || await digest(bytes)!==initial.sha256) throw new TransferFailure('snapshot_conflict',409)
        await access()
        const dispatch = await http(`${config.url}/rest/v1/rpc/lifecycle_transfer_dispatch`, { method:'POST',
          headers:{authorization:`Bearer ${config.serviceKey}`,apikey:config.serviceKey,'content-type':'application/json'},
          body:JSON.stringify({p_ticket:ticket}),signal:AbortSignal.timeout(10000),redirect:'error' })
        const permission = JSON.parse(new TextDecoder().decode(await boundedBytes(dispatch,16384))) as {ok?:boolean;current?:boolean}
        if (!dispatch.ok || permission.ok!==true || permission.current!==true) throw new TransferFailure('snapshot_conflict',409)
        transferState = 'unknown'
        const uploaded = await http(endpoint,{method:'POST',headers:{...storageHeaders,'content-type':'application/octet-stream','x-upsert':'false'},body:new Uint8Array(bytes).buffer,signal:AbortSignal.timeout(15000),redirect:'error'})
        if (!uploaded.ok) {
          if ([400,409].includes(uploaded.status)) { transferState = 'failed'; await readObject() }
          else throw new TransferFailure('snapshot_unavailable',503)
        }
        transferState = 'complete'
      } else { bytes=await readObject(); transferState = 'complete' }
      const final = await access()
      if (final.object_path!==initial.object_path || final.sha256!==initial.sha256 || final.size!==initial.size) throw new TransferFailure('snapshot_conflict',409)
      if (!await settleTransfer()) throw new TransferFailure('snapshot_conflict',409)
      if (method==='upload') return reply({version:1,method,sha256:initial.sha256,size:bytes.length})
      return new Response(new Uint8Array(bytes).buffer,{headers:{'content-type':'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff','x-goalloom-content-sha256':initial.sha256}})
    } catch (error) {
      if (ticket) await settleTransfer().catch(() => undefined)
      const failure = error instanceof TransferFailure ? error : new TransferFailure('snapshot_unavailable',503)
      return reply({version:1,error:failure.code,...failure.details},failure.status)
    }
  }
}
