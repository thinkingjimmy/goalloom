/**
 * [INPUT]: Real Electron/main/preload and controlled HTTP/DNS response boundaries.
 * [OUTPUT]: Deterministic favicon parsing, raster/ICO and rejection evidence.
 * [POS]: Desktop-only transport fixture; never contacts an external server.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

export async function verifyFaviconTransport(app, page) {
  await app.evaluate(() => {
    const dns = process.getBuiltinModule('dns/promises'), http = process.getBuiltinModule('http'), https = process.getBuiltinModule('https')
    const { EventEmitter } = process.getBuiltinModule('events')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
    const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[6] = 1; header[7] = 1; header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18)
    const ico = Buffer.concat([header, png])
    const original = { dns: dns.lookup, http: http.request, https: https.request }
    const probe = { requests: [], lookups: [], restore() { dns.lookup = original.dns; http.request = original.http; https.request = original.https; process.getBuiltinModule('module').syncBuiltinESMExports() } }
    globalThis.faviconProbe = probe
    dns.lookup = async host => { probe.lookups.push(host); return [{ address: '93.184.215.14', family: 4 }] }
    const request = (url, options, receive) => {
      probe.requests.push(url.href)
      const req = new EventEmitter(); req.setTimeout = () => req; req.destroy = error => { if (error) req.emit('error', error); return req }
      req.end = () => queueMicrotask(() => {
        const socket = new EventEmitter(); socket.remoteAddress = '93.184.215.14'; req.emit('socket', socket); socket.emit('connect')
        const incoming = new EventEmitter(); incoming.destroy = () => { incoming.closed = true }
        incoming.statusCode = 200; incoming.headers = { 'content-type': 'image/png' }
        const mode = url.hostname.split('.')[0]
        let body = png
        if (url.pathname === '/page') {
          const href = mode === 'private' ? 'https://127.0.0.1/icon.png' : '/declared-icon'
          body = Buffer.from(`<meta property="og:title" content="Controlled ${mode}">${mode === 'fallback' ? '' : `<link rel="icon" href="${href}">`}`)
          incoming.headers['content-type'] = 'text/html'
        } else if (mode === 'ico' || mode === 'fallback') { body = ico; incoming.headers['content-type'] = 'image/x-icon' }
        else if (url.pathname === '/favicon.ico' && mode !== 'png') { incoming.statusCode = 404; body = Buffer.alloc(0) }
        else if (mode === 'svg') { body = Buffer.from('<svg onload="alert(1)"></svg>'); incoming.headers['content-type'] = 'image/svg+xml' }
        else if (mode === 'large') incoming.headers['content-length'] = '400000'
        else if (mode === 'redirect') { incoming.statusCode = 302; incoming.headers.location = 'https://127.0.0.1/secret' }
        else if (mode === 'broken') body = Buffer.from([0, 0, 1, 0, 255, 255])
        receive(incoming)
        if (!incoming.closed) { incoming.emit('data', body); incoming.emit('end') }
      })
      return req
    }
    http.request = request; https.request = request
    process.getBuiltinModule('module').syncBuiltinESMExports()
  })
  try {
    const results = []
    for (const mode of ['png', 'ico', 'fallback', 'private', 'svg', 'large', 'redirect', 'broken']) {
      const value = await page.evaluate(mode => window.goalloom.getLinkPreview(`https://${mode}.example.com/page`), mode)
      assert.equal(value.status, 'ready'); assert.equal(value.title, `Controlled ${mode}`)
      if (['png', 'ico', 'fallback'].includes(mode)) assert.match(value.favicon, new RegExp(`^data:image/${mode === 'png' ? 'png' : 'x-icon'};base64,`))
      else assert.equal(value.favicon, null, `${mode}: icon failure must keep page metadata`)
      results.push({ mode, status: value.status, favicon: value.favicon?.split(',')[0] ?? null })
    }
    const traffic = await app.evaluate(() => ({ requests: globalThis.faviconProbe.requests, lookups: globalThis.faviconProbe.lookups }))
    assert(traffic.requests.every(url => !url.includes('127.0.0.1')))
    assert(traffic.lookups.every(host => !host.includes('127.0.0.1')))
    return { results, traffic, scope: 'Production IPC, metadata parser, cache and pinned transport with synthetic DNS/HTTP responses; no live network.' }
  } finally { await app.evaluate(() => globalThis.faviconProbe.restore()) }
}
