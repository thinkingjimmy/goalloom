import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { RollupLog, LoggingFunction } from 'rollup'

// zod ships /*#__PURE__*/ hints Rollup cannot place; the notice is harmless noise in every build.
const onwarn = (warning: RollupLog, warn: LoggingFunction) => { if (warning.code !== 'INVALID_ANNOTATION' || !warning.id?.includes('/zod/')) warn(warning) }
const debugRoot = process.env.GOALLOOM_DEBUG_BUILD ? resolve('output/private-debug') : null

export default defineConfig({
  main: {
    esbuild: { keepNames: true },
    build: {
      externalizeDeps: false,
      minify: 'esbuild', sourcemap: debugRoot ? 'hidden' : false,
      outDir: resolve(debugRoot ?? 'out', 'main'),
      rollupOptions: { onwarn, input: { index: resolve('src/main/index.ts'), storage: resolve('src/main/storage/worker.ts') } },
    },
  },
  preload: {
    esbuild: { keepNames: true },
    plugins: [{ name: 'preload-dependency-boundary', generateBundle() {
      for (const id of this.getModuleIds()) if (/\/(?:domain\/calendar|shared\/i18n\/server)\.ts$|\/@js-temporal\//.test(id)) this.error(`Preload must use lightweight wire validation: ${id}`)
    } }],
    build: { externalizeDeps: false, minify: 'esbuild', sourcemap: debugRoot ? 'hidden' : false, outDir: resolve(debugRoot ?? 'out', 'preload'), rollupOptions: { onwarn, output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    build: { minify: true, sourcemap: debugRoot ? 'hidden' : false, outDir: resolve(debugRoot ?? 'out', 'renderer'), rollupOptions: { onwarn } },
    resolve: { alias: { '@': resolve('src/renderer') } },
    plugins: [react(), tailwindcss()],
  },
})
