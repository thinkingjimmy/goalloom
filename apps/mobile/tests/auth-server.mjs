/**
 * [INPUT]: Local native E2E provider intents; no real user credentials.
 * [OUTPUT]: Synthetic Supabase-compatible token sessions and content-free scenario control.
 * [POS]: Loopback-only native Auth fixture. It never reaches hosted Supabase.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createServer } from 'node:http'
const userId = '11111111-1111-4111-8111-111111111111'
let mode = 'success'
let provider = 'apple'
const jwt = () => [{ alg: 'HS256', typ: 'JWT' }, { sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: '22222222-2222-4222-8222-222222222222' }].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic'
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:54389')
  let body = ''
  for await (const chunk of request) body += chunk
  response.setHeader('content-type', 'application/json')
  if (url.pathname === '/fixture/health') { response.end(JSON.stringify({ scope: 'goalloom-native-auth-fixture' })); return }
  if (url.pathname === '/fixture/mode') { mode = url.searchParams.get('value') || 'success'; response.end('{}'); return }
  if (url.pathname === '/fixture/authorize') { provider = url.searchParams.get('provider') || 'apple'; response.end(JSON.stringify({ mode })); return }
  if (url.pathname === '/auth/v1/logout') { response.end('{}'); return }
  if (url.pathname === '/auth/v1/token') {
    const value = JSON.parse(body || '{}')
    if (!['id_token', 'refresh_token'].includes(url.searchParams.get('grant_type'))) { response.writeHead(400); response.end('{"msg":"Unsupported fixture grant"}'); return }
    if (value.provider) provider = value.provider
    response.end(JSON.stringify({ access_token: jwt(), refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600,
      user: { id: userId, email: 'native@example.invalid', aud: 'authenticated', role: 'authenticated',
        user_metadata: { fixturePadding: 'synthetic'.repeat(4096) }, app_metadata: { provider, providers: [provider] } } }))
    return
  }
  response.writeHead(404); response.end('{"message":"Unexpected fixture request"}')
})
server.listen(54389, '127.0.0.1', () => console.log('Synthetic native Auth listening on 127.0.0.1:54389'))
