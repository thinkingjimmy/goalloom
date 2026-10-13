/**
 * [INPUT]: Supabase URL, anon key, and the system browser.
 * [OUTPUT]: An auth session from the Google PKCE redirect on 127.0.0.1:53682.
 * [POS]: Desktop sign-in. The goalloom:// scheme stays reserved for local pages.
 */
import { createServer, type Server } from 'node:http'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { SyncFailure } from '@goalloom/sync'

export const oauthPort = 53682
export const oauthRedirect = `http://127.0.0.1:${oauthPort}/callback`

const memory = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

export function supabaseClient(url: string, anonKey: string, persist = memory()): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: persist },
  })
}

export async function googleSignIn(client: SupabaseClient, open: (url: string) => Promise<void>): Promise<Session> {
  const started = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: oauthRedirect, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  })
  if (started.error || !started.data.url) throw new SyncFailure('auth', started.error?.message ?? 'oauth')
  const code = await listenForCode(open, started.data.url)
  const exchanged = await client.auth.exchangeCodeForSession(code)
  if (exchanged.error || !exchanged.data.session) throw new SyncFailure('auth', exchanged.error?.message ?? 'oauth')
  return exchanged.data.session
}

function listenForCode(open: (url: string) => Promise<void>, url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let server: Server | null = null
    let settled = false
    const timer = setTimeout(() => { finish(new SyncFailure('auth', 'timeout')) }, 180_000)
    const finish = (error: Error | null, code?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server?.close()
      if (error) reject(error)
      else resolve(code ?? '')
    }
    server = createServer((request, response) => {
      const parsed = new URL(request.url ?? '/', oauthRedirect)
      if (parsed.pathname !== '/callback') { response.writeHead(404); response.end(); return }
      const oauthError = parsed.searchParams.get('error_description') || parsed.searchParams.get('error')
      const code = parsed.searchParams.get('code')
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><title>Goalloom</title><p>Goalloom 已收到登录结果，可以关闭这个页面。</p><p>You can close this page and return to Goalloom.</p>')
      if (oauthError || !code) finish(new SyncFailure('auth', oauthError ?? 'missing code'))
      else finish(null, code)
    })
    server.once('error', () => finish(new SyncFailure('rejected', 'port')))
    server.listen(oauthPort, '127.0.0.1', () => { void open(url).catch(error => finish(error instanceof Error ? error : new SyncFailure('auth'))) })
  })
}
