/**
 * [INPUT]: Desktop renderer sources and the local review entry points.
 * [OUTPUT]: Loopback-only UI review server, separate from packaged application entries.
 * [POS]: Development tooling; no Electron, credentials, database or cloud transport.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { serverText } from '../src/shared/i18n/server'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../src/renderer', import.meta.url)) } },
  plugins: [react(), tailwindcss(), { name: 'local-review-evidence', configureServer(server) {
    const nativeDirectory = fileURLToPath(new URL('../output/tests/error-ui-review/native/', import.meta.url))
    server.middlewares.use('/__native-cases', (_request, response) => {
      const text = serverText()
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ dialogs: text.dialogs, storage: text.storage, detail: text.dialogs.startupDetail(null, '/Review/Goalloom/backups', '/Review/Goalloom/workspace.sqlite') }))
    })
    server.middlewares.use('/__native-captures', async (request, response) => {
      const name = request.url?.slice(1)
      if (!name || !/^native-[a-zA-Z]+\.png$/.test(name)) { response.statusCode = 404; response.end(); return }
      try { const data = await readFile(nativeDirectory + name); response.setHeader('Content-Type', 'image/png'); response.end(data) }
      catch { response.statusCode = 404; response.end() }
    })
    server.middlewares.use('/__review-report', async (request, response) => {
      if (request.method !== 'POST' || request.headers.origin !== 'http://127.0.0.1:4179') { response.statusCode = 403; response.end(); return }
      let body = ''
      for await (const chunk of request) { body += chunk; if (body.length > 4_000_000) { response.statusCode = 413; response.end(); return } }
      const report: unknown = JSON.parse(body)
      const directory = fileURLToPath(new URL('../output/tests/error-ui-review/', import.meta.url))
      await mkdir(directory, { recursive: true })
      await writeFile(directory + 'report.json', JSON.stringify(report, null, 2))
      response.setHeader('Content-Type', 'application/json'); response.end('{"saved":true}')
    })
  } }],
  server: { host: '127.0.0.1', port: 4179, strictPort: true, fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] } },
})
