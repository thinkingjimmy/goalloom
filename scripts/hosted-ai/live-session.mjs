/**
 * [INPUT]: Scoped environment-specific Management API-key access and an explicit fixture lifecycle mode.
 * [OUTPUT]: Owner-only synthetic Auth session/renewal or verified soft deletion; real AI receipts remain intact.
 * [POS]: Manual live-acceptance fixture. No provider calls, email messages or budget changes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, stat, writeFile, unlink, rename } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { client, readFetch } from './client.mjs'
import { acceptanceTarget } from './acceptance-target.mjs'
const { args, environment, projectRef, projectUrl, config, sessionFile, prefix } = acceptanceTarget()

const mode = args[0]
assert(args.length === 1 && ['--create', '--renew', '--cleanup'].includes(mode), 'Use --create, --renew or --cleanup')
const path = sessionFile
const db = await client(config, environment)
const keys = await db.request('/api-keys?reveal=true')
const service = keys.find(key => key.name === 'service_role')?.api_key
const anon = keys.find(key => key.name === 'anon')?.api_key
assert(service && anon, 'Project Auth keys unavailable')
db.hide(service); db.hide(anon)
const auth = async (endpoint, { method = 'GET', json, token = service } = {}) => {
  const response = await (method === 'GET' ? readFetch : fetch)(`${projectUrl}/auth/v1/${endpoint}`, { method,
    headers: { authorization: `Bearer ${token}`, apikey: anon, 'content-type': 'application/json' },
    ...(json ? { body: JSON.stringify(json) } : {}), signal: AbortSignal.timeout(15000), redirect: 'error' })
  const body = await response.json().catch(() => null)
  assert(response.ok, `Fixture Auth ${method}: HTTP ${response.status}`)
  return body
}
let created
try {
  if (mode === '--create') {
    try { await stat(path); throw Error('Private session exists; recover it or clean it up first') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    const email = `hosted-live-${randomUUID()}@goalloom.test`, password = randomBytes(32).toString('base64url')
    created = await auth('admin/users', { method: 'POST', json: { email, password, email_confirm: true, app_metadata: { hosted_acceptance_fixture: 'v1' } } })
    const login = await auth('token?grant_type=password', { method: 'POST', token: anon, json: { email, password } })
    db.hide(login.access_token); db.hide(login.refresh_token)
    const env = { SUPABASE_PROJECT_REF: projectRef, SUPABASE_ANON_KEY: anon, HOSTED_AI_SESSION_TOKEN: login.access_token,
      HOSTED_AI_SESSION_REFRESH_TOKEN:login.refresh_token,HOSTED_AI_SYNTHETIC_USER_ID: created.id, HOSTED_AI_SYNTHETIC_EMAIL: email }
    await writeFile(path, Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 })
    console.log('Synthetic selected-project session prepared privately; no model call or email sent.')
  } else if(mode==='--renew') {
    assert(((await stat(path)).mode & 0o077)===0,'Session must be owner-only')
    const env=parseEnv(await readFile(path,'utf8')),id=env.HOSTED_AI_SYNTHETIC_USER_ID
    assert(env.SUPABASE_PROJECT_REF===projectRef && /^[0-9a-f-]{36}$/i.test(id),'Exact selected-project fixture required')
    const user=await auth(`admin/users/${id}`)
    assert(!user.deleted_at && user.app_metadata?.hosted_acceptance_fixture==='v1' && user.email===env.HOSTED_AI_SYNTHETIC_EMAIL && user.email.endsWith('@goalloom.test'),'Fixture owner changed')
    let session
    if(env.HOSTED_AI_SESSION_REFRESH_TOKEN)session=await auth('token?grant_type=refresh_token',{method:'POST',token:anon,json:{refresh_token:env.HOSTED_AI_SESSION_REFRESH_TOKEN}})
    else {
      const link=await auth('admin/generate_link',{method:'POST',json:{type:'magiclink',email:user.email}})
      assert(link.hashed_token && (link.user?.id??link.id)===id,'Generated link changed the fixture identity')
      session=await auth('verify',{method:'POST',token:anon,json:{token_hash:link.hashed_token,type:'email'}})
    }
    assert(session.user?.id===id && session.access_token && session.refresh_token,'Renewal changed the fixture account')
    env.HOSTED_AI_SESSION_TOKEN=session.access_token;env.HOSTED_AI_SESSION_REFRESH_TOKEN=session.refresh_token
    await writeFile(`${path}.tmp`,Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600})
    await rename(`${path}.tmp`,path)
    console.log('Same synthetic Auth fixture renewed privately; original actions and fees retained, no email or model call.')
  } else {
    assert(((await stat(path)).mode & 0o077) === 0, 'Session must be owner-only')
    const env = parseEnv(await readFile(path, 'utf8')), id = env.HOSTED_AI_SYNTHETIC_USER_ID
    assert(env.SUPABASE_PROJECT_REF === projectRef && /^[0-9a-f-]{36}$/i.test(id), 'Not a selected-project fixture session')
    const user = await auth(`admin/users/${id}`)
    assert(user.id === id && (user.deleted_at || user.app_metadata?.hosted_acceptance_fixture === 'v1'), 'Fixture ownership marker missing')
    const receipts = () => db.query(`select action_id,charged_micro,provider_request_id from public.ai_actions where user_id='${id}' order by action_id;`)
    const before = await receipts()
    if (!user.deleted_at) {
      assert(user.email === env.HOSTED_AI_SYNTHETIC_EMAIL && user.email?.endsWith('@goalloom.test'), 'Fixture identity changed')
      await auth(`admin/users/${id}`, { method: 'DELETE', json: { should_soft_delete: true } })
    }
    const after = await auth(`admin/users/${id}`)
    assert(after.deleted_at, 'Fixture not soft-deleted')
    const access = await readFetch(`${projectUrl}/auth/v1/user`, { headers: { authorization: `Bearer ${env.HOSTED_AI_SESSION_TOKEN}`, apikey: anon }, signal: AbortSignal.timeout(15000), redirect: 'error' })
    assert([401, 403].includes(access.status), 'Fixture session is still usable')
    assert(JSON.stringify(await receipts()) === JSON.stringify(before), 'Auth cleanup changed real cost receipts')
    await unlink(path)
    await writeFile(`output/tests/hosted-ai/${prefix}session-cleanup.json`, JSON.stringify({ ok: true, syntheticAuthSoftDeleted: true, sessionRejected: true, realCostReceiptsRetained: before.length, privateSessionRemoved: true, scope: 'Only the marked selected-project fixture is soft-deleted; real cost facts and cumulative budget remain.' }, null, 2) + '\n')
    console.log('Synthetic Auth fixture soft-deleted; access invalidated, private session removed, real receipts retained.')
  }
} catch (error) {
  // No AI actions can exist before session creation succeeds.
  if (created) await auth(`admin/users/${created.id}`, { method: 'DELETE' }).catch(() => undefined)
  console.error(db.safe(error.message)); process.exitCode = 1
}
