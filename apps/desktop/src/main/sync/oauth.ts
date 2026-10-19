/**
 * [INPUT]: Supabase URL, anon key, and the system browser.
 * [OUTPUT]: An auth session from the Google PKCE redirect on 127.0.0.1:53682.
 *          The loopback page is sent only after the code exchange, so it shows success or failure.
 * [POS]: Desktop sign-in. The loopback page is the site header and footer; success asks the OS to focus the app.
 */
import { createServer, type Server, type ServerResponse } from 'node:http'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { SyncFailure } from '@goalloom/sync'
import { callbackCsp, callbackPage } from './callback-page'

export const oauthPort = 53682
export const oauthTimeoutMs = 180_000
export const oauthRedirect = `http://127.0.0.1:${oauthPort}/callback`

export interface OAuthListenOptions {
  language?: string
  returnToApp?: boolean
  port?: number
  timeoutMs?: number
  onReady?: (port: number) => void
  /** The browser step finished and a result page was sent. The main process uses this to focus its window. */
  onCallback?: () => void
  signal?: AbortSignal
}

const memory = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

export function supabaseClient(url: string, anonKey: string, persist = memory(), transport?: typeof fetch): SupabaseClient {
  return createClient(url, anonKey, {
    ...(transport ? { global: { fetch: transport } } : {}),
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: persist },
  })
}

export async function googleSignIn(client: SupabaseClient, open: (url: string) => Promise<void>, options?: OAuthListenOptions): Promise<Session> {
  const started = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: oauthRedirect, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  })
  if (started.error || !started.data.url) throw new SyncFailure('auth', started.error?.message ?? 'oauth')
  return listenForSession(client, open, started.data.url, options)
}

function sendPage(response: ServerResponse, failed: boolean, options?: OAuthListenOptions): void {
  if (response.writableEnded || response.destroyed) return
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': callbackCsp,
  })
  response.end(callbackPage(failed, options))
}

function listenForSession(client: SupabaseClient, open: (url: string) => Promise<void>, url: string, options?: OAuthListenOptions): Promise<Session> {
  const port = options?.port ?? oauthPort
  const timeoutMs = options?.timeoutMs ?? oauthTimeoutMs
  return new Promise((resolve, reject) => {
    let server: Server | null = null
    let settled = false
    let accepted = false
    const timer = setTimeout(() => { if (!accepted) finish(new SyncFailure('auth', 'timeout')) }, timeoutMs)
    const finish = (error: Error | null, session: Session | null = null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options?.signal?.removeEventListener('abort', onAbort)
      server?.close()
      if (error || !session) reject(error ?? new SyncFailure('auth', 'oauth'))
      else resolve(session)
    }
    const reply = (response: ServerResponse, failed: boolean) => {
      sendPage(response, failed, options)
      try { options?.onCallback?.() } catch { /* Focusing the window must not change the session result. */ }
    }
    const onAbort = () => finish(new SyncFailure('auth', 'cancelled'))
    if (options?.signal?.aborted) { finish(new SyncFailure('auth', 'cancelled')); return }
    options?.signal?.addEventListener('abort', onAbort, { once: true })
    server = createServer((request, response) => {
      let parsed: URL
      try { parsed = new URL(request.url ?? '/', oauthRedirect) }
      catch { response.writeHead(400); response.end(); return }
      if (parsed.pathname !== '/callback') { response.writeHead(404); response.end(); return }
      if (settled || accepted) { response.writeHead(409); response.end(); return }
      accepted = true
      clearTimeout(timer)
      const oauthError = parsed.searchParams.get('error_description') || parsed.searchParams.get('error')
      const code = parsed.searchParams.get('code')
      if (oauthError || !code) {
        reply(response, true)
        finish(new SyncFailure('auth', oauthError ?? 'missing code'))
        return
      }
      void client.auth.exchangeCodeForSession(code).then(exchanged => {
        if (exchanged.error || !exchanged.data.session) {
          reply(response, true)
          finish(new SyncFailure('auth', exchanged.error?.message ?? 'oauth'))
          return
        }
        reply(response, false)
        finish(null, exchanged.data.session)
      }).catch(error => {
        reply(response, true)
        finish(error instanceof Error ? error : new SyncFailure('auth'))
      })
    })
    server.once('error', () => finish(new SyncFailure('rejected', 'port')))
    server.listen(port, '127.0.0.1', () => {
      const address = server?.address()
      const bound = typeof address === 'object' && address ? address.port : port
      options?.onReady?.(bound)
      void open(url).catch(error => finish(error instanceof Error ? error : new SyncFailure('auth')))
    })
  })
}
