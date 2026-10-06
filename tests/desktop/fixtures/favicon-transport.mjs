/**
 * [INPUT]: Real Electron/main/preload and controlled HTTP/DNS response boundaries.
 * [OUTPUT]: Deterministic favicon parsing, raster/ICO, fake-IP pin and rejection evidence.
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
    const answers = {
      'fakeip.example.com': [{ address: '198.18.0.11', family: 4 }],
      'lan.example.com': [{ address: '10.1.2.3', family: 4 }],
      'mixed.example.com': [{ address: '198.18.0.11', family: 4 }, { address: '10.1.2.3', family: 4 }],
      'split.example.com': [{ address: '93.184.215.14', family: 4 }, { address: '198.18.0.9', family: 4 }],
    }
    const probe = { requests: [], sockets: [], lookups: [], restore() { dns.lookup = original.dns; http.request = original.http; https.request = original.https; process.getBuiltinModule('module').syncBuiltinESMExports() } }
    globalThis.faviconProbe = probe
    dns.lookup = async host => { probe.lookups.push(host); return answers[host] ?? [{ address: '93.184.215.14', family: 4 }] }
    const request = (url, options, receive) => {
      let pinned = '93.184.215.14'
      options.lookup?.(url.hostname, {}, (_error, address) => { pinned = String(address) })
      probe.requests.push(url.href)
      probe.sockets.push(pinned)
      const req = new EventEmitter(); req.setTimeout = () => req; req.destroy = error => { if (error) req.emit('error', error); return req }
      req.end = () => queueMicrotask(() => {
        const socket = new EventEmitter(); socket.remoteAddress = pinned; req.emit('socket', socket); socket.emit('connect')
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
    const before = await app.evaluate(() => globalThis.faviconProbe.requests.length)
    const fakeIp = await page.evaluate(() => window.goalloom.getLinkPreview('https://fakeip.example.com/page'))
    const split = await page.evaluate(() => window.goalloom.getLinkPreview('https://split.example.com/page'))
    const lan = await page.evaluate(() => window.goalloom.getLinkPreview('https://lan.example.com/page'))
    const mixed = await page.evaluate(() => window.goalloom.getLinkPreview('https://mixed.example.com/page'))
    const literal = await page.evaluate(() => window.goalloom.getLinkPreview('https://198.18.0.11/secret'))
    assert.equal(fakeIp.status, 'ready'); assert.equal(fakeIp.title, 'Controlled fakeip')
    assert.equal(split.status, 'ready'); assert.equal(split.title, 'Controlled split')
    for (const value of [lan, mixed, literal]) assert.equal(value.status, 'unavailable')
    const traffic = await app.evaluate(start => {
      const requests = globalThis.faviconProbe.requests, sockets = globalThis.faviconProbe.sockets
      const socketFor = prefix => sockets[requests.findIndex(url => url.startsWith(prefix))]
      return { requests, lookups: globalThis.faviconProbe.lookups, added: requests.slice(start), fakeSocket: socketFor('https://fakeip.example.com/page'), splitSocket: socketFor('https://split.example.com/page') }
    }, before)
    assert(traffic.requests.every(url => !url.includes('127.0.0.1') && !url.includes('198.18.0.11') && !url.includes('10.1.2.3')))
    assert(traffic.lookups.includes('lan.example.com') && traffic.lookups.includes('mixed.example.com') && !traffic.lookups.includes('198.18.0.11'))
    assert.equal(traffic.fakeSocket, '198.18.0.11')
    assert.equal(traffic.splitSocket, '93.184.215.14')
    assert(!traffic.added.some(url => url.includes('lan.example.com') || url.includes('mixed.example.com') || url.includes('198.18.0.11')))
    return { results, fakeIp: { status: fakeIp.status, title: fakeIp.title, socket: traffic.fakeSocket }, split: { status: split.status, socket: traffic.splitSocket }, lan: lan.status, mixed: mixed.status, literal: literal.status, scope: 'Production IPC, metadata parser, cache and pinned transport with synthetic DNS/HTTP responses; no live network.' }
  } finally { await app.evaluate(() => globalThis.faviconProbe.restore()) }
}
