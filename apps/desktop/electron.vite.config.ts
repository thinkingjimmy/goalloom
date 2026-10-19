/**
 * [INPUT]: Desktop entries, dependency boundaries, sync build configuration and macOS native policy compiler.
 * [OUTPUT]: Main/preload/renderer bundles with platform-specific native credentials support.
 * [POS]: Desktop build composition; development/debug output follows the same runtime boundaries.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { RollupLog, LoggingFunction } from 'rollup'
import type { Plugin } from 'vite'
import { syncBuildDefine } from './scripts/build/sync-define'
import { keychainPolicy } from './scripts/build/keychain-policy'

// zod ships /*#__PURE__*/ hints Rollup cannot place; the notice is harmless noise in every build.
const onwarn = (warning: RollupLog, warn: LoggingFunction) => { if (warning.code !== 'INVALID_ANNOTATION' || !warning.id?.includes('/zod/')) warn(warning) }
const debugRoot = process.env.GOALLOOM_DEBUG_BUILD ? resolve('output/private-debug') : null
const syncEnvironment = process.env.GOALLOOM_BUILD_ENV === 'production' ? 'production' : 'development'
let localSync: NodeJS.ProcessEnv = {}
try { localSync = parseEnv(readFileSync(resolve(`../../.env.sync.${syncEnvironment}.local`), 'utf8')) } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

function runtimeBoundary(renderer = false): Plugin {
  return { name: 'runtime-dependency-boundary', generateBundle() {
    for (const id of this.getModuleIds()) {
      if (/\/(?:@js-temporal\/polyfill|jsbi)\//.test(id)) this.error(`Use the pinned Electron runtime's native Temporal: ${id}`)
      if (renderer && /\/zod\//.test(id)) this.error(`Renderer must import lightweight values; IPC validation belongs to main/preload: ${id}`)
    }
  } }
}

export default defineConfig({
  main: {
    define: syncBuildDefine({ ...localSync, ...process.env }),
    plugins: [runtimeBoundary(), keychainPolicy()],
    esbuild: { keepNames: true },
    build: {
      externalizeDeps: false,
      minify: 'esbuild', sourcemap: debugRoot ? 'hidden' : false,
      outDir: resolve(debugRoot ?? 'out', 'main'),
      // Bundle @supabase/supabase-js. electron-builder ships no node_modules, and a bare import crashes an installed app. GoTrue's unused http://localhost:9999 default is allowlisted in the production check; the desktop always passes the configured project URL.
      rollupOptions: { onwarn, input: { index: resolve('src/main/index.ts'), storage: resolve('src/main/storage/worker.ts') } },
    },
  },
  preload: {
    esbuild: { keepNames: true },
    plugins: [runtimeBoundary(), { name: 'preload-dependency-boundary', generateBundle() {
      for (const id of this.getModuleIds()) if (/\/(?:domain\/calendar|shared\/i18n\/server)\.ts$|\/@js-temporal\//.test(id)) this.error(`Preload must use lightweight wire validation: ${id}`)
    } }],
    build: { externalizeDeps: false, minify: 'esbuild', sourcemap: debugRoot ? 'hidden' : false, outDir: resolve(debugRoot ?? 'out', 'preload'), rollupOptions: { onwarn, output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    build: { minify: true, sourcemap: debugRoot ? 'hidden' : false, outDir: resolve(debugRoot ?? 'out', 'renderer'), rollupOptions: { onwarn } },
    resolve: { alias: { '@': resolve('src/renderer') } },
    plugins: [react(), tailwindcss(), runtimeBoundary(true)],
  },
})
