// Signs a Storage URL only after snapshot_access accepts the device, workspace and path.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come from the function runtime. Do not commit them.
// Upload URLs use createSignedUploadUrl (host-enforced 2h). Download URLs expire in 60 seconds.

const url = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

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
  if (!access.ok) return new Response('snapshot access rejected', { status: 403 })
  return new Response(JSON.stringify({ method: body.method === 'upload' ? 'createSignedUploadUrl' : 'createSignedUrl', expiresIn: body.method === 'upload' ? 7200 : 60, path: body.path }), {
    headers: { 'content-type': 'application/json' },
  })
})
