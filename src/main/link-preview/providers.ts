/**
 * [INPUT]: Adapter-generated fixed HTTPS endpoints and their known public media URLs.
 * [OUTPUT]: Bounded metadata/image bytes through an isolated, credential-free Electron session.
 * [POS]: Trusted provider transport supporting system proxy/fake-IP networks; arbitrary pages use pinned public DNS.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Session } from 'electron'
import type { PublicResponse } from './transport'

export type PreviewProvider = 'x' | 'youtube'
let providerSession: Session | undefined

function allowed(url: URL, provider: PreviewProvider, image: boolean): boolean {
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.href.length > 4096) return false
  if (image) {
    return provider === 'youtube'
      ? url.hostname === 'i.ytimg.com' && /^\/vi(?:_webp)?\/[\w-]{11}\/[\w-]+\.(?:jpg|webp)$/.test(url.pathname)
      : url.hostname === 'pbs.twimg.com' && /^\/(?:media|amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\/[\w./-]+$/.test(url.pathname)
  }
  return provider === 'youtube' ? url.hostname === 'www.youtube.com' && url.pathname === '/oembed'
    : url.hostname === 'cdn.syndication.twimg.com' && url.pathname === '/tweet-result'
      || url.hostname === 'publish.twitter.com' && url.pathname === '/oembed'
}

export async function fetchProvider(input: string, provider: PreviewProvider, image: boolean, maxBytes: number, signal: AbortSignal): Promise<PublicResponse> {
  const url = new URL(input)
  if (!allowed(url, provider, image) || signal.aborted) throw new Error('Invalid preview provider endpoint')
  if (!providerSession) {
    const { session } = await import('electron')
    providerSession = session.fromPartition('goalloom-link-preview', { cache: false })
    providerSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    providerSession.setPermissionCheckHandler(() => false)
  }
  // Exact HTTPS endpoints, normal certificate verification and no redirects keep this
  // provider policy separate from the arbitrary-URL transport's DNS requirements.
  const response = await providerSession.fetch(url.href, {
    method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
    referrerPolicy: 'no-referrer', signal, bypassCustomProtocolHandlers: true,
    headers: { Accept: image ? 'image/png,image/jpeg,image/webp' : 'application/json' },
  })
  if (!response.ok || Number(response.headers.get('content-length')) > maxBytes || !response.body) {
    await response.body?.cancel()
    throw new Error('Preview provider unavailable')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > maxBytes) { await reader.cancel(); throw new Error('Preview provider response too large') }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  return { bytes: Buffer.concat(chunks), contentType: response.headers.get('content-type') ?? '', url: url.href }
}
