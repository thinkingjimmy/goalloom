/**
 * Reset the dedicated hosted test project.
 * Removes snapshot objects through the Storage API, then deletes Goalloom rows
 * in an order that satisfies device foreign keys, then deletes @goalloom.test users.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Does not print secrets.
 * Node.js 22 or newer (package.json engines).
 */
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

async function admin(url, serviceKey, path, init = {}) {
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
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} ${response.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

export async function removeSnapshotObjects(client) {
  const root = await client.storage.from('snapshots').list('workspaces', { limit: 1000 })
  if (root.error) throw new Error(root.error.message)
  let removed = 0
  for (const entry of root.data ?? []) {
    if (!entry.name) continue
    const prefix = `workspaces/${entry.name}`
    const nested = await client.storage.from('snapshots').list(prefix, { limit: 1000 })
    if (nested.error) throw new Error(nested.error.message)
    const paths = (nested.data ?? []).filter(file => file.id).map(file => `${prefix}/${file.name}`)
    if (!paths.length) continue
    const result = await client.storage.from('snapshots').remove(paths)
    if (result.error) throw new Error(result.error.message)
    removed += paths.length
  }
  return removed
}

async function mustDelete(label, result) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
}

export async function deleteUserData(client, userId) {
  const devices = await client.from('devices').select('id').eq('user_id', userId)
  if (devices.error) throw new Error(devices.error.message)
  const deviceIds = (devices.data ?? []).map(row => row.id)
  const workspaces = await client.from('workspaces').select('id').eq('user_id', userId)
  if (workspaces.error) throw new Error(workspaces.error.message)
  const workspaceIds = (workspaces.data ?? []).map(row => row.id)
  if (workspaceIds.length) {
    await mustDelete('workspaces', await client.from('workspaces').delete().in('id', workspaceIds))
  }
  if (deviceIds.length) {
    await mustDelete('rpc_buckets', await client.from('rpc_buckets').delete().in('device_id', deviceIds))
    await mustDelete('control_events', await client.from('control_events').delete().in('device_id', deviceIds))
    await mustDelete('devices', await client.from('devices').delete().in('id', deviceIds))
  }
}

export async function listTestUsers(url, serviceKey) {
  const users = []
  for (let page = 1; page <= 20; page += 1) {
    const body = await admin(url, serviceKey, `/auth/v1/admin/users?page=${page}&per_page=200`)
    const batch = body?.users ?? []
    users.push(...batch.filter(user => String(user.email ?? '').endsWith('@goalloom.test')))
    if (batch.length < 200) break
  }
  return users
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. See supabase/README.md.')
    process.exit(1)
  }
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const removed = await removeSnapshotObjects(service)
  const users = await listTestUsers(url, serviceKey)
  for (const user of users) {
    await deleteUserData(service, user.id)
    await admin(url, serviceKey, `/auth/v1/admin/users/${user.id}`, { method: 'DELETE' })
    console.log(`deleted ${user.email}`)
  }
  console.log(`removed ${removed} snapshot object(s); deleted ${users.length} test user(s)`)
}
