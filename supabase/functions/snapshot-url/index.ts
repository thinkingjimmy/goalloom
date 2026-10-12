// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU Affero General Public License v3.0 only. See supabase/LICENSE.
//
// Signs a Storage URL only after snapshot_access accepts the device, workspace and path.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come from the function runtime. Do not commit them.
// Download URLs expire in 60 seconds.
// Upload URLs are fixed at 2 hours by Storage. The upload-sign endpoint does not take expiresIn.
// x-upsert is required when the object already exists; a retry otherwise gets 409.

const url = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

function storageMessage(detail: string) {
  let text = detail
  try {
    const parsed = JSON.parse(detail) as { message?: string; error?: string }
    text = parsed.message || parsed.error || detail
  } catch {
    text = detail
  }
  return text.replace(/\s+/g, ' ').slice(0, 180)
}

Deno.serve(async (request: Request) => {
  if (!url || !serviceKey) return new Response('snapshot signing is not configured', { status: 503 })
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return new Response('unauthorized', { status: 401 })
  const body = await request.json() as { deviceId?: string; workspaceId?: string; seq?: number; path?: string; method?: string }
  const access = await fetch(`${url}/rest/v1/rpc/snapshot_access`, {
    method: 'POST',
    headers: { authorization: header, apikey: serviceKey, 'content-type': 'application/json' },
    body: JSON.stringify({ p_device: body.deviceId, p_workspace: body.workspaceId, p_seq: body.seq, p_path: body.path }),
  })
  const rows = access.ok ? await access.json() : null
  if (!Array.isArray(rows) || rows.length === 0) return new Response('snapshot access rejected', { status: 403 })
  const method = body.method === 'upload' ? 'upload' : 'download'
  const expiresIn = method === 'upload' ? 7200 : 60
  const encoded = String(body.path).split('/').map(part => encodeURIComponent(part)).join('/')
  const endpoint = method === 'upload'
    ? `${url}/storage/v1/object/upload/sign/snapshots/${encoded}`
    : `${url}/storage/v1/object/sign/snapshots/${encoded}`
  const headers: Record<string, string> = {
    authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    'content-type': 'application/json',
  }
  if (method === 'upload') headers['x-upsert'] = 'true'
  const signed = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: method === 'upload' ? '{}' : JSON.stringify({ expiresIn }),
  })
  if (!signed.ok) {
    const detail = await signed.text()
    const missing = signed.status === 404 || /not found|not_found/i.test(detail)
    if (method === 'download' && missing) return new Response('object not found', { status: 404 })
    return new Response(`storage signing failed: ${signed.status} ${storageMessage(detail)}`, { status: 502 })
  }
  const payload = await signed.json() as { signedURL?: string; signedUrl?: string; url?: string }
  const token = payload.signedURL ?? payload.signedUrl ?? payload.url
  if (!token) return new Response('storage did not return a signed url', { status: 502 })
  const signedUrl = token.startsWith('http') ? token : `${url}/storage/v1${token.startsWith('/') ? '' : '/'}${token}`
  return new Response(JSON.stringify({ method, expiresIn, path: body.path, signedUrl }), {
    headers: { 'content-type': 'application/json' },
  })
})
