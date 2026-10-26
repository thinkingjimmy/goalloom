// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Bounded request bytes and timestamped provider HMAC headers.
 * [OUTPUT]: Byte-exact signature verification, finite JSON and credential-free responses.
 * [POS]: Billing transport safety shared by authenticated actions and signed ingress.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const reply = (data: unknown, status = 200, origin?: string) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff',
    ...(origin ? { 'access-control-allow-origin': origin, 'vary': 'Origin' } : {}) },
})
export async function boundedBytes(request: Request | Response, max = 256 * 1024): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > max) throw Error('too_large')
  const reader = request.body?.getReader()
  if (!reader) throw Error('invalid_request')
  const chunks: Uint8Array[] = []; let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      length += value.byteLength; if (length > max) throw Error('too_large'); chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  const result = new Uint8Array(length); let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}
export async function rawBody(request: Request, max = 256 * 1024): Promise<string> {
  const result = await boundedBytes(request, max)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(result) }
  catch { throw Error('invalid_request') }
}
export function parseJson<T>(raw: string): T {
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_request')
    return value as T
  } catch { throw Error('invalid_request') }
}
export async function verifyHmac(body: string, header: string | null, secret: string, now = Date.now()): Promise<boolean> {
  if (!header || !secret) return false
  const parts = header.split(',').map(part => part.trim().split('='))
  const stamps = parts.filter(([name]) => name === 't'), signatures = parts.filter(([name]) => name === 'v1')
  if (stamps.length !== 1 || !/^\d{10,12}$/.test(stamps[0][1] ?? '')) return false
  const stamp = stamps[0][1]
  if (Math.abs(now / 1000 - Number(stamp)) > 300) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  for (const [, value] of signatures) {
    if (!/^[0-9a-f]{64}$/i.test(value ?? '')) continue
    const bytes = Uint8Array.from(value.match(/../g)!, byte => parseInt(byte, 16))
    if (await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`${stamp}.${body}`))) return true
  }
  return false
}
export async function secretMatches(value: string | null, secret: string): Promise<boolean> {
  if (!value || !secret) return false
  const bytes = new TextEncoder(), key = await crypto.subtle.importKey('raw', bytes.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign','verify'])
  const signature = await crypto.subtle.sign('HMAC', key, bytes.encode(secret))
  return crypto.subtle.verify('HMAC', key, signature, bytes.encode(value))
}
