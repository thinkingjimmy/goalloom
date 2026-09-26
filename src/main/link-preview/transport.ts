/**
 * [INPUT]: Untrusted public HTTP(S) URLs and a caller-owned cancellation signal.
 * [OUTPUT]: Bounded response bytes after public-address, redirect and pinned-DNS checks.
 * [POS]: Main-process preview network boundary; never uses Electron sessions or credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { normalizeLinkUrl } from '../../shared/links'

const deniedV4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) deniedV4.addSubnet(address, prefix, 'ipv4')
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
const deniedV6 = new BlockList()
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) {
  deniedV6.addSubnet(address, prefix, 'ipv6')
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  return family === 4 ? !deniedV4.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !deniedV6.check(address, 'ipv6')
}

export function publicUrl(input: string): URL {
  const normalized = normalizeLinkUrl(input)
  if (!normalized) throw new Error('Invalid preview URL')
  const url = new URL(normalized)
  if (url.port) throw new Error('Invalid preview URL')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
  if ((!host.includes('.') && !isIP(host)) || /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid|example)$/.test(host)) throw new Error('Non-public preview host')
  if (isIP(host) && !isPublicAddress(host)) throw new Error('Non-public preview address')
  return url
}

function aborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(new Error('Preview request cancelled'))
    if (signal.aborted) { stop(); return }
    signal.addEventListener('abort', stop, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop))
  })
}

export interface PublicResponse { bytes: Buffer; contentType: string; url: string }

export async function fetchPublic(input: string, maxBytes: number, signal: AbortSignal, accept: string): Promise<PublicResponse> {
  let url = publicUrl(input)
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (signal.aborted) throw new Error('Preview request cancelled')
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const records = isIP(host) ? [{ address: host, family: isIP(host) }]
      : await aborted(lookup(host, { all: true, verbatim: true }), signal)
    if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error('Non-public preview destination')
    const approved = records.find(record => record.family === 4) ?? records[0]!
    const response = await new Promise<PublicResponse | { redirect: string }>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
        method: 'GET', agent: false, signal, maxHeaderSize: 16 * 1024,
        headers: { Accept: accept, 'Accept-Encoding': 'identity', 'User-Agent': 'Goalloom-LinkPreview/1.0' },
        // Keep the original host for TLS/Host, while connecting only to the checked address.
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address: approved.address, family: approved.family }])
          else callback(null, approved.address, approved.family)
        },
      }, incoming => {
        const status = incoming.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status)) {
          incoming.destroy()
          if (!incoming.headers.location) reject(new Error('Missing preview redirect'))
          else resolve({ redirect: incoming.headers.location })
          return
        }
        if (status < 200 || status >= 300 || incoming.headers['content-encoding'] && incoming.headers['content-encoding'] !== 'identity') {
          incoming.destroy(); reject(new Error('Preview response unavailable')); return
        }
        if (Number(incoming.headers['content-length']) > maxBytes) {
          incoming.destroy(); reject(new Error('Preview response too large')); return
        }
        const chunks: Buffer[] = []
        let size = 0
        incoming.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) { incoming.destroy(); reject(new Error('Preview response too large')); return }
          chunks.push(chunk)
        })
        incoming.on('end', () => resolve({ bytes: Buffer.concat(chunks), contentType: incoming.headers['content-type'] ?? '', url: url.href }))
        incoming.on('error', reject)
        incoming.on('aborted', () => reject(new Error('Preview response interrupted')))
      })
      request.on('socket', socket => {
        socket.once('connect', () => {
          // Also check the actual socket; a custom resolver must not be the sole guard.
          const actual = socket.remoteAddress?.replace(/^::ffff:/, '')
          if (!actual || !isPublicAddress(actual)) request.destroy(new Error('Non-public preview socket'))
        })
      })
      request.setTimeout(6000, () => request.destroy(new Error('Preview request timed out')))
      request.on('error', reject)
      request.end()
    })
    if ('bytes' in response) return response
    if (redirects === 3) throw new Error('Too many preview redirects')
    const next = publicUrl(new URL(response.redirect, url).href)
    if (url.protocol === 'https:' && next.protocol !== 'https:') throw new Error('Insecure preview redirect')
    url = next
  }
  throw new Error('Preview unavailable')
}
