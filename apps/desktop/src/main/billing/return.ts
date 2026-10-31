/**
 * [INPUT]: Exact billing callback URLs, a pending device intent and the resolved locale.
 * [OUTPUT]: Strict finite callback parsing and a development-only loopback listener.
 * [POS]: OS/browser return boundary. A callback is only a request to reconcile, never payment evidence.
 */
import { createServer, type Server } from 'node:http'
import { billingCatalog } from '../../shared/i18n/billing'
import type { Locale } from '../../shared/i18n/locale'

export function parseBillingReturn(value: string, packaged: boolean, port?: number): string | null {
  if (value.length > 512) return null
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash) return null
    if (packaged ? url.protocol !== 'goalloom:' || url.hostname !== 'billing-return' || url.port || url.pathname !== ''
      : url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== String(port) || url.pathname !== '/billing-return') return null
    const entries = [...url.searchParams.keys()]
    if (entries.length !== 3 || new Set(entries).size !== 3 || entries.some(key => !['v', 'environment', 'continue'].includes(key))) return null
    const id = url.searchParams.get('continue')
    if (url.searchParams.get('v') !== '1' || url.searchParams.get('environment') !== (packaged ? 'production' : 'development')
      || !id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null
    return id
  } catch { return null }
}

export class BillingLoopback {
  private server: Server | null = null
  private port: number | null = null
  constructor(private receive: (url: string, port: number) => Promise<boolean>, private locale: () => Locale) {}
  async listen(savedPort?: number): Promise<number> {
    if (this.server && this.port !== null && (savedPort === undefined || savedPort === this.port)) return this.port
    this.close()
    const server = createServer((request, response) => {
      const port = this.port
      const target = `http://127.0.0.1:${port}${request.url ?? ''}`
      if (request.method !== 'GET' || port === null || request.headers.host !== `127.0.0.1:${port}` || !parseBillingReturn(target, false, port)) {
        response.writeHead(404, { 'cache-control': 'no-store' }); response.end(); return
      }
      void this.receive(target, port).then(accepted => {
        if (!accepted) { response.writeHead(404, { 'cache-control': 'no-store' }); response.end(); return }
        const t = billingCatalog[this.locale()]
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
          'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' })
        response.end(`<!doctype html><html lang="${this.locale()}"><meta charset="utf-8"><title>Goalloom</title><h1>${t.returnTitle}</h1><p>${t.returnNote}</p></html>`)
      }).catch(() => { response.writeHead(503, { 'cache-control': 'no-store' }); response.end() })
    })
    this.server = server
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(savedPort ?? 0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
      })
      const address = server.address()
      if (!address || typeof address === 'string' || address.port < 1024) throw Error('billing_unavailable')
      this.port = address.port
      server.unref()
      return address.port
    } catch (error) { this.close(); throw error }
  }
  close(): void { this.server?.close(); this.server = null; this.port = null }
}
