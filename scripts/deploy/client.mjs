/**
 * [INPUT]: Private production environment file and explicit Management API requests.
 * [OUTPUT]: Fixed-project client with bounded requests and credential-safe errors.
 * [POS]: Deployment transport; never loads development credentials or fetches API keys.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { parseEnv } from 'node:util'

export const productionRef = 'keqprrgvcefqdwnxaafv'
export const productionUrl = `https://${productionRef}.supabase.co`

export async function productionClient() {
  const path = '.env.deploy.production.local'
  const info = await stat(path)
  assert((info.mode & 0o077) === 0, 'Production credential file must be readable only by its owner (chmod 600)')
  const env = parseEnv(await readFile(path, 'utf8'))
  assert(env.SUPABASE_PROJECT_REF === productionRef, 'Production project ref mismatch; no request was sent')
  const token = env.SUPABASE_ACCESS_TOKEN?.trim()
  assert(token, `Set SUPABASE_ACCESS_TOKEN in ${path}; do not send it through chat`)
  const safe = value => String(value).replaceAll(token, '[redacted]').replace(/sbp_[\w-]+/gu, '[redacted]')
  async function request(pathname, { method = 'GET', json, form, binary = false } = {}) {
    assert(pathname === '' || (pathname.startsWith('/') && !pathname.startsWith('//')), 'Expected a relative Management API path')
    const target = `https://api.supabase.com/v1/projects/${productionRef}${pathname}`
    let response
    try {
      response = await fetch(target, {
        method, headers: { authorization: `Bearer ${token}`, ...(json ? { 'content-type': 'application/json' } : {}) },
        body: form ?? (json ? JSON.stringify(json) : undefined), signal: AbortSignal.timeout(60000), redirect: 'error',
      })
    } catch (error) {
      throw Error(`${method} ${pathname}: request failed (${safe(error.cause?.code ?? error.name)}). A write outcome may be unknown; inspect remote state before retrying.`)
    }
    if (!response.ok) {
      let message = ''
      try { message = (await response.json()).message ?? '' } catch {}
      throw Error(`${method} ${pathname}: HTTP ${response.status}${message ? `; ${safe(message).slice(0, 600)}` : ''}`)
    }
    if (binary) return Buffer.from(await response.arrayBuffer())
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }
  const query = (sql, readOnly = false) => request('/database/query', { method: 'POST', json: { query: sql, read_only: readOnly } })
  return { request, query, safe }
}
