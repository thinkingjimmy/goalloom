import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { RollupLog, LoggingFunction } from 'rollup'

// zod ships /*#__PURE__*/ hints Rollup cannot place; the notice is harmless noise in every build.
const onwarn = (warning: RollupLog, warn: LoggingFunction) => { if (warning.code !== 'INVALID_ANNOTATION' || !warning.id?.includes('/zod/')) warn(warning) }

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: { onwarn, input: { index: resolve('src/main/index.ts'), storage: resolve('src/main/storage/worker.ts') } },
    },
  },
  preload: {
    build: { externalizeDeps: false, rollupOptions: { onwarn, output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    build: { minify: true, rollupOptions: { onwarn } },
    resolve: { alias: { '@': resolve('src/renderer') } },
    plugins: [react(), tailwindcss()],
  },
})
