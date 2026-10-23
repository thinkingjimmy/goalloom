/**
 * [INPUT]: An explicit HTTP request and a caller-proven read-only recovery flag.
 * [OUTPUT]: One response or a transport error; safe metadata reads may retry once.
 * [POS]: Credential-free deployment transport shared by isolated environment clients.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
export async function requestTransport(url, init, recoverRead = false) {
  for (let attempt = 0; ; attempt++) {
    try { return await fetch(url, init) }
    catch (error) { if (!recoverRead || attempt === 1) throw error }
  }
}
export function readFetch(url, init = {}) {
  assert(!init.method || init.method === 'GET', 'Metadata recovery requires GET')
  return requestTransport(url, init, true)
}
