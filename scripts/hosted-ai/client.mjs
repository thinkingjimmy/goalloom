/**
 * [INPUT]: Private, explicit environment-bound Management API credentials.
 * [OUTPUT]: Fixed-project bounded requests, read-only query/transaction recovery and redacted errors.
 * [POS]: Fixed-project hosted AI tooling; production requires its own explicit configuration and environment.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { requestTransport } from '../deploy/transport.mjs'
export { readFetch } from '../deploy/transport.mjs'
export const developmentRef = 'asqyvcnxdltzzfutbbqy'
export const developmentUrl = `https://${developmentRef}.supabase.co`
export async function client(file = '.env.deploy.local', environment = 'development') {
  assert(((await stat(file)).mode & 0o077) === 0, 'Credential file must be owner-only')
  const env = parseEnv(await readFile(file, 'utf8'))
  const projectRef = environment === 'production' ? 'keqprrgvcefqdwnxaafv' : developmentRef
  assert(['development','production'].includes(environment), 'Unknown environment')
  assert(env.SUPABASE_PROJECT_REF === projectRef, 'Expected the configured environment project')
  assert(env.SUPABASE_ACCESS_TOKEN, 'Missing Management API credential')
  const secrets = [env.SUPABASE_ACCESS_TOKEN]
  const safe = value => secrets.reduce((text, secret) => text.replaceAll(secret, '[redacted]'), String(value)).replace(/(?:sbp_|sk-or-)[\w-]+/gu, '[redacted]')
  const send = async (path, { method = 'GET', json, form, binary = false, apiVersion = 1 } = {}, recoverTransaction = false) => {
    assert(path.startsWith('/') && !path.startsWith('//'), 'Expected relative project path')
    assert([1,2].includes(apiVersion), 'Unsupported Management API version')
    const response = await requestTransport(`https://api.supabase.com/v${apiVersion}/projects/${projectRef}${path}`, { method,
      headers: { authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, ...(json ? { 'content-type': 'application/json' } : {}) },
      body: form ?? (json ? JSON.stringify(json) : undefined), signal: AbortSignal.timeout(60_000), redirect: 'error' }, recoverTransaction || method === 'GET' || method === 'POST' && path === '/database/query' && json?.read_only === true)
    if (!response.ok) throw Error(`Management ${method} ${path.split('?')[0]}: HTTP ${response.status}`)
    if (response.status === 204) return null
    if (method === 'DELETE') {const body=await response.text();return body.trim()?JSON.parse(body):null}
    return binary ? Buffer.from(await response.arrayBuffer()) : await response.json()
  }
  const request = (path, options) => send(path, options)
  const queryReadOnlyTransaction = (sql, applicationName) => {
    assert(typeof sql === 'string', 'Read-only transaction requires SQL')
    const statement = sql.trim().replace(/;$/, '')
    assert(/^(select|with)\b/i.test(statement) && !statement.includes(';'), 'Read-only transaction requires one SELECT or WITH without internal semicolons')
    assert(typeof applicationName === 'string' && /^[a-z][a-z0-9_.:-]{0,62}$/i.test(applicationName), 'Finite transaction application name required')
    // Keep the operator role for private tables; SQL READ ONLY enforces the transaction's write boundary.
    return send('/database/query', { method: 'POST', json: { query: `begin read only;set local application_name='${applicationName}';set local lock_timeout='3s';set local statement_timeout='15s';${statement};commit;`, read_only: false } }, true)
  }
  return { request, safe, hide: secret => secrets.push(secret), queryReadOnlyTransaction, query: (sql, readOnly = true) => request('/database/query', { method: 'POST', json: { query: sql, read_only: readOnly } }) }
}
