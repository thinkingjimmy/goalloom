/**
 * [INPUT]: 受控 renderer 根目录与请求 URL；Electron 协议和窗口 API。
 * [OUTPUT]: 本地资源响应、生产 CSP 与默认拒绝的权限/导航策略。
 * [POS]: main 安全边界，开发服务器不进入生产信任集合。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import type { BrowserWindow, Session } from 'electron'

export const appOrigin = 'goalloom://app'
export const productionCsp = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:", "font-src 'self'", "connect-src 'none'",
  "object-src 'none'", "base-uri 'none'", "frame-src 'none'",
  "frame-ancestors 'none'", "form-action 'none'",
].join('; ')

export function isTrustedFrameUrl(actual: string, expected: string): boolean {
  try {
    const url = new URL(actual)
    url.hash = ''
    return url.href === expected
  } catch { return false }
}

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
}

export function localResource(root: string, requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl)
    if (url.protocol !== 'goalloom:' || url.host !== 'app' || url.username || url.password) return null
    const pathname = decodeURIComponent(url.pathname)
    if (pathname.includes('\\') || pathname.includes('\0')) return null
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
    const relativePath = relative(root, path)
    return relativePath.startsWith('..') || isAbsolute(relativePath) || !mime[extname(path)] ? null : path
  } catch { return null }
}

export async function serveResource(root: string, request: Request): Promise<Response> {
  const path = localResource(root, request.url)
  const headers = { 'Content-Security-Policy': productionCsp, 'X-Content-Type-Options': 'nosniff' }
  if (!path || request.method !== 'GET') return new Response(null, { status: 403, headers })
  try {
    return new Response(await readFile(path), { headers: { ...headers, 'Content-Type': mime[extname(path)]! } })
  } catch { return new Response(null, { status: 404, headers }) }
}

export function restrictSession(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
  session.on('will-download', event => event.preventDefault())
}

export function restrictWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.on('will-attach-webview', event => event.preventDefault())
}
