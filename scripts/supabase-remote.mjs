/**
 * Hosted Realtime, Storage and JWT checks for project asqyvcnxdltzzfutbbqy.
 * Reads SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
 * Requires Node.js 22 or newer for the global WebSocket (package.json engines).
 * Creates and deletes its own @goalloom.test user. Does not print secrets.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { deleteUserData } from './supabase-reset.mjs'

if (typeof WebSocket === 'undefined') {
  console.error('This script needs a global WebSocket. Use Node.js 22 or newer (`package.json` engines).')
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) {
  console.error('SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required. See supabase/README.md.')
  process.exit(1)
}

const email = `p0-${randomUUID()}@goalloom.test`
const password = randomBytes(24).toString('base64url')
const workspaceId = randomUUID()
const generation = randomUUID()
const objectPath = `workspaces/${workspaceId}/1.bin`
const checks = []

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'pass' : 'fail'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function bytea(size = 32) {
  return `\\x${randomBytes(size).toString('hex')}`
}

function fail(error) {
  return error?.message ?? error?.error_description ?? String(error ?? 'unknown error')
}

async function admin(path, init = {}) {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} ${response.status} ${text.slice(0, 300)}`)
  return body
}

function subscribe(channel, ms) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve('TIMED_OUT'), ms)
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timer)
        resolve(status)
      }
    })
  })
}

function broadcastHead(message) {
  const value = message?.payload?.head ?? message?.head
  return value == null ? null : Number(value)
}

function waitForHead(messages, seq, ms) {
  const started = Date.now()
  return new Promise(resolve => {
    const timer = setInterval(() => {
      const hit = messages.some(message => broadcastHead(message) === seq)
      if (hit || Date.now() - started >= ms) {
        clearInterval(timer)
        resolve(hit)
      }
    }, 50)
  })
}

const user = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
let userId = null
let peer = null
let stranger = null
let publicClient = null

try {
  const created = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  userId = created.id
  check('admin creates a confirmed test user', Boolean(userId))

  const signedIn = await user.auth.signInWithPassword({ email, password })
  if (signedIn.error || !signedIn.data.session) throw new Error(fail(signedIn.error))
  const access = signedIn.data.session.access_token
  const claims = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString())
  check('access token carries session_id', Boolean(claims.session_id), claims.session_id ? '' : 'claim missing')
  await user.realtime.setAuth(access)

  const registered = await user.rpc('register_device', {
    p_name: 'phase0', p_platform: 'macos', p_sign_pub: bytea(), p_box_pub: bytea(), p_protocol: 1,
  })
  if (registered.error || !registered.data) throw new Error(fail(registered.error))
  const deviceId = registered.data
  check('register_device', true, deviceId)

  const authorized = await service.from('devices').update({ status: 'authorized' }).eq('id', deviceId).select('id,status')
  check('service role marks the device authorized', !authorized.error && authorized.data?.[0]?.status === 'authorized', fail(authorized.error))

  const workspace = await service.from('workspaces').insert({ id: workspaceId, user_id: userId, generation }).select('id')
  check('service role inserts the workspace', !workspace.error && workspace.data?.[0]?.id === workspaceId, fail(workspace.error))

  const snapshot = await service.from('snapshots').insert({
    workspace_id: workspaceId, upto_seq: 1, format_version: 1, key_epoch: 1,
    object_path: objectPath, sha256: 'ab'.repeat(32), size: 3, state: 'published', created_by: deviceId,
  }).select('upto_seq')
  check('service role publishes a snapshot row', !snapshot.error, fail(snapshot.error))

  const pushed = await user.rpc('push_ops', {
    p_workspace: workspaceId, p_device: deviceId, p_generation: generation,
    p_ops: [{ op_id: randomUUID(), payload_hash: 'ab'.repeat(32), format_version: 1, key_epoch: 1, ciphertext: 'aa' }],
  })
  const first = pushed.data?.[0]
  check('push_ops allocates seq 1', !pushed.error && first?.seq === 1 && first?.duplicate === false, fail(pushed.error) || JSON.stringify(first))

  const denied = await user.rpc('snapshot_access', { p_device: deviceId, p_workspace: workspaceId, p_seq: 1, p_path: 'workspaces/other/1.bin' })
  check('snapshot_access rejects a foreign path', Boolean(denied.error), denied.error ? '' : 'rpc succeeded')
  const allowed = await user.rpc('snapshot_access', { p_device: deviceId, p_workspace: workspaceId, p_seq: 1, p_path: objectPath })
  check('snapshot_access returns the published object', !allowed.error && allowed.data?.[0]?.object_path === objectPath, fail(allowed.error) || JSON.stringify(allowed.data))

  const edge = async (path, method) => {
    const response = await fetch(`${url}/functions/v1/snapshot-url`, {
      method: 'POST',
      headers: { authorization: `Bearer ${access}`, apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId, workspaceId, seq: 1, path, method }),
    })
    const text = await response.text()
    return { status: response.status, body: text }
  }
  const foreign = await edge('workspaces/other/1.bin', 'download')
  check('snapshot-url rejects a foreign path', foreign.status === 403, String(foreign.status))
  const missing = await edge(objectPath, 'download')
  check('snapshot-url returns 404 when the object is missing', missing.status === 404, `${missing.status} ${missing.body.slice(0, 180)}`)
  const uploaded = await service.storage.from('snapshots').upload(objectPath, new Uint8Array([1, 2, 3]), {
    contentType: 'application/octet-stream',
    upsert: true,
  })
  check('storage upload writes the snapshot object', !uploaded.error, uploaded.error?.message ?? '')
  const download = await edge(objectPath, 'download')
  let downloadUrl = ''
  try { downloadUrl = JSON.parse(download.body).signedUrl ?? '' } catch { downloadUrl = '' }
  check('snapshot-url returns a 60s download url', download.status === 200 && downloadUrl.startsWith('http'), `${download.status} ${download.body.slice(0, 180)}`)
  const upload = await edge(objectPath, 'upload')
  let uploadBody = {}
  try { uploadBody = JSON.parse(upload.body) } catch { uploadBody = {} }
  check('snapshot-url returns a 7200s upload url', upload.status === 200 && uploadBody.expiresIn === 7200 && String(uploadBody.signedUrl ?? '').startsWith('http'), `${upload.status} ${upload.body.slice(0, 180)}`)

  const topic = `ws:${workspaceId}`
  peer = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const peerSign = await peer.auth.signInWithPassword({ email, password })
  if (peerSign.error || !peerSign.data.session) throw new Error(fail(peerSign.error))
  const peerAccess = peerSign.data.session.access_token
  const peerClaims = JSON.parse(Buffer.from(peerAccess.split('.')[1], 'base64url').toString())
  await peer.realtime.setAuth(peerAccess)
  const peerRegistered = await peer.rpc('register_device', {
    p_name: 'phase0-peer', p_platform: 'ios', p_sign_pub: bytea(), p_box_pub: bytea(), p_protocol: 1,
  })
  if (peerRegistered.error || !peerRegistered.data) throw new Error(fail(peerRegistered.error))
  const peerDeviceId = peerRegistered.data
  const peerAuthorized = await service.from('devices').update({ status: 'authorized' }).eq('id', peerDeviceId).select('id,status,auth_session_id')
  const peerRow = peerAuthorized.data?.[0]
  check(
    'peer device is authorized on its own session',
    !peerAuthorized.error && peerRow?.status === 'authorized' && peerRow?.auth_session_id === peerClaims.session_id,
    fail(peerAuthorized.error) || `session ${peerRow?.auth_session_id ?? 'missing'}`,
  )
  const heads = []
  const peerChannel = peer.channel(topic, { config: { private: true } })
  peerChannel.on('broadcast', { event: 'head' }, payload => heads.push(payload))
  const peerJoined = await subscribe(peerChannel, 8000)
  check('peer subscribes to the private workspace channel', peerJoined === 'SUBSCRIBED', peerJoined)
  const second = await user.rpc('push_ops', {
    p_workspace: workspaceId, p_device: deviceId, p_generation: generation,
    p_ops: [{ op_id: randomUUID(), payload_hash: 'cd'.repeat(32), format_version: 1, key_epoch: 1, ciphertext: 'bb' }],
  })
  const secondRow = second.data?.[0]
  const headSeq = Number(secondRow?.seq)
  const heard = await waitForHead(heads, headSeq, 8000)
  check(
    'peer receives push_ops head broadcast',
    !second.error && headSeq > 1 && heard,
    fail(second.error) || `seq=${secondRow?.seq ?? 'missing'} seen=${heads.length} ${JSON.stringify(heads[0] ?? null).slice(0, 180)}`,
  )

  stranger = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const strangerChannel = stranger.channel(topic, { config: { private: true } })
  const strangerJoined = await subscribe(strangerChannel, 8000)
  await stranger.removeChannel(strangerChannel)
  check('unauthorized private subscribe is rejected', strangerJoined !== 'SUBSCRIBED', strangerJoined)

  publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  await publicClient.realtime.setAuth(access)
  const publicChannel = publicClient.channel(topic, { config: { private: false } })
  const publicJoined = await subscribe(publicChannel, 8000)
  await publicClient.removeChannel(publicChannel)
  check('public channel subscribe is rejected', publicJoined !== 'SUBSCRIBED', publicJoined)

  const seen = []
  const channel = user.channel(topic, { config: { private: true, broadcast: { self: true, ack: true } } })
  channel.on('broadcast', { event: 'head' }, payload => seen.push(payload))
  const joined = await subscribe(channel, 8000)
  check('realtime subscribe', joined === 'SUBSCRIBED', joined)
  const sent = await channel.send({ type: 'broadcast', event: 'head', payload: { head: 1 } })
  await new Promise(resolve => setTimeout(resolve, 2000))
  check('realtime broadcast received', sent === 'ok' && seen.length > 0, `send=${sent} seen=${seen.length}`)

  const revoked = await user.rpc('revoke_device', { p_actor: deviceId, p_target: deviceId })
  check('revoke_device', !revoked.error, fail(revoked.error))
  const before = seen.length
  const still = await channel.send({ type: 'broadcast', event: 'head', payload: { head: 2 } })
  await new Promise(resolve => setTimeout(resolve, 8000))
  check('existing realtime connection still receives after revoke', still === 'ok' && seen.length > before, `send=${still} seen=${seen.length - before}`)

  await user.removeChannel(channel)
  const again = user.channel(topic, { config: { private: true } })
  const rejoined = await subscribe(again, 8000)
  await user.removeChannel(again)
  check('realtime resubscribe rejected after revoke', rejoined !== 'SUBSCRIBED', rejoined)

  const blocked = await user.rpc('push_ops', {
    p_workspace: workspaceId, p_device: deviceId, p_generation: generation, p_ops: [],
  })
  check('revoked device push is rejected', Boolean(blocked.error), blocked.error ? '' : 'rpc succeeded')
} catch (error) {
  check('script', false, error instanceof Error ? error.message : String(error))
} finally {
  if (userId) {
    await service.storage.from('snapshots').remove([objectPath]).catch(() => {})
    await deleteUserData(service, userId).catch(error => {
      console.error(`row cleanup failed for ${email}: ${error instanceof Error ? error.message : error}`)
    })
    await admin(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }).catch(error => {
      console.error(`cleanup failed for ${email}: ${error instanceof Error ? error.message : error}`)
    })
  }
  if (peer) await peer.removeAllChannels().catch(() => {})
  await peer?.realtime.disconnect()
  await stranger?.realtime.disconnect()
  await publicClient?.realtime.disconnect()
  await user.realtime.disconnect()
}

const failed = checks.filter(item => !item.ok)
console.log(`${checks.length - failed.length}/${checks.length} passed`)
if (failed.length) process.exit(1)
